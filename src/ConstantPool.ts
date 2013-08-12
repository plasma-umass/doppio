"use strict";
import gLong = require('./gLong');
import util = require('./util');

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
    var value = bytes_array.get_uint(2);
    return new this(constant_pool, value);
  }

  public deref(): any {
    var pool_obj = this.constant_pool[this.value];
    return (typeof pool_obj.deref === "function" ? pool_obj.deref() : void 0) || pool_obj.value;
  }
}

export class ClassReference extends SimpleReference {
  public type = 'class';
  public deref(): any {
    var pool_obj = this.constant_pool[this.value];
    if (typeof pool_obj.deref === "function") {
      return pool_obj.deref();
    }
    return util.typestr2descriptor(pool_obj.value);
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
    var sig = this.value.sig.deref();
    return {
      "class": this.value.class_ref.deref(),
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

export class ConstInt32 {
  public static size = 1;
  public type = 'int';
  public value: number;
  constructor(value: number) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray): ConstInt32 {
    var uint32 = bytes_array.get_uint(4);
    var value = -(1 + ~uint32);
    return new this(value);
  }
}

export class ConstFloat {
  public static size = 1;
  public type = 'float';
  public value: number;
  constructor(value: number) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray): ConstFloat {
    var uint32 = bytes_array.get_uint(4);
    var value = util.intbits2float(uint32 | 0);
    return new this(value);
  }
}

export class ConstLong {
  public static size = 2;
  public type = 'long';
  public value: gLong;
  constructor(value: gLong) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray): ConstLong {
    var high = bytes_array.get_uint(4);
    var low = bytes_array.get_uint(4);
    var value = gLong.fromBits(low, high);
    return new this(value);
  }
}

export class ConstDouble {
  public static size = 2;
  public type = 'double';
  public value: number;
  constructor(value: number) {
    this.value = value;
  }

  public static from_bytes(bytes_array: util.BytesArray): ConstDouble {
    var uint32_a = bytes_array.get_uint(4);
    var uint32_b = bytes_array.get_uint(4);
    return new this(util.longbits2double(uint32_a, uint32_b));
  }
}

export class ConstantPool {
  private cp_count: number;
  private constant_pool: { [n: number]: ConstantPoolItem; };

  public parse(bytes_array: util.BytesArray): util.BytesArray {
    var constant_tags: {[n: number]: ConstantPoolItem };

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
    var idx = 1;
    while (idx < this.cp_count) {
      var tag = bytes_array.get_uint(1);
      if (!((1 <= tag && tag <= 12))) {
        throw "invalid tag: " + tag;
      }
      var pool_obj = constant_tags[tag].from_bytes(bytes_array, this.constant_pool);
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

  public each<T>(fn: (p:number, q:ConstantPoolItem)=>T): T[] {
    var _results: T[] = [];
    for (var i = 0, _ref = this.cp_count; i < _ref; ++i) {
      if (i in this.constant_pool) {
        _results.push(fn(i, this.constant_pool[i]));
      }
    }
    return _results;
  }
}
