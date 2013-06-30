import util = module('./util');
import opcodes = module('./opcodes');
import ConstantPool = module('./ConstantPool');
declare var RELEASE;

export interface Attribute {
  name: string;
  parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void;
}

export class ExceptionHandler implements Attribute {
  public static name = 'ExceptionHandler'
  private start_pc: number
  private end_pc: number
  private handler_pc: number
  private catch_type: string
  public parse(bytes_array:util.BytesArray, constant_pool:ConstantPool.ConstantPool): void {
    this.start_pc = bytes_array.get_uint(2);
    this.end_pc = bytes_array.get_uint(2);
    this.handler_pc = bytes_array.get_uint(2);
    var cti = bytes_array.get_uint(2);
    this.catch_type = cti === 0 ? "<any>" : constant_pool.get(cti).deref();
  }
}

export class Code implements Attribute {
  public static name = 'Code';
  private constant_pool: ConstantPool.ConstantPool;
  private max_stack: number;
  private max_locals: number;
  private code_len: number;
  private _code_array: util.BytesArray;
  private exception_handlers: ExceptionHandler[];
  private run_stamp: number;
  private opcodes: opcodes.Opcode[];
  private attrs: Attribute[];

  public parse(bytes_array:util.BytesArray, constant_pool:ConstantPool.ConstantPool) {
    var eh, except_len, _i, _len, _ref1;
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
    except_len = bytes_array.get_uint(2);
    this.exception_handlers = (function() {
      var _i, _results;

      _results = [];
      for (_i = 0; 0 <= except_len ? _i < except_len : _i > except_len; 0 <= except_len ? _i++ : _i--) {
        _results.push(new ExceptionHandler);
      }
      return _results;
    })();
    _ref1 = this.exception_handlers;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      eh = _ref1[_i];
      eh.parse(bytes_array, constant_pool);
    }
    this.attrs = make_attributes(bytes_array, constant_pool);
    this.run_stamp = 0;
  }

  public parse_code(): void {
    var c, op, op_index, wide;

    this.opcodes = new Array(this.code_len);
    while (this._code_array.has_bytes()) {
      op_index = this._code_array.pos();
      c = this._code_array.get_uint(1);
      wide = c === 196;
      if (wide) {
        c = this._code_array.get_uint(1);
      }
      if (opcodes.opcodes[c] == null) {
        (typeof RELEASE !== "undefined" && RELEASE !== null) || (function() {
          throw "unknown opcode code: " + c;
        })();
      }
      op = Object.create(opcodes.opcodes[c]);
      op.take_args(this._code_array, this.constant_pool, wide);
      this.opcodes[op_index] = op;
    }
    this._code_array.rewind();
  }

  public each_opcode<T>(fn:(number, Opcode)=>T): T[] {
    var i, _i, _ref1, _results;

    _results = [];
    for (i = _i = 0, _ref1 = this.code_len; 0 <= _ref1 ? _i <= _ref1 : _i >= _ref1; i = 0 <= _ref1 ? ++_i : --_i) {
      if (i in this.opcodes) {
        _results.push(fn(i, this.opcodes[i]));
      }
    }
    return _results;
  }

  public get_attribute(name: string): Attribute {
    var attr, _i, _len, _ref1;

    _ref1 = this.attrs;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      attr = _ref1[_i];
      if (attr.name === name) {
        return attr;
      }
    }
    return null;
  }
}

export class LineNumberTable implements Attribute {
  public static name = 'LineNumberTable';
  private entries: { 'start_pc': number; 'line_number': number }[];

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) {
    var i, ln, lnt_len, spc, _i, _results;

    this.entries = [];
    lnt_len = bytes_array.get_uint(2);
    _results = [];
    for (i = _i = 0; _i < lnt_len; i = _i += 1) {
      spc = bytes_array.get_uint(2);
      ln = bytes_array.get_uint(2);
      this.entries.push({
        'start_pc': spc,
        'line_number': ln
      });
    }
  }

  public disassemblyOutput(): string {
    var entry, rv, _i, _len, _ref1;

    rv = "  LineNumberTable:\n";
    _ref1 = this.entries;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      entry = _ref1[_i];
      rv += "   line " + entry.line_number + ": " + entry.start_pc + "\n";
    }
    return rv;
  }
}

export class SourceFile implements Attribute {
  public static name = 'SourceFile';
  private filename: string

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) {
    this.filename = constant_pool.get(bytes_array.get_uint(2)).value;
  }
}

export class StackMapTable implements Attribute {
  public static name = 'StackMapTable';
  private num_entries: number
  private entries: { frame_name: string; frame_type: number }[]

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) {
    var i;

    this.num_entries = bytes_array.get_uint(2);
    this.entries = (function() {
      var _i, _ref1, _results;

      _results = [];
      for (i = _i = 0, _ref1 = this.num_entries; _i < _ref1; i = _i += 1) {
        _results.push(this.parse_entries(bytes_array, constant_pool));
      }
      return _results;
    }).call(this);
  }

  public parse_entries(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): { frame_name: string; frame_type: number } {
    var frame_type, i, num_locals, num_stack_items;

    frame_type = bytes_array.get_uint(1);
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
      return {
        frame_type: frame_type,
        frame_name: 'append',
        offset_delta: bytes_array.get_uint(2),
        locals: (function() {
          var _i, _ref1, _results;

          _results = [];
          for (i = _i = 0, _ref1 = frame_type - 251; _i < _ref1; i = _i += 1) {
            _results.push(this.parse_verification_type_info(bytes_array, constant_pool));
          }
          return _results;
        })()
      };
    } else if (frame_type === 255) {
      return {
        frame_type: frame_type,
        frame_name: 'full_frame',
        offset_delta: bytes_array.get_uint(2),
        num_locals: num_locals = bytes_array.get_uint(2),
        locals: (function() {
          var _i, _results;

          _results = [];
          for (i = _i = 0; _i < num_locals; i = _i += 1) {
            _results.push(this.parse_verification_type_info(bytes_array, constant_pool));
          }
          return _results;
        })(),
        num_stack_items: num_stack_items = bytes_array.get_uint(2),
        stack: (function() {
          var _i, _results;

          _results = [];
          for (i = _i = 0; _i < num_stack_items; i = _i += 1) {
            _results.push(this.parse_verification_type_info(bytes_array, constant_pool));
          }
          return _results;
        })()
      };
    }
  }

  public parse_verification_type_info(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): string {
    var cls, offset, tag, tag_to_type;

    tag = bytes_array.get_uint(1);
    if (tag === 7) {
      cls = constant_pool.get(bytes_array.get_uint(2)).deref();
      return 'class ' + (/\w/.test(cls[0]) ? util.descriptor2typestr(cls) : "\"" + cls + "\"");
    } else if (tag === 8) {
      offset = bytes_array.get_uint(2);
      return 'uninitialized ' + offset;
    } else {
      tag_to_type = ['bogus', 'int', 'float', 'double', 'long', 'null', 'this', 'object', 'uninitialized'];
      return tag_to_type[tag];
    }
  }

  public disassemblyOutput(): string {
    var entry, rv, _i, _len, _ref1;

    rv = "  StackMapTable: number_of_entries = " + this.num_entries + "\n";
    _ref1 = this.entries;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      entry = _ref1[_i];
      rv += "   frame_type = " + entry.frame_type + " /* " + entry.frame_name + " */\n";
      if (entry.offset_delta != null) {
        rv += "     offset_delta = " + entry.offset_delta + "\n";
      }
      if (entry.locals != null) {
        rv += "     locals = [ " + (entry.locals.join(', ')) + " ]\n";
      }
      if (entry.stack != null) {
        rv += "     stack = [ " + (entry.stack.join(', ')) + " ]\n";
      }
    }
    return rv;
  }
}

export class LocalVariableTable implements Attribute {
  public static name = 'LocalVariableTable';
  private num_entries: number
  private entries: { start_pc: number; length: number; name: string; descriptor: string; ref: number }[]

  public parse(bytes_array: util.BytesArray, constant_pool:ConstantPool.ConstantPool) {
    var i;

    this.num_entries = bytes_array.get_uint(2);
    this.entries = (function () {
      var _i, _ref1, _results;

      _results = [];
      for (i = _i = 0, _ref1 = this.num_entries; _i < _ref1; i = _i += 1) {
        _results.push(this.parse_entries(bytes_array, constant_pool));
      }
      return _results;
    }).call(this);
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
    var entry, rv, _i, _len, _ref1;

    rv = "  LocalVariableTable:\n   Start  Length  Slot  Name   Signature\n";
    _ref1 = this.entries;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      entry = _ref1[_i];
      rv += "   " + entry.start_pc + "      " + entry.length + "      " + entry.ref;
      rv += "" + entry.name + "      " + entry.descriptor + "\n";
    }
    return rv;
  }
}

export class Exceptions implements Attribute {
  public static name = 'Exceptions';
  private num_exceptions: number
  private exceptions: Object[]

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    var exc_refs, i, ref;

    this.num_exceptions = bytes_array.get_uint(2);
    exc_refs = (function () {
      var _i, _ref1, _results;

      _results = [];
      for (i = _i = 0, _ref1 = this.num_exceptions; _i < _ref1; i = _i += 1) {
        _results.push(bytes_array.get_uint(2));
      }
      return _results;
    }).call(this);
    this.exceptions = (function () {
      var _i, _len, _results;

      _results = [];
      for (_i = 0, _len = exc_refs.length; _i < _len; _i++) {
        ref = exc_refs[_i];
        _results.push(constant_pool.get(ref).deref());
      }
      return _results;
    })();
  }
}

export class InnerClasses implements Attribute {
  public static name = 'InnerClasses';
  private classes: Object[]

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    var i, num_classes;

    num_classes = bytes_array.get_uint(2);
    this.classes = (function () {
      var _i, _results;

      _results = [];
      for (i = _i = 0; _i < num_classes; i = _i += 1) {
        _results.push(this.parse_class(bytes_array, constant_pool));
      }
      return _results;
    }).call(this);
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
  public static name = 'ConstantValue';
  private ref: number
  private value: any

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    var valref;

    this.ref = bytes_array.get_uint(2);
    valref = constant_pool.get(this.ref);
    this.value = (typeof valref.deref === "function" ? valref.deref() : void 0) || valref.value;
  }
}

export class Synthetic implements Attribute {
  public static name = 'Synthetic';
  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) { }
}

export class Deprecated implements Attribute {
  public static name = 'Deprecated';
  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) { }
}

export class Signature implements Attribute {
  public static name = 'Signature';
  private raw_bytes: number[]
  private ref: number
  private sig: Object

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, attr_len?: number) {
    var ref;

    this.raw_bytes = bytes_array.read(attr_len);
    ref = util.read_uint(this.raw_bytes);
    this.sig = constant_pool.get(ref).value;
  }
}

export class RuntimeVisibleAnnotations implements Attribute {
  public static name = 'RuntimeVisibleAnnotations';
  private raw_bytes: number[]
  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, attr_len?: number) {
    this.raw_bytes = bytes_array.read(attr_len);
  }
}

export class AnnotationDefault implements Attribute {
  public static name = 'AnnotationDefault';
  private raw_bytes: number[]
  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, attr_len?: number) {
    this.raw_bytes = bytes_array.read(attr_len);
  }
}

export class EnclosingMethod implements Attribute {
  public static name = 'EnclosingMethod';
  private enc_class: any
  private enc_method: any
  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool) {
    var method_ref;

    this.enc_class = constant_pool.get(bytes_array.get_uint(2)).deref();
    method_ref = bytes_array.get_uint(2);
    if (method_ref > 0) {
      return this.enc_method = constant_pool.get(method_ref).deref();
    }
  }
}

export function make_attributes(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): Attribute[] {
  var attr, attr_len, attr_types, attrs, i, name, new_len, num_attrs, old_len, _i;

  attr_types = {
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
  };
  num_attrs = bytes_array.get_uint(2);
  attrs = [];
  for (i = _i = 0; _i < num_attrs; i = _i += 1) {
    name = constant_pool.get(bytes_array.get_uint(2)).value;
    attr_len = bytes_array.get_uint(4);
    if (attr_types[name] != null) {
      attr = new attr_types[name];
      old_len = bytes_array.size();
      attr.parse(bytes_array, constant_pool, attr_len);
      new_len = bytes_array.size();
      if (old_len - new_len !== attr_len) {
        bytes_array.skip(attr_len - old_len + new_len);
      }
      attrs.push(attr);
    } else {
      bytes_array.skip(attr_len);
    }
  }
  return attrs;
}
