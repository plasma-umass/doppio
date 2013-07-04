"use strict";
import gLong = module('./gLong');
import util = module('./util');

export interface ConstantPoolItem {
  size: number;
  type: string;
  value: any;
  from_bytes(bytes_array: util.BytesArray, constant_pool: { [n: number]: ConstantPoolItem }): ConstantPoolItem;
  deref(): any;
}

export class SimpleReference {
  public static size = 1;
  public constant_pool: ConstantPool;
  public value: any;
  constructor(constant_pool: ConstantPool, value: any) {
    this.constant_pool = constant_pool;
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): SimpleReference {
    var ref, value;
    value = bytes_array.get_uint(2);
    ref = new this(constant_pool, value);
    return ref;
  }

  public deref(): any {
    var pool_obj;

    pool_obj = this.constant_pool[this.value];
    return (typeof pool_obj.deref === "function" ? pool_obj.deref() : void 0) || pool_obj.value;
  }
}

export class ClassReference extends SimpleReference {
  public type = 'class';
  public deref(): any {
    var pool_obj;

    pool_obj = this.constant_pool[this.value];
    return (typeof pool_obj.deref === "function" ? pool_obj.deref() : void 0) || util.typestr2descriptor(pool_obj.value);
  }
}

export class StringReference extends SimpleReference {
  public type = 'String';
  constructor(constant_pool: ConstantPool, value: any) {
    super(constant_pool, value);
  }
}

export class AbstractMethodFieldReference {
  public static size = 1;
  public value: any;
  public constant_pool: ConstantPool;
  constructor(constant_pool: ConstantPool, value: any) {
    this.constant_pool = constant_pool;
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): AbstractMethodFieldReference {
    var class_ref, ref, sig;

    class_ref = ClassReference.from_bytes(bytes_array, constant_pool);
    sig = SimpleReference.from_bytes(bytes_array, constant_pool);
    ref = new this(constant_pool, {
      class_ref: class_ref,
      sig: sig
    });
    return ref;
  }

  public deref(): any {
    var sig;

    sig = this.value.sig.deref();
    return {
      "class": this.value.class_ref.deref(),
      sig: sig.name + sig.type
    };
  }
}

export class MethodReference extends AbstractMethodFieldReference {
  public type = 'Method';
}

export class InterfaceMethodReference extends AbstractMethodFieldReference {
  public type = 'InterfaceMethod';
}

export class FieldReference extends AbstractMethodFieldReference {
  public type = 'Field';
  public deref(): any {
    var sig;

    sig = this.value.sig.deref();
    return {
      "class": this.value.class_ref.deref(),
      name: sig.name,
      type: sig.type
    };
  }
}

export class MethodSignature {
  public static size = 1;
  public type = 'NameAndType';
  public constant_pool: ConstantPool;
  public value: any;
  constructor(constant_pool, value) {
    this.constant_pool = constant_pool;
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): MethodSignature {
    var meth_ref, ref, type_ref;

    meth_ref = StringReference.from_bytes(bytes_array, constant_pool);
    type_ref = StringReference.from_bytes(bytes_array, constant_pool);
    ref = new this(constant_pool, {
      meth_ref: meth_ref,
      type_ref: type_ref
    });
    return ref;
  }

  public deref(): any {
    return {
      name: this.value.meth_ref.deref(),
      type: this.value.type_ref.deref()
    };
  }
}

export class ConstString {
  public static size = 1;
  public type = 'Asciz';
  public value: any;
  constructor(value: any) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray): ConstString {
    var const_string, strlen, value;

    strlen = bytes_array.get_uint(2);
    value = util.bytes2str(bytes_array.read(strlen));
    const_string = new this(value);
    return const_string;
  }
}

export class ConstInt32 {
  public static size = 1;
  public type = 'int';
  public value: any;
  constructor(value) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray): ConstInt32 {
    var int32, uint32, value;

    uint32 = bytes_array.get_uint(4);
    value = -(1 + ~uint32);
    int32 = new this(value);
    return int32;
  }
}

export class ConstFloat {
  public static size = 1;
  public type = 'float';
  public value: any;
  constructor(value) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray): ConstFloat {
    var float, uint32, value;

    uint32 = bytes_array.get_uint(4);
    value = util.intbits2float(uint32 | 0);
    float = new this(value);
    return float;
  }
}

export class ConstLong {
  public static size = 2;
  public type = 'Long';
  public value: any;
  constructor(value) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray): ConstLong {
    var high, long, low, value;

    high = bytes_array.get_uint(4);
    low = bytes_array.get_uint(4);
    value = gLong.fromBits(low, high);
    long = new this(value);
    return long;
  }
}

export class ConstDouble {
  public static size = 2;
  public type = 'double';
  public value: any;
  constructor(value) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray): ConstDouble {
    var double, uint32_a, uint32_b;

    uint32_a = bytes_array.get_uint(4);
    uint32_b = bytes_array.get_uint(4);
    double = new this(util.longbits2double(uint32_a, uint32_b));
    return double;
  }
}

export class ConstantPool {
  private cp_count: number;
  private constant_pool: { [n: number]: ConstantPoolItem; };

  public parse(bytes_array: util.BytesArray): util.BytesArray {
    var constant_tags: {[n: number]: ConstantPoolItem }, idx, pool_obj, tag;

    constant_tags = {
      1: ConstString,
      3: ConstInt32,
      4: ConstFloat,
      5: ConstLong,
      6: ConstDouble,
      7: ClassReference,
      8: StringReference,
      9: FieldReference,
      10: MethodReference,
      11: InterfaceMethodReference,
      12: MethodSignature
    };
    this.cp_count = bytes_array.get_uint(2);
    this.constant_pool = {};
    idx = 1;
    while (idx < this.cp_count) {
      tag = bytes_array.get_uint(1);
      if (!((1 <= tag && tag <= 12))) {
        throw "invalid tag: " + tag;
      }
      pool_obj = constant_tags[tag].from_bytes(bytes_array, this.constant_pool);
      this.constant_pool[idx] = pool_obj;
      idx += constant_tags[tag].size;
    }
    return bytes_array;
  }

  public get(idx: number): ConstantPoolItem {
    var _ref;

    if ((_ref = this.constant_pool[idx]) != null) {
      return _ref;
    } else {
      throw new Error("Invalid constant_pool reference: " + idx);
    }
  }

  public each<T>(fn: (number, ConstantPoolItem)=>T): T[] {
    var i, _i, _ref, _results;

    _results = [];
    for (i = _i = 0, _ref = this.cp_count; 0 <= _ref ? _i <= _ref : _i >= _ref; i = 0 <= _ref ? ++_i : --_i) {
      if (i in this.constant_pool) {
        _results.push(fn(i, this.constant_pool[i]));
      }
    }
    return _results;
  }
}
