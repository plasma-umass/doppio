"use strict";
import gLong = require('./gLong');
import util = require('./util');

// All objects in the constant pool have the properties @type and @value.
// *Reference and NameAndType objects all have a @deref method, which resolves
// all child references to their values (i.e. discarding @type).
export interface ConstantPoolItem {
  value: any;
  type?: string;
  deref?(): any;
}

export interface ConstantPoolType {
  size: number;
  from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): ConstantPoolItem;
}
// Type checks the constructors.
var _: ConstantPoolType;

export class SimpleReference {
  public static size = 1;
  public value: any;
  public constant_pool: ConstantPool;
  constructor(constant_pool: ConstantPool, value: any) {
    this.constant_pool = constant_pool;
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): SimpleReference {
    var value = bytes_array.get_uint(2);
    return new this(constant_pool, value);
  }

  public deref(): any {
    var pool_obj = this.constant_pool.get(this.value);
    return (typeof pool_obj.deref === "function" ? pool_obj.deref() : void 0) || pool_obj.value;
  }
}

export class ClassReference extends SimpleReference {
  public type = 'class';
  // the ConstantPool stores class names without the L...; descriptor stuff
  public deref(): any {
    var pool_obj = this.constant_pool.get(this.value);
    if (typeof pool_obj.deref === "function") {
      return pool_obj.deref();
    }
    return util.typestr2descriptor(pool_obj.value);
  }
}
_ = ClassReference;

export class StringReference extends SimpleReference {
  public type = 'String';
  constructor(constant_pool: ConstantPool, value: any) {
    super(constant_pool, value);
  }
}
_ = StringReference;

export class AbstractMethodFieldReference {
  public static size = 1;
  public value: any;
  public constant_pool: ConstantPool;
  constructor(constant_pool: ConstantPool, value: any) {
    this.constant_pool = constant_pool;
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): AbstractMethodFieldReference {
    var class_ref = ClassReference.from_bytes(bytes_array, constant_pool);
    var sig = SimpleReference.from_bytes(bytes_array, constant_pool);
    return new this(constant_pool, {
      class_ref: class_ref,
      sig: sig
    });
  }

  public deref(): any {
    var sig = this.value.sig.deref();
    return {
      class_desc: this.value.class_ref.deref(),
      sig: sig.name + sig.type
    };
  }
}

export class MethodReference extends AbstractMethodFieldReference {
  public type = 'Method';
}
_ = MethodReference;

export class InterfaceMethodReference extends AbstractMethodFieldReference {
  public type = 'InterfaceMethod';
}
_ = InterfaceMethodReference;

export class FieldReference extends AbstractMethodFieldReference {
  public type = 'Field';
  public deref(): any {
    var sig = this.value.sig.deref();
    return {
      class_desc: this.value.class_ref.deref(),
      name: sig.name,
      type: sig.type
    };
  }
}

export interface MethodSignatureValue {
  meth_ref:StringReference;
  type_ref:StringReference;
}

export class MethodSignature {
  public static size = 1;
  public type = 'NameAndType';
  public constant_pool: ConstantPool;
  public value: MethodSignatureValue;
  constructor(constant_pool: ConstantPool, value: MethodSignatureValue) {
    this.constant_pool = constant_pool;
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): MethodSignature {
    var meth_ref = StringReference.from_bytes(bytes_array, constant_pool);
    var type_ref = StringReference.from_bytes(bytes_array, constant_pool);
    return new this(constant_pool, <MethodSignatureValue>{
      meth_ref: meth_ref,
      type_ref: type_ref
    });
  }

  public deref(): {name:string; type: string} {
    return {
      name: this.value.meth_ref.deref(),
      type: this.value.type_ref.deref()
    };
  }
}
_ = MethodSignature;

export class ConstString {
  public static size = 1;
  public type = 'Asciz';
  public value: any;
  constructor(value: any) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray): ConstString {
    var strlen = bytes_array.get_uint(2);
    var value = util.bytes2str(bytes_array.read(strlen));
    return new this(value);
  }
}
_ = ConstString;

export class ConstInt32 {
  public static size = 1;
  public type = 'int';
  public value: number;
  constructor(value: number) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): ConstInt32 {
    var uint32 = bytes_array.get_uint(4);
    var value = -(1 + ~uint32); // Convert to signed integer ONLY FOR 32 BITS
    return new this(value);
  }
}
_ = ConstInt32;

export class ConstFloat {
  public static size = 1;
  public type = 'float';
  public value: number;
  constructor(value: number) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): ConstFloat {
    var uint32 = bytes_array.get_uint(4);
    // We OR with 0 to convert to a signed int.
    var value = util.intbits2float(uint32 | 0);
    return new this(value);
  }
}
_ = ConstFloat;

export class ConstLong {
  public static size = 2;
  public type = 'long';
  public value: gLong;
  constructor(value: gLong) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): ConstLong {
    var high = bytes_array.get_uint(4);
    var low = bytes_array.get_uint(4);
    var value = gLong.fromBits(low, high);
    return new this(value);
  }
}
_ = ConstLong;

export class ConstDouble {
  public static size = 2;
  public type = 'double';
  public value: number;
  constructor(value: number) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray, constant_pool: ConstantPool): ConstDouble {
    var uint32_a = bytes_array.get_uint(4);
    var uint32_b = bytes_array.get_uint(4);
    return new this(util.longbits2double(uint32_a, uint32_b));
  }
}
_ = ConstDouble;

export class ConstantPool {
  private cp_count: number;
  private constant_pool: { [n: number]: ConstantPoolItem; };

  public parse(bytes_array: util.BytesArray): util.BytesArray {
    var constant_tags: {[n: number]: ConstantPoolType } = {
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
    // constant_pool works like an array, but not all indices have values
    this.constant_pool = {};
    var idx = 1; // CP indexing starts at zero
    while (idx < this.cp_count) {
      var tag = bytes_array.get_uint(1);
      if (!((1 <= tag && tag <= 12))) {
        throw "invalid tag: " + tag;
      }
      var pool_obj = constant_tags[tag].from_bytes(bytes_array, this);
      this.constant_pool[idx] = pool_obj;
      idx += constant_tags[tag].size;
    }
    return bytes_array;
  }

  public get(idx: number): ConstantPoolItem {
    var _ref = this.constant_pool[idx];
    if (_ref != null) {
      return _ref;
    } else {
      throw new Error("Invalid constant_pool reference: " + idx);
    }
  }

  public each(fn: (idx:number, item:ConstantPoolItem)=>void): void {
    for (var i = 0; i < this.cp_count; ++i) {
      if (i in this.constant_pool) {
        fn(i, this.constant_pool[i]);
      }
    }
  }
}
