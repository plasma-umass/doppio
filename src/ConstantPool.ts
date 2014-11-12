"use strict";
import gLong = require('./gLong');
import ByteStream = require('./ByteStream');
import util = require('./util');
import enums = require('./enums');
import assert = require('./assert');
import ClassData = require('./ClassData');
import java_object = require('./java_object');
import methods = require('./methods');
import ClassLoader = require('./ClassLoader');
import threading = require('./threading');

/**
 * Represents a constant pool item. Use the item's type to discriminate among them.
 */
export interface IConstantPoolItem {
  getType(): enums.ConstantPoolItemType;
}

/**
 * All constant pool items have a static constructor function.
 */
export interface IConstantPoolType {
  fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem;
  /**
   * The resulting size in the constant pool, in machine words.
   */
  size: number;
  /**
   * The bytesize on disk of the item's information past the tag byte.
   */
  infoByteSize: number;
}
/**
 * Stores all of the constant pool classes, keyed on their enum value.
 */
var CP_CLASSES: { [n: number]: IConstantPoolType } = {};

// #region Tier 0

/**
 * Represents a constant UTF-8 string.
 * ```
 * CONSTANT_Utf8_info {
 *   u1 tag;
 *   u2 length;
 *   u1 bytes[length];
 * }
 * ```
 */
export class ConstUTF8 implements IConstantPoolItem {
  public value: string;
  constructor(value: string) {
    this.value = value;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.UTF8;
  }

  public static size: number = 1;
  // Variable-size.
  public static infoByteSize: number = 0;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var strlen = byteStream.getUint16();
    return new this(util.bytes2str(byteStream.read(strlen)));
  }
}
CP_CLASSES[enums.ConstantPoolItemType.UTF8] = ConstUTF8;

/**
 * Represents a constant 32-bit integer.
 * ```
 * CONSTANT_Integer_info {
 *   u1 tag;
 *   u4 bytes;
 * }
 * ```
 */
export class ConstInt32 implements IConstantPoolItem {
  public value: number;
  constructor(value: number) {
    this.value = value;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.INTEGER;
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    return new this(byteStream.getInt32());
  }
}
CP_CLASSES[enums.ConstantPoolItemType.INTEGER] = ConstInt32;

/**
 * Represents a constant 32-bit floating point number.
 * ```
 * CONSTANT_Float_info {
 *   u1 tag;
 *   u4 bytes;
 * }
 * ```
 */
export class ConstFloat implements IConstantPoolItem {
  public value: number;
  constructor(value: number) {
    this.value = value;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.FLOAT;
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    return new this(byteStream.getFloat());
  }
}
CP_CLASSES[enums.ConstantPoolItemType.FLOAT] = ConstFloat;

/**
 * Represents a constant 64-bit integer.
 * ```
 * CONSTANT_Long_info {
 *   u1 tag;
 *   u4 high_bytes;
 *   u4 low_bytes;
 * }
 * ```
 */
export class ConstLong implements IConstantPoolItem {
  public value: gLong;
  constructor(value: gLong) {
    this.value = value;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.LONG;
  }

  public static size: number = 2;
  public static infoByteSize: number = 8;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    return new this(byteStream.getInt64());
  }
}
CP_CLASSES[enums.ConstantPoolItemType.LONG] = ConstLong;

/**
 * Represents a constant 64-bit floating point number.
 * ```
 * CONSTANT_Double_info {
 *   u1 tag;
 *   u4 high_bytes;
 *   u4 low_bytes;
 * }
 * ```
 */
export class ConstDouble implements IConstantPoolItem {
  public value: number;
  constructor(value: number) {
    this.value = value;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.DOUBLE;
  }

  public static size: number = 2;
  public static infoByteSize: number = 8;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    return new this(byteStream.getDouble());
  }
}
CP_CLASSES[enums.ConstantPoolItemType.DOUBLE] = ConstDouble;

// #endregion

// #region Tier 1

/**
 * Represents a class or interface.
 * ```
 * CONSTANT_Class_info {
 *   u1 tag;
 *   u2 name_index;
 * }
 * ```
 * @todo Have a global cache of class reference objects.
 */
export class ClassReference implements IConstantPoolItem {
  /**
   * The name of the class, in full descriptor form, e.g.:
   * Lfoo/bar/Baz;
   */
  public name: string;
  /**
   * Contains stashed ClassData objects for the given class keyed on the
   * number of nested arrays (e.g. 0 is the class reference for `name`,
   * 1 is the class reference for `name[]`, etc.).
   * If `name` is an array type, 0 is *still* `name`. Meaning, it's the
   * array depth tacked on to `name`.
   */
  public cdata: ClassData.ClassData[] = [];
  constructor(name: string) {
    this.name = name;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.CLASS;
  }

  /**
   * Retrieve a stashed class, or attempt to synchronously fetch it
   * from the classloader.
   * Returns null if the class needs to be asynchronously loaded.
   * @note Does not check for initialization!
   */
  public getClass(cl: ClassLoader.ClassLoader, arrayDepth: number): ClassData.ClassData {
    var cd = this.cdata[arrayDepth];
    if (cd === undefined || cd === null) {
      cd = this.cdata[arrayDepth] = cl.getResolvedClass(this._getName(arrayDepth));
    }
    return cd;
  }

  private _getName(arrayDepth: number) {
    if (arrayDepth === 0) {
      return this.name;
    } else {
      return "[" + this._getName(arrayDepth - 1);
    }
  }

  public static size: number = 1;
  public static infoByteSize: number = 2;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var nameIndex = byteStream.getUint16(),
      cpItem = constantPool.get(nameIndex);
    assert(cpItem.getType() === enums.ConstantPoolItemType.UTF8);
    // The ConstantPool stores class names without the L...; descriptor stuff
    return new this(util.typestr2descriptor((<ConstUTF8> cpItem).value));
  }
}
CP_CLASSES[enums.ConstantPoolItemType.CLASS] = ClassReference;

/**
 * Represents a field or method without indicating which class or interface
 * type it belongs to.
 * ```
 * CONSTANT_NameAndType_info {
 *   u1 tag;
 *   u2 name_index;
 *   u2 descriptor_index;
 * }
 * ```
 */
export class NameAndTypeInfo implements IConstantPoolItem {
  public name: string;
  public descriptor: string;
  constructor(name: string, descriptor: string) {
    this.name = name;
    this.descriptor = descriptor;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.NAME_AND_TYPE;
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var nameIndex = byteStream.getUint16(),
      descriptorIndex = byteStream.getUint16(),
      nameConst = <ConstUTF8> constantPool.get(nameIndex),
      descriptorConst = <ConstUTF8> constantPool.get(descriptorIndex);
    assert(nameConst.getType() === enums.ConstantPoolItemType.UTF8 &&
      descriptorConst.getType() === enums.ConstantPoolItemType.UTF8);
    return new this(nameConst.value, descriptorConst.value);
  }
}
CP_CLASSES[enums.ConstantPoolItemType.NAME_AND_TYPE] = NameAndTypeInfo;

/**
 * Represents constant objects of the type java.lang.String.
 * ```
 * CONSTANT_String_info {
 *   u1 tag;
 *   u2 string_index;
 * }
 * ```
 */
export class ConstString implements IConstantPoolItem {
  /**
   * The constant JVM string. If null, it should be created and interned.
   * We don't do that here to avoid circular references.
   */
  public value: java_object.JavaObject = null;
  /**
   * The JavaScript string value for this string.
   */
  public stringValue: string;
  constructor(stringValue: string) {
    this.stringValue = stringValue;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.STRING;
  }

  public static size: number = 1;
  public static infoByteSize: number = 2;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var stringIndex = byteStream.getUint16(),
      utf8Info = <ConstUTF8> constantPool.get(stringIndex);
    assert(utf8Info.getType() === enums.ConstantPoolItemType.UTF8);
    return new this(utf8Info.value);
  }
}
CP_CLASSES[enums.ConstantPoolItemType.STRING] = ConstString;

// #endregion

// #region Tier 2

function _getParamWordSize(signature: string): number {
  var state = 'name', size = 0;
  for (var i = 0; i < signature.length; i++) {
    var c = signature[i];
    switch (state) {
      case 'name':
        if (c === '(') {
          state = 'type';
        }
        break;
      case 'type':
        if (c === ')') {
          return size;
        }
        if (c === 'J' || c === 'D') {
          size += 2;
        } else {
          ++size;
        }
        if (c === 'L') {
          state = 'class';
        } else if (c === '[') {
          state = 'array';
        }
        break;
      case 'class':
        if (c === ';') {
          state = 'type';
        }
        break;
      case 'array':
        if (c === 'L') {
          state = 'class';
        } else if (c !== '[') {
          state = 'type';
        }
    }
  }
}

/**
 * Represents a particular method.
 * ```
 * CONSTANT_Methodref_info {
 *   u1 tag;
 *   u2 class_index;
 *   u2 name_and_type_index;
 * }
 * ```
 */
export class MethodReference implements IConstantPoolItem {
  /**
   * The signature of the method, e.g. foo()V.
   */
  public methodSignature: string;
  /**
   * The actual method.
   */
  public method: methods.Method = null;
  public classInfo: ClassReference;
  public nameAndTypeInfo: NameAndTypeInfo;
  private paramWordSize: number = -1;
  constructor(classInfo: ClassReference, nameAndTypeInfo: NameAndTypeInfo) {
    this.classInfo = classInfo;
    this.methodSignature = nameAndTypeInfo.name + nameAndTypeInfo.descriptor;
    this.nameAndTypeInfo = nameAndTypeInfo;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.METHODREF;
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var classIndex = byteStream.getUint16(),
      nameAndTypeIndex = byteStream.getUint16(),
      classInfo = <ClassReference> constantPool.get(classIndex),
      nameAndTypeInfo = <NameAndTypeInfo> constantPool.get(nameAndTypeIndex);
    assert(classInfo.getType() === enums.ConstantPoolItemType.CLASS &&
      nameAndTypeInfo.getType() === enums.ConstantPoolItemType.NAME_AND_TYPE);
    return new this(classInfo, nameAndTypeInfo);
  }

  /**
   * In the JVM, 64-bit parameters are two words long. Everything else is 1.
   * This method parses a method descriptor, and returns the length of the
   * parameters in terms of machine words.
   */
  public getParamWordSize(): number {
    if (this.paramWordSize >= 0) {
      return this.paramWordSize;
    } else {
      return this.paramWordSize = _getParamWordSize(this.methodSignature);
    }
  }
}
CP_CLASSES[enums.ConstantPoolItemType.METHODREF] = MethodReference;

/**
 * Represents a particular interface method.
 * ```
 * CONSTANT_InterfaceMethodref_info {
 *   u1 tag;
 *   u2 class_index;
 *   u2 name_and_type_index;
 * }
 * ```
 */
export class InterfaceMethodReference implements IConstantPoolItem {
  /**
   * The specific interface method referenced.
   */
  public method: methods.Method = null;
  public classInfo: ClassReference;
  public methodSignature: string;
  public nameAndTypeInfo: NameAndTypeInfo;
  constructor(classInfo: ClassReference, nameAndTypeInfo: NameAndTypeInfo) {
    this.classInfo = classInfo;
    this.methodSignature = nameAndTypeInfo.name + nameAndTypeInfo.descriptor;
    this.nameAndTypeInfo = nameAndTypeInfo;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.INTERFACE_METHODREF;
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var classIndex = byteStream.getUint16(),
      nameAndTypeIndex = byteStream.getUint16(),
      classInfo = <ClassReference> constantPool.get(classIndex),
      nameAndTypeInfo = <NameAndTypeInfo> constantPool.get(nameAndTypeIndex);
    assert(classInfo.getType() === enums.ConstantPoolItemType.CLASS &&
      nameAndTypeInfo.getType() === enums.ConstantPoolItemType.NAME_AND_TYPE);
    return new this(classInfo, nameAndTypeInfo);
  }
}
CP_CLASSES[enums.ConstantPoolItemType.INTERFACE_METHODREF] = InterfaceMethodReference;

/**
 * Represents a particular field.
 * ```
 * CONSTANT_Fieldref_info {
 *   u1 tag;
 *   u2 class_index;
 *   u2 name_and_type_index;
 * }
 * ```
 */
export class FieldReference implements IConstantPoolItem {
  /**
   * Name of the field. Primarily needed for static fields.
   */
  public fieldName: string;
  /**
   * The name of the class that the field belongs to + its name. Needed
   * primarily for object fields.
   * e.g.:
   * Lfoo/bar/Baz;value
   * We don't know this value until the referenced class is resolved and we
   * perform field resolution.
   */
  public fullFieldName: string = null;
  /**
   * The class that owns this particular field.
   */
  public owningClass: ClassData.ReferenceClassData = null;
  public classInfo: ClassReference;
  public nameAndTypeInfo: NameAndTypeInfo;
  constructor(classInfo: ClassReference, nameAndTypeInfo: NameAndTypeInfo) {
    this.classInfo = classInfo;
    this.fieldName = nameAndTypeInfo.name;
    this.nameAndTypeInfo = nameAndTypeInfo;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.FIELDREF;
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var classIndex = byteStream.getUint16(),
      nameAndTypeIndex = byteStream.getUint16(),
      classInfo = <ClassReference> constantPool.get(classIndex),
      nameAndTypeInfo = <NameAndTypeInfo> constantPool.get(nameAndTypeIndex);
    assert(classInfo.getType() === enums.ConstantPoolItemType.CLASS &&
      nameAndTypeInfo.getType() === enums.ConstantPoolItemType.NAME_AND_TYPE);
    return new this(classInfo, nameAndTypeInfo);
  }
}
CP_CLASSES[enums.ConstantPoolItemType.FIELDREF] = FieldReference;

// #endregion

/**
 * Constant pool type *resolution tiers*. Value is the tier, key is the
 * constant pool type.
 * Tier 0 has no references to other constant pool items, and can be resolved
 * first.
 * Tier 1 refers to tier 0 items.
 * Tier n refers to tier n-1 items and below.
 * Initialized in the given fashion to give the JS engine a tasty type hint.
 */
var CONSTANT_POOL_TIER: number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
// Populate CONSTANT_POOL_TIER. Put into a closure to avoid scope pollution.
((tierInfos: enums.ConstantPoolItemType[][]) => {
  tierInfos.forEach((tierInfo: enums.ConstantPoolItemType[], index: number) => {
    tierInfo.forEach((type: enums.ConstantPoolItemType) => {
      CONSTANT_POOL_TIER[type] = index;
    });
  });
})([
    // Tier 0
    [
      enums.ConstantPoolItemType.UTF8,
      enums.ConstantPoolItemType.INTEGER,
      enums.ConstantPoolItemType.FLOAT,
      enums.ConstantPoolItemType.LONG,
      enums.ConstantPoolItemType.DOUBLE
    ],
    // Tier 1
    [
      enums.ConstantPoolItemType.CLASS,
      enums.ConstantPoolItemType.STRING,
      enums.ConstantPoolItemType.NAME_AND_TYPE,
      enums.ConstantPoolItemType.METHOD_TYPE // @todo Implement
    ],
    // Tier 2
    [
      enums.ConstantPoolItemType.FIELDREF,
      enums.ConstantPoolItemType.METHODREF,
      enums.ConstantPoolItemType.INTERFACE_METHODREF,
      enums.ConstantPoolItemType.INVOKE_DYNAMIC // @todo Implement
    ],
    // Tier 3
    [
      enums.ConstantPoolItemType.METHOD_HANDLE // @todo Implement
    ]
  ]);

/**
 * Represents a constant pool for a particular class.
 */
export class ConstantPool {
  /**
   * The core constant pool array. Note that some indices are undefined.
   */
  private constantPool: IConstantPoolItem[];

  public parse(byteStream: ByteStream): ByteStream {
    var cpCount = byteStream.getUint16(),
      // First key is the tier.
      deferredQueue: { offset: number; index: number }[][] = [[], [], []],
      // The ending offset of the constant pool items.
      endIdx = 0, idx = 1,
      // Tag of the currently-being-processed item.
      tag = 0,
      // Offset of the currently-being-processed item.
      itemOffset = 0,
      // Tier of the currently-being-processed item.
      itemTier = 0;
    this.constantPool = new Array<IConstantPoolItem>(cpCount);

    // Scan for tier info.
    while (idx < cpCount) {
      itemOffset = byteStream.pos();
      tag = byteStream.getUint8();
      assert(CP_CLASSES[tag] !== null && CP_CLASSES[tag] !== undefined);
      itemTier = CONSTANT_POOL_TIER[tag];
      if (itemTier > 0) {
        deferredQueue[itemTier - 1].push({ offset: itemOffset, index: idx });
        byteStream.skip(CP_CLASSES[tag].infoByteSize);
      } else {
        this.constantPool[idx] = CP_CLASSES[tag].fromBytes(byteStream, this);
      }
      idx += CP_CLASSES[tag].size;
    }
    endIdx = byteStream.pos();

    // Process tiers.
    deferredQueue.forEach((deferredItems: { offset: number; index: number; }[]) => {
      deferredItems.forEach((item: { offset: number; index: number; }) => {
        byteStream.seek(item.offset);
        tag = byteStream.getUint8();
        this.constantPool[item.index] = CP_CLASSES[tag].fromBytes(byteStream, this);
      });
    });

    // Return to the correct offset, at the end of the CP data.
    byteStream.seek(endIdx);
    return byteStream;
  }

  public get(idx: number): IConstantPoolItem {
    assert(this.constantPool[idx] !== undefined, "Invalid ConstantPool reference.");
    return this.constantPool[idx];
  }

  public each(fn: (idx: number, item: IConstantPoolItem) => void): void {
    this.constantPool.forEach((item: IConstantPoolItem, idx: number) => {
      if (item !== undefined) {
        fn(idx, item);
      }
    });
  }
}
