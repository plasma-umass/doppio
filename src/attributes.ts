"use strict";
import util = require('./util');
import opcodes = require('./opcodes');
import ConstantPool = require('./ConstantPool');
declare var RELEASE: boolean;

export interface Attribute {
  name: string;
  parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void;
}

export class ExceptionHandler implements Attribute {
  public name = 'ExceptionHandler';
  public start_pc: number;
  public end_pc: number;
  public handler_pc: number;
  public catch_type: string;
  public parse(bytes_array:util.BytesArray, constant_pool:ConstantPool.ConstantPool): void {
    this.start_pc = bytes_array.get_uint(2);
    this.end_pc = bytes_array.get_uint(2);
    this.handler_pc = bytes_array.get_uint(2);
    var cti = bytes_array.get_uint(2);
    this.catch_type = cti === 0 ? "<any>" : constant_pool.get(cti).deref();
  }
}

export class Code implements Attribute {
  public name = 'Code';
  private constant_pool: ConstantPool.ConstantPool;
  private max_stack: number;
  private max_locals: number;
  private code_len: number;
  private _code_array: util.BytesArray;
  private exception_handlers: ExceptionHandler[];
  public run_stamp: number;
  private opcodes: opcodes.Opcode[];
  private attrs: Attribute[];

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) {
    this.constant_pool = constant_pool;
    this.max_stack = bytes_array.get_uint(2);
    this.max_locals = bytes_array.get_uint(2);
    this.code_len = bytes_array.get_uint(4);
    if (this.code_len === 0) {
      (typeof RELEASE !== "undefined" && RELEASE !== null) || (function() {
        throw "Code.parse error: Code length is zero";
      })();
    }
    this._code_array = bytes_array.splice(this.code_len);
    this.opcodes = null;
    var except_len = bytes_array.get_uint(2);
    this.exception_handlers = [];
    for (var i = 0; i < except_len; i++) {
      var eh = new ExceptionHandler();
      this.exception_handlers.push(eh);
      eh.parse(bytes_array, constant_pool)
    }
    // yes, there are even attrs on attrs. BWOM... BWOM...
    this.attrs = make_attributes(bytes_array, constant_pool);
    this.run_stamp = 0;
  }

  public parse_code(): void {
    this.opcodes = new Array(this.code_len);
    while (this._code_array.has_bytes()) {
      var op_index = this._code_array.pos();
      var c = this._code_array.get_uint(1);
      var wide = c === 196;
      if (wide) {
        // wide opcode needs to be handled specially
        c = this._code_array.get_uint(1);
      }
      if (opcodes.opcodes[c] == null) {
        (typeof RELEASE !== "undefined" && RELEASE !== null) || (function() {
          throw "unknown opcode code: " + c;
        })();
      }
      var op = Object.create(opcodes.opcodes[c]);
      op.take_args(this._code_array, this.constant_pool, wide);
      this.opcodes[op_index] = op;
    }
    this._code_array.rewind();
  }

  public each_opcode<T>(fn:(p: number, q: opcodes.Opcode)=>T): void {
    for (var i = 0; i < this.code_len; i++) {
      if (this.opcodes[i] != null) {
        fn(i, this.opcodes[i]);
      }
    }
  }

  public get_attribute(name: string): Attribute {
    for (var i = 0; i < this.attrs.length; i++) {
      var attr = this.attrs[i];
      if (attr.name === name) {
        return attr;
      }
    }
    return null;
  }
}

export class LineNumberTable implements Attribute {
  public name = 'LineNumberTable';
  private entries: { start_pc: number; line_number: number }[];

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.entries = [];
    var lnt_len = bytes_array.get_uint(2);
    for (var i = 0; i < lnt_len; i++) {
      var spc = bytes_array.get_uint(2);
      var ln = bytes_array.get_uint(2);
      this.entries.push({
        'start_pc': spc,
        'line_number': ln
      });
    }
  }

  public disassemblyOutput(): string {
    var rv = "  LineNumberTable:\n";
    for (var i = 0; i < this.entries.length; i++) {
      var entry = this.entries[i];
      rv += "   line " + entry.line_number + ": " + entry.start_pc + "\n";
    }
    return rv;
  }
}

export class SourceFile implements Attribute {
  public name = 'SourceFile';
  public filename: string;

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) {
    this.filename = constant_pool.get(bytes_array.get_uint(2)).value;
  }
}

export class StackMapTable implements Attribute {
  public name = 'StackMapTable';
  private num_entries: number;
  private entries: { frame_name: string; frame_type: number }[]

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) {
    this.num_entries = bytes_array.get_uint(2);
    this.entries = []
    for (var i = 0; i < this.num_entries; i++) {
      this.entries.push(this.parse_entries(bytes_array, constant_pool));
    }
  }

  public parse_entries(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): { frame_name: string; frame_type: number } {
    var frame_type = bytes_array.get_uint(1);
    if ((0 <= frame_type && frame_type < 64)) {
      return {
        frame_type: frame_type,
        frame_name: 'same'
      };
    } else if ((64 <= frame_type && frame_type < 128)) {
      return {
        frame_type: frame_type,
        frame_name: 'same_locals_1_stack_item',
        stack: [this.parse_verification_type_info(bytes_array, constant_pool)]
      };
    } else if ((128 <= frame_type && frame_type < 247)) {
      // reserved for future use
    } else if (frame_type === 247) {
      return {
        frame_type: frame_type,
        frame_name: 'same_locals_1_stack_item_frame_extended',
        offset_delta: bytes_array.get_uint(2),
        stack: [this.parse_verification_type_info(bytes_array, constant_pool)]
      };
    } else if ((248 <= frame_type && frame_type < 251)) {
      return {
        frame_type: frame_type,
        frame_name: 'chop',
        offset_delta: [bytes_array.get_uint(2)]
      };
    } else if (frame_type === 251) {
      return {
        frame_type: frame_type,
        frame_name: 'same_frame_extended',
        offset_delta: [bytes_array.get_uint(2)]
      };
    } else if ((252 <= frame_type && frame_type < 255)) {
      var offset_delta = bytes_array.get_uint(2);
      var locals: string[] = [];
      for (var i = 0; i < frame_type - 251; i++) {
        locals.push(this.parse_verification_type_info(bytes_array, constant_pool));
      }
      return {
        frame_type: frame_type,
        frame_name: 'append',
        offset_delta: offset_delta,
        locals: locals
      };
    } else if (frame_type === 255) {
      var offset_delta = bytes_array.get_uint(2);
      var num_locals = bytes_array.get_uint(2);
      locals = [];
      for (var i = 0; i < num_locals; i++) {
        locals.push(this.parse_verification_type_info(bytes_array, constant_pool));
      }
      var num_stack_items = bytes_array.get_uint(2);
      var stack: string[] = [];
      for (var i = 0; i < num_stack_items; i++) {
        stack.push(this.parse_verification_type_info(bytes_array, constant_pool));
      }
      return {
        frame_type: frame_type,
        frame_name: 'full_frame',
        offset_delta: offset_delta,
        num_locals: num_locals,
        locals: locals,
        num_stack_items: num_stack_items,
        stack: stack
      };
    }
  }

  public parse_verification_type_info(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): string {
    var tag = bytes_array.get_uint(1);
    if (tag === 7) {
      var cls = constant_pool.get(bytes_array.get_uint(2)).deref();
      return 'class ' + (/\w/.test(cls[0]) ? util.descriptor2typestr(cls) : "\"" + cls + "\"");
    } else if (tag === 8) {
      return 'uninitialized ' + bytes_array.get_uint(2);
    } else {
      var tag_to_type = ['bogus', 'int', 'float', 'double', 'long', 'null', 'this', 'object', 'uninitialized'];
      return tag_to_type[tag];
    }
  }

  public disassemblyOutput(): string {
    var rv = "  StackMapTable: number_of_entries = " + this.num_entries + "\n";
    for (var i = 0; i < this.entries.length; i++) {
      var entry = this.entries[i];
      rv += "   frame_type = " + entry.frame_type + " /* " + entry.frame_name + " */\n";
      if (entry['offset_delta'] != null) {
        rv += "     offset_delta = " + entry['offset_delta'] + "\n";
      }
      if (entry['locals'] != null) {
        rv += "     locals = [ " + (entry['locals'].join(', ')) + " ]\n";
      }
      if (entry['stack'] != null) {
        rv += "     stack = [ " + (entry['stack'].join(', ')) + " ]\n";
      }
    }
    return rv;
  }
}

export class LocalVariableTable implements Attribute {
  public name = 'LocalVariableTable';
  private num_entries: number;
  private entries: { start_pc: number; length: number; name: string; descriptor: string; ref: number }[];

  public parse(bytes_array: util.BytesArray, constant_pool:ConstantPool.ConstantPool) {
    this.num_entries = bytes_array.get_uint(2);
    this.entries = [];
    for (var i = 0; i < this.num_entries; i++) {
      this.entries.push(this.parse_entries(bytes_array, constant_pool));
    }
  }

  public parse_entries(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): { start_pc: number; length: number; name: string; descriptor: string; ref: number } {
    return {
      start_pc: bytes_array.get_uint(2),
      length: bytes_array.get_uint(2),
      name: constant_pool.get(bytes_array.get_uint(2)).value,
      descriptor: constant_pool.get(bytes_array.get_uint(2)).value,
      ref: bytes_array.get_uint(2)
    };
  }

  public disassemblyOutput(): string {
    var rv = "  LocalVariableTable:\n   Start  Length  Slot  Name   Signature\n";
    for (var i = 0; i < this.num_entries; i++) {
      var entry = this.entries[i];
      rv += "   " + entry.start_pc + "      " + entry.length + "      " + entry.ref;
      rv += "" + entry.name + "      " + entry.descriptor + "\n";
    }
    return rv;
  }
}

export class Exceptions implements Attribute {
  public name = 'Exceptions';
  private num_exceptions: number;
  private exceptions: Object[];

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.num_exceptions = bytes_array.get_uint(2);
    var exc_refs: number[] = [];
    for (var i = 0; i < this.num_exceptions; i++) {
      exc_refs.push(bytes_array.get_uint(2));
    }
    this.exceptions = exc_refs.map((ref) => constant_pool.get(ref).deref());
  }
}

export class InnerClasses implements Attribute {
  public name = 'InnerClasses';
  private classes: Object[];

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    var num_classes = bytes_array.get_uint(2);
    this.classes = [];
    for (var i = 0; i < num_classes; i++) {
      this.classes.push(this.parse_class(bytes_array, constant_pool));
    }
  }

  public parse_class(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): Object {
    return {
      inner_info_index: bytes_array.get_uint(2),
      outer_info_index: bytes_array.get_uint(2),
      inner_name_index: bytes_array.get_uint(2),
      inner_access_flags: bytes_array.get_uint(2)
    };
  }
}

export class ConstantValue implements Attribute {
  public name = 'ConstantValue';
  private ref: number;
  public value: any;

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.ref = bytes_array.get_uint(2);
    var valref = constant_pool.get(this.ref);
    this.value = (typeof valref.deref === "function") ? valref.deref() : valref.value;
  }
}

export class Synthetic implements Attribute {
  public name = 'Synthetic';
  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) { }
}

export class Deprecated implements Attribute {
  public name = 'Deprecated';
  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) { }
}

export class Signature implements Attribute {
  public name = 'Signature';
  private raw_bytes: number[];
  public sig: string;

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, attr_len?: number) {
    this.raw_bytes = bytes_array.read(attr_len);
    var ref = util.read_uint(this.raw_bytes);
    this.sig = constant_pool.get(ref).value;
  }
}

export class RuntimeVisibleAnnotations implements Attribute {
  public name = 'RuntimeVisibleAnnotations';
  private raw_bytes: number[];
  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, attr_len?: number) {
    // num_annotations = bytes_array.get_uint 2
    this.raw_bytes = bytes_array.read(attr_len);
  }
}

export class AnnotationDefault implements Attribute {
  public name = 'AnnotationDefault';
  private raw_bytes: number[];
  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, attr_len?: number) {
    this.raw_bytes = bytes_array.read(attr_len);
  }
}

export class EnclosingMethod implements Attribute {
  public name = 'EnclosingMethod';
  private enc_class: any;
  private enc_method: any;
  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) {
    this.enc_class = constant_pool.get(bytes_array.get_uint(2)).deref();
    var method_ref = bytes_array.get_uint(2);
    if (method_ref > 0) {
      this.enc_method = constant_pool.get(method_ref).deref();
    }
  }
}

export function make_attributes(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): Attribute[] {
  var attr_types = {
    'Code': Code,
    'LineNumberTable': LineNumberTable,
    'SourceFile': SourceFile,
    'StackMapTable': StackMapTable,
    'LocalVariableTable': LocalVariableTable,
    'ConstantValue': ConstantValue,
    'Exceptions': Exceptions,
    'InnerClasses': InnerClasses,
    'Synthetic': Synthetic,
    'Deprecated': Deprecated,
    'Signature': Signature,
    'RuntimeVisibleAnnotations': RuntimeVisibleAnnotations,
    'AnnotationDefault': AnnotationDefault,
    'EnclosingMethod': EnclosingMethod
    // NYI: LocalVariableTypeTable
  };
  var num_attrs = bytes_array.get_uint(2);
  var attrs : Attribute[] = [];
  for (var i = 0; i < num_attrs; i++) {
    var name = constant_pool.get(bytes_array.get_uint(2)).value;
    var attr_len = bytes_array.get_uint(4);
    if (attr_types[name] != null) {
      var attr = new attr_types[name];
      var old_len = bytes_array.size();
      attr.parse(bytes_array, constant_pool, attr_len);
      var new_len = bytes_array.size();
      if (old_len - new_len !== attr_len) {
        bytes_array.skip(attr_len - old_len + new_len);
      }
      attrs.push(attr);
    } else {
      // we must silently ignore other attrs
      bytes_array.skip(attr_len);
    }
  }
  return attrs;
}
