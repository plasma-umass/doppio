"use strict";
import util = require('./util');
import ByteStream = require('./ByteStream');
import opcodes = require('./opcodes');
import ConstantPool = require('./ConstantPool');
import enums = require('./enums');
declare var RELEASE: boolean;

export interface Attribute {
  name: string;
  parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void;
}

export interface IInnerClassInfo {
  inner_info_index: number;
  outer_info_index: number;
  inner_name_index: number;
  inner_access_flags: number;
}

export class ExceptionHandler implements Attribute {
  public name = 'ExceptionHandler';
  public start_pc: number;
  public end_pc: number;
  public handler_pc: number;
  public catch_type: string;
  public parse(bytes_array: ByteStream, constant_pool:ConstantPool.ConstantPool): void {
    this.start_pc = bytes_array.getUint16();
    this.end_pc = bytes_array.getUint16();
    this.handler_pc = bytes_array.getUint16();
    var cti = bytes_array.getUint16();
    this.catch_type = cti === 0 ? "<any>" : (<ConstantPool.ClassReference> constant_pool.get(cti)).name;
  }
}

export class Code implements Attribute {
  public name = 'Code';
  private constant_pool: ConstantPool.ConstantPool;
  private max_stack: number;
  private max_locals: number;
  public exception_handlers: ExceptionHandler[];
  private attrs: Attribute[];
  private code: NodeBuffer;

  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool) {
    this.constant_pool = constant_pool;
    this.max_stack = bytes_array.getUint16();
    this.max_locals = bytes_array.getUint16();
    var code_len = bytes_array.getUint32();
    if (code_len === 0) {
      (typeof RELEASE !== "undefined" && RELEASE !== null) || (() => {
        throw "Code.parse error: Code length is zero";
      })();
    }
    this.code = bytes_array.slice(code_len).getBuffer();
    var except_len = bytes_array.getUint16();
    this.exception_handlers = [];
    for (var i = 0; i < except_len; i++) {
      var eh = new ExceptionHandler();
      this.exception_handlers.push(eh);
      eh.parse(bytes_array, constant_pool)
    }
    // yes, there are even attrs on attrs. BWOM... BWOM...
    this.attrs = make_attributes(bytes_array, constant_pool);
  }

  public getCode(): NodeBuffer {
    return this.code;
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
  public entries: { start_pc: number; line_number: number }[];

  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.entries = [];
    var lnt_len = bytes_array.getUint16();
    for (var i = 0; i < lnt_len; i++) {
      var spc = bytes_array.getUint16();
      var ln = bytes_array.getUint16();
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

  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool) {
    this.filename = (<ConstantPool.ConstUTF8> constant_pool.get(bytes_array.getUint16())).value;
  }
}

export class StackMapTable implements Attribute {
  public name = 'StackMapTable';
  private num_entries: number;
  private entries: { frame_name: string; frame_type: number }[]

  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool) {
    this.num_entries = bytes_array.getUint16();
    this.entries = []
    for (var i = 0; i < this.num_entries; i++) {
      this.entries.push(this.parse_entries(bytes_array, constant_pool));
    }
  }

  public parse_entries(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): { frame_name: string; frame_type: number } {
    var frame_type = bytes_array.getUint8();
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
        offset_delta: bytes_array.getUint16(),
        stack: [this.parse_verification_type_info(bytes_array, constant_pool)]
      };
    } else if ((248 <= frame_type && frame_type < 251)) {
      return {
        frame_type: frame_type,
        frame_name: 'chop',
        offset_delta: [bytes_array.getUint16()]
      };
    } else if (frame_type === 251) {
      return {
        frame_type: frame_type,
        frame_name: 'same_frame_extended',
        offset_delta: [bytes_array.getUint16()]
      };
    } else if ((252 <= frame_type && frame_type < 255)) {
      var offset_delta = bytes_array.getUint16();
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
      var offset_delta = bytes_array.getUint16();
      var num_locals = bytes_array.getUint16();
      locals = [];
      for (var i = 0; i < num_locals; i++) {
        locals.push(this.parse_verification_type_info(bytes_array, constant_pool));
      }
      var num_stack_items = bytes_array.getUint16();
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

  public parse_verification_type_info(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): string {
    var tag = bytes_array.getUint8();
    if (tag === 7) {
      var cls = (<ConstantPool.ClassReference> constant_pool.get(bytes_array.getUint16())).name;
      return 'class ' + (/\w/.test(cls[0]) ? util.descriptor2typestr(cls) : "\"" + cls + "\"");
    } else if (tag === 8) {
      return 'uninitialized ' + bytes_array.getUint16();
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

  public parse(bytes_array: ByteStream, constant_pool:ConstantPool.ConstantPool) {
    this.num_entries = bytes_array.getUint16();
    this.entries = [];
    for (var i = 0; i < this.num_entries; i++) {
      this.entries.push(this.parse_entries(bytes_array, constant_pool));
    }
  }

  public parse_entries(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): { start_pc: number; length: number; name: string; descriptor: string; ref: number } {
    return {
      start_pc: bytes_array.getUint16(),
      length: bytes_array.getUint16(),
      name: (<ConstantPool.ConstUTF8> constant_pool.get(bytes_array.getUint16())).value,
      descriptor: (<ConstantPool.ConstUTF8> constant_pool.get(bytes_array.getUint16())).value,
      ref: bytes_array.getUint16()
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
  public exceptions: string[];

  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.num_exceptions = bytes_array.getUint16();
    var exc_refs: number[] = [];
    for (var i = 0; i < this.num_exceptions; i++) {
      exc_refs.push(bytes_array.getUint16());
    }
    this.exceptions = exc_refs.map((ref) => (<ConstantPool.ClassReference> constant_pool.get(ref)).name);
  }
}

export class InnerClasses implements Attribute {
  public name = 'InnerClasses';
  public classes: IInnerClassInfo[];

  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    var num_classes = bytes_array.getUint16();
    this.classes = [];
    for (var i = 0; i < num_classes; i++) {
      this.classes.push(this.parse_class(bytes_array, constant_pool));
    }
  }

  public parse_class(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): IInnerClassInfo {
    return {
      inner_info_index: bytes_array.getUint16(),
      outer_info_index: bytes_array.getUint16(),
      inner_name_index: bytes_array.getUint16(),
      inner_access_flags: bytes_array.getUint16()
    };
  }
}

export class ConstantValue implements Attribute {
  public name = 'ConstantValue';
  private ref: number;
  public value: ConstantPool.IConstantPoolItem;

  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.ref = bytes_array.getUint16();
    this.value = constant_pool.get(this.ref);
  }
}

export class Synthetic implements Attribute {
  public name = 'Synthetic';
  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool) { }
}

export class Deprecated implements Attribute {
  public name = 'Deprecated';
  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool) { }
}

export class Signature implements Attribute {
  public name = 'Signature';
  public sig: string;

  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool, attr_len?: number) {
    this.sig = (<ConstantPool.ConstUTF8> constant_pool.get(bytes_array.getUint16())).value;
  }
}

export class RuntimeVisibleAnnotations implements Attribute {
  public name = 'RuntimeVisibleAnnotations';
  public raw_bytes: number[];
  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool, attr_len?: number) {
    // num_annotations = bytes_array.get_uint 2
    this.raw_bytes = bytes_array.read(attr_len);
  }
}

export class AnnotationDefault implements Attribute {
  public name = 'AnnotationDefault';
  public raw_bytes: number[];
  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool, attr_len?: number) {
    this.raw_bytes = bytes_array.read(attr_len);
  }
}

export class EnclosingMethod implements Attribute {
  public name = 'EnclosingMethod';
  public enc_class: string;
  public enc_method: ConstantPool.MethodReference;
  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool) {
    this.enc_class = (<ConstantPool.ClassReference> constant_pool.get(bytes_array.getUint16())).name;
    var method_ref = bytes_array.getUint16();
    if (method_ref > 0) {
      this.enc_method = <ConstantPool.MethodReference> constant_pool.get(method_ref);
    }
  }
}

export function make_attributes(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): Attribute[] {
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
  var num_attrs = bytes_array.getUint16();
  var attrs : Attribute[] = [];
  for (var i = 0; i < num_attrs; i++) {
    var name = (<ConstantPool.ConstUTF8> constant_pool.get(bytes_array.getUint16())).value;
    var attr_len = bytes_array.getUint32();
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
