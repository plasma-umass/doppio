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
// For type information.
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
 * TODO: Avoid decoding into a string if possible, as the JVM represents them
 * as char arrays.
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
 * @todo Have a classloader-local cache of class reference objects.
 */
export class ClassReference implements IConstantPoolItem {
  /**
   * The name of the class, in full descriptor form, e.g.:
   * Lfoo/bar/Baz;
   */
  public name: string;
  /**
   * Contains a stashed ClassData object for this class. Can be an array
   * or a reference class.
   */
  public cls: ClassData.ClassData = null;
  /**
   * Contains a stashed *Array*ClassData for the array version of this class
   * (i.e. '[' + name).
   */
  public arrayClass: ClassData.ArrayClassData = null;
  constructor(name: string) {
    this.name = name;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.CLASS;
  }

  /**
   * Attempt to retrieve this class synchronously.
   * Returns null if the class needs to be asynchronously loaded.
   * @note Does not check for initialization!
   */
  public tryGetClass(cl: ClassLoader.ClassLoader): ClassData.ClassData {
    if (this.cls === null) {
      this.cls = cl.getResolvedClass(this.name);
    }
    return this.cls;
  }

  /**
   * Asynchronously resolves the class.
   */
  public getClass(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, cb: (cdata: ClassData.ClassData) => void, explicit: boolean = true): void {
    if (this.cls !== null) {
      // Short circuit.
      setImmediate(() => cb(this.cls));
      return;
    }

    cl.resolveClass(thread, this.name, (cdata: ClassData.ClassData) => {
      this.cls = cdata;
      cb(cdata);
    }, explicit);
  }

  /**
   * Retrieves an array version of this class.
   */
  public getArrayClass(cl: ClassLoader.ClassLoader): ClassData.ArrayClassData {
    if (this.arrayClass === null) {
      this.arrayClass = <ClassData.ArrayClassData> cl.getResolvedClass("[" + this.name);
    }
    return this.arrayClass;
  }

  public static size: number = 1;
  public static infoByteSize: number = 2;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var nameIndex = byteStream.getUint16(),
      cpItem = constantPool.get(nameIndex);
    assert(cpItem.getType() === enums.ConstantPoolItemType.UTF8,
      'ConstantPool ClassReference type != UTF8');
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
  // Stores a MethodType if NameAndTypeInfo is a method descriptor, or the
  // class of a field if NameAndTypeInfo is a field descriptor.
  public type: java_object.JavaObject = null;
  constructor(name: string, descriptor: string) {
    this.name = name;
    this.descriptor = descriptor;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.NAME_AND_TYPE;
  }

  /**
   * Construct or retrieve the MethodType object corresponding to this
   * NameAndTypeInfo entry.
   */
  public getMethodType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, cb: (e: any, type: java_object.JavaObject) => void) {
    assert(this.descriptor[0] === '(', "Must be a method type.");
    if (this.type !== null) {
      cb(null, this.type);
    } else {
      util.createMethodType(thread, cl, this.descriptor, (e: any, type: java_object.JavaObject) => {
        this.type = type;
        cb(e, type);
      });
    }
  }

  public getFieldType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, cb: (e: any, type: java_object.JavaObject) => void) {
    assert(this.descriptor[0] !== '(', 'Must be a field type.');
    if (this.type !== null) {
      cb(null, this.type);
    } else {
      // Fetch the class associated with the descriptor.
      cl.initializeClass(thread, this.descriptor, (cdata: ClassData.ClassData) => {
        if (cdata !== null) {
          cb(null, cdata.getClassObject(thread));
        }
      });
    }
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var nameIndex = byteStream.getUint16(),
      descriptorIndex = byteStream.getUint16(),
      nameConst = <ConstUTF8> constantPool.get(nameIndex),
      descriptorConst = <ConstUTF8> constantPool.get(descriptorIndex);
    assert(nameConst.getType() === enums.ConstantPoolItemType.UTF8 &&
      descriptorConst.getType() === enums.ConstantPoolItemType.UTF8,
      'ConstantPool NameAndTypeInfo types != UTF8');
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
    assert(utf8Info.getType() === enums.ConstantPoolItemType.UTF8,
      'ConstantPool ConstString type != UTF8');
    return new this(utf8Info.value);
  }
}
CP_CLASSES[enums.ConstantPoolItemType.STRING] = ConstString;

/**
 * Represents a given method type.
 * ```
 * CONSTANT_MethodType_info {
 *   u1 tag;
 *   u2 descriptor_index;
 * }
 * ```
 */
export class MethodType implements IConstantPoolItem {
  public descriptor: string;
  /**
   * A MethodType object for this constant pool item.
   */
  public type: java_object.JavaObject;
  constructor(descriptor: string) {
    this.descriptor = descriptor;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.METHOD_TYPE;
  }

  public getMethodType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, cb: (e: any, type: java_object.JavaObject) => void) {
    if (this.type !== null) {
      cb(null, this.type);
    } else {
      util.createMethodType(thread, cl, this.descriptor, (e: any, type: java_object.JavaObject) => {
        this.type = type;
        cb(e, type);
      });
    }
  }

  public static size: number = 1;
  public static infoByteSize: number = 2;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var descriptorIndex = byteStream.getUint16(),
      utf8Info = <ConstUTF8> constantPool.get(descriptorIndex);
    assert(utf8Info.getType() === enums.ConstantPoolItemType.UTF8,
      'ConstantPool MethodType type != UTF8');
    return new this(utf8Info.value);
  }
}
CP_CLASSES[enums.ConstantPoolItemType.METHOD_TYPE] = MethodType;

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
  /**
   * For signature polymorphic functions, contains a reference to the MemberName
   * object for the method that invokes the desired function.
   */
  public memberName: java_object.JavaObject = null;
  /**
   * For signature polymorphic functions, contains an object that needs to be
   * pushed onto the stack before invoking memberName.
   */
  public appendix: java_object.JavaObject = null;
  constructor(classInfo: ClassReference, nameAndTypeInfo: NameAndTypeInfo) {
    this.classInfo = classInfo;
    this.methodSignature = nameAndTypeInfo.name + nameAndTypeInfo.descriptor;
    this.nameAndTypeInfo = nameAndTypeInfo;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.METHODREF;
  }

  public getMethodHandleType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, cb: (e: any, type: java_object.JavaObject) => void): void {
    this.nameAndTypeInfo.getMethodType(thread, cl, cb);
  }

  /**
   * Ensures that this.method is set.
   */
  public ensureMethodSet(thread: threading.JVMThread): boolean {
    if (this.method !== null) {
      return true;
    }

    if (this.classInfo.cls !== null) {
      this.method = this.classInfo.cls.methodLookup(thread, this.nameAndTypeInfo.name + this.nameAndTypeInfo.descriptor);
    }

    return this.method !== null;
  }

  public resolveMemberName(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, accessingClazz: ClassData.ReferenceClassData, cb: (e: java_object.JavaObject) => void): void {
    if (this.memberName) {
      setImmediate(() => cb(null));
      return;
    }

    var linkMethod: methods.Method = thread.getBsCl()
      .getInitializedClass(thread, 'Ljava/lang/invoke/MethodHandleNatives;')
      /* MemberName linkMethod(Class<?> callerClass, int refKind, Class<?> defc,
         String name, Object type,
         Object[] appendixResult) */
      .methodLookup(thread, 'linkMethod(Ljava/lang/Class;ILjava/lang/Class;Ljava/lang/String;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/invoke/MemberName;'),
      appendix: java_object.JavaArray = (<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/Object;')).create([null]),
      type: java_object.JavaObject,
      finishLinkingMethod = () => {
        thread.runMethod(linkMethod, [accessingClazz.getClassObject(thread),
          enums.MethodHandleReferenceKind.INVOKEVIRTUAL,
          this.classInfo.cls.getClassObject(thread),
          thread.getThreadPool().getJVM().internString(this.nameAndTypeInfo.name),
          this.nameAndTypeInfo.type, appendix],
          (e?: java_object.JavaObject, rv?: java_object.JavaObject) => {
            if (e !== null) {
              cb(e);
            } else {
              this.appendix = appendix.array[0];
              this.memberName = rv;
              cb(null);
            }
          });
        };

    // Get the method's type.
    if (this.nameAndTypeInfo.type !== null) {
      finishLinkingMethod();
    } else {
      this.nameAndTypeInfo.getMethodType(thread, cl, (e: java_object.JavaObject, mt: java_object.JavaObject) => {
        if (e) {
          cb(e);
        } else {
          finishLinkingMethod();
        }
      });
    }
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var classIndex = byteStream.getUint16(),
      nameAndTypeIndex = byteStream.getUint16(),
      classInfo = <ClassReference> constantPool.get(classIndex),
      nameAndTypeInfo = <NameAndTypeInfo> constantPool.get(nameAndTypeIndex);
    assert(classInfo.getType() === enums.ConstantPoolItemType.CLASS &&
      nameAndTypeInfo.getType() === enums.ConstantPoolItemType.NAME_AND_TYPE,
      'ConstantPool MethodReference types mismatch');
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
  private methodTypeObject: java_object.JavaObject = null;
  constructor(classInfo: ClassReference, nameAndTypeInfo: NameAndTypeInfo) {
    this.classInfo = classInfo;
    this.methodSignature = nameAndTypeInfo.name + nameAndTypeInfo.descriptor;
    this.nameAndTypeInfo = nameAndTypeInfo;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.INTERFACE_METHODREF;
  }

  public ensureMethodSet(thread: threading.JVMThread): boolean {
    if (this.method !== null) {
      return true;
    }

    if (this.classInfo.cls !== null) {
      this.method = this.classInfo.cls.methodLookup(thread, this.nameAndTypeInfo.name + this.nameAndTypeInfo.descriptor);
    }

    return this.method !== null;
  }

  public getMethodHandleType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, cb: (e: any, type: java_object.JavaObject) => void): void {
    this.nameAndTypeInfo.getMethodType(thread, cl, cb);
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var classIndex = byteStream.getUint16(),
      nameAndTypeIndex = byteStream.getUint16(),
      classInfo = <ClassReference> constantPool.get(classIndex),
      nameAndTypeInfo = <NameAndTypeInfo> constantPool.get(nameAndTypeIndex);
    assert(classInfo.getType() === enums.ConstantPoolItemType.CLASS &&
      nameAndTypeInfo.getType() === enums.ConstantPoolItemType.NAME_AND_TYPE,
      'ConstantPool InterfaceMethodReference types mismatch');
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
  public classInfo: ClassReference;
  public nameAndTypeInfo: NameAndTypeInfo;
  public owningClass: ClassData.ReferenceClassData = null;
  constructor(classInfo: ClassReference, nameAndTypeInfo: NameAndTypeInfo) {
    this.classInfo = classInfo;
    this.fieldName = nameAndTypeInfo.name;
    this.nameAndTypeInfo = nameAndTypeInfo;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.FIELDREF;
  }

  /**
   * Returns the `type` argument needed for constructing a method handle to this
   * field reference. In this case, it's the class of the field's type.
   */
  public getMethodHandleType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, cb: (e: any, type: java_object.JavaObject) => void): void {
    this.nameAndTypeInfo.getFieldType(thread, cl, cb);
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var classIndex = byteStream.getUint16(),
      nameAndTypeIndex = byteStream.getUint16(),
      classInfo = <ClassReference> constantPool.get(classIndex),
      nameAndTypeInfo = <NameAndTypeInfo> constantPool.get(nameAndTypeIndex);
    assert(classInfo.getType() === enums.ConstantPoolItemType.CLASS &&
      nameAndTypeInfo.getType() === enums.ConstantPoolItemType.NAME_AND_TYPE,
      'ConstantPool FieldReference types mismatch');
    return new this(classInfo, nameAndTypeInfo);
  }
}
CP_CLASSES[enums.ConstantPoolItemType.FIELDREF] = FieldReference;

/**
 * Used by an invokedynamic instruction to specify a bootstrap method,
 * the dynamic invocation name, the argument and return types of the call,
 * and optionally, a sequence of additional constants called static arguments
 * to the bootstrap method.
 * ```
 * CONSTANT_InvokeDynamic_info {
 *   u1 tag;
 *   u2 bootstrap_method_attr_index;
 *   u2 name_and_type_index;
 * }
 * ```
 */
export class InvokeDynamic implements IConstantPoolItem {
  public bootstrapMethodAttrIndex: number;
  public nameAndTypeInfo: NameAndTypeInfo;
  public bootstrapMethod: [MethodHandle, IConstantPoolItem[]] = null;
  /**
   * Once a CallSite is defined for a particular lexical occurrence of
   * InvokeDynamic, the CallSite will be reused for each future execution
   * of that particular occurrence.
   *
   * We store the CallSite objects here for future retrieval, along with an
   * optional 'appendix' argument.
   */
  private callSiteObjects: { [pc: number]: [java_object.JavaObject, java_object.JavaObject] } = {};

  constructor(bootstrapMethodAttrIndex: number, nameAndTypeInfo: NameAndTypeInfo) {
    this.bootstrapMethodAttrIndex = bootstrapMethodAttrIndex;
    this.nameAndTypeInfo = nameAndTypeInfo;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.INVOKE_DYNAMIC;
  }

  public getCallSiteObject(pc: number): [java_object.JavaObject, java_object.JavaObject] {
    var cso = this.callSiteObjects[pc]
    if (cso) {
      return cso;
    } else {
      return null;
    }
  }

  public constructCallSiteObject(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, clazz: ClassData.ReferenceClassData, pc: number, cb: (cso: java_object.JavaObject) => void): void {
    assert(this.callSiteObjects[pc] === undefined, 'Should be impossible to construct same callsite object twice.');
    var bootstrapMethod = clazz.getBootstrapMethod(this.bootstrapMethodAttrIndex);
    /**
     * A call site specifier gives a symbolic reference to a method handle which
     * is to serve as the bootstrap method for a dynamic call site (§4.7.23).
     * The method handle is resolved to obtain a reference to an instance of
     * java.lang.invoke.MethodHandle (§5.4.3.5).
     */
    function getMethodHandle(cb: (mh: java_object.JavaObject) => void): void {
      if (bootstrapMethod[0].methodHandle !== null) {
        cb(bootstrapMethod[0].methodHandle);
      } else {
        bootstrapMethod[0].constructMethodHandle(thread, clazz, cl, () => {
          cb(bootstrapMethod[0].methodHandle);
        });
      }
    }

    /**
     * A call site specifier gives zero or more static arguments, which
     * communicate application-specific metadata to the bootstrap method. Any
     * static arguments which are symbolic references to classes, method
     * handles, or method types are resolved, as if by invocation of the ldc
     * instruction (§ldc), to obtain references to Class objects,
     * java.lang.invoke.MethodHandle objects, and java.lang.invoke.MethodType
     * objects respectively. Any static arguments that are string literals are
     * used to obtain references to String objects.
     *
     * TODO: Cache objects on bootstrapMethods!
     */
    function getArguments(cb: (args: java_object.JavaObject[]) => void): void {
      var cpItems = bootstrapMethod[1], rv: java_object.JavaObject[] = [];
      util.asyncForEach(cpItems, (cpItem: IConstantPoolItem, nextItem: (err?: any) => void) => {
        switch (cpItem.getType()) {
          case enums.ConstantPoolItemType.CLASS:
            (<ClassReference> cpItem).getClass(thread, cl, (cdata: ClassData.ClassData) => {
              assert(cdata !== null, "TODO: Figure out what to do when this fails...");
              rv.push(cdata.getClassObject(thread));
              nextItem();
            }, false);
            break;
          case enums.ConstantPoolItemType.METHOD_HANDLE:
            var mh = <MethodHandle> cpItem;
            if (mh.methodHandle !== null) {
              rv.push(mh.methodHandle);
              nextItem();
            } else {
              mh.constructMethodHandle(thread, clazz, cl, (err: any, methodHandle: java_object.JavaObject) => {
                if (err) {
                  assert(false, "TODO: Figure out what to do here...");
                }
                rv.push(methodHandle);
                nextItem();
              });
            }
            break;
          case enums.ConstantPoolItemType.METHOD_TYPE:
            (<MethodType> cpItem).getMethodType(thread, cl, (e: any, mt: java_object.JavaObject) => {
              if (e) {
                assert(false, "TODO: Figure out what to do here...");
              }
              rv.push(mt);
              nextItem();
            });
            break;
          case enums.ConstantPoolItemType.STRING:
            // TODO: Bake this into the CP item.
            var cString = <ConstString> cpItem;
            if (cString.value === null) {
              cString.value = thread.getThreadPool().getJVM().internString(cString.stringValue);
            }
            rv.push(cString.value);
            nextItem();
            break;
          case enums.ConstantPoolItemType.UTF8:
            rv.push(thread.getThreadPool().getJVM().internString((<ConstUTF8> cpItem).value));
            nextItem();
            break;
          case enums.ConstantPoolItemType.INTEGER:
            rv.push((<ClassData.PrimitiveClassData> cl.getInitializedClass(thread, 'Ljava/lang/Integer;')).createWrapperObject(thread, (<ConstInt32> cpItem).value));
            break;
          case enums.ConstantPoolItemType.LONG:
            rv.push((<ClassData.PrimitiveClassData> cl.getInitializedClass(thread, 'Ljava/lang/Long;')).createWrapperObject(thread, (<ConstLong> cpItem).value));
            break;
          case enums.ConstantPoolItemType.FLOAT:
            rv.push((<ClassData.PrimitiveClassData> cl.getInitializedClass(thread, 'Ljava/lang/Float;')).createWrapperObject(thread, (<ConstFloat> cpItem).value));
            break;
          case enums.ConstantPoolItemType.DOUBLE:
            rv.push((<ClassData.PrimitiveClassData> cl.getInitializedClass(thread, 'Ljava/lang/Double;')).createWrapperObject(thread, (<ConstDouble> cpItem).value));
            break;
          default:
            assert(false, "Invalid CPItem for static args: " + enums.ConstantPoolItemType[cpItem.getType()]);
            break;
        }
      }, (err?: any) => {
        cb(rv);
      });
    }

    /**
     * A call site specifier gives a method descriptor, TD. A reference to an
     * instance of java.lang.invoke.MethodType is obtained as if by resolution
     * of a symbolic reference to a method type with the same parameter and
     * return types as TD (§5.4.3.5).
     */
    this.nameAndTypeInfo.getMethodType(thread, cl, (e: any, mt: java_object.JavaObject) => {
      if (e) {
        thread.throwException(e);
      } else {
        getMethodHandle((mh: java_object.JavaObject) => {
          getArguments((args: java_object.JavaObject[]) => {
            /**
             * Do what all OpenJDK-based JVMs do: Call
             * MethodHandleNatives.linkCallSite with:
             * - The class w/ the invokedynamic instruction
             * - The bootstrap method
             * - The name string from the nameAndTypeInfo
             * - The methodType object from the nameAndTypeInfo
             * - The static arguments from the bootstrap method.
             * - A 1-length appendix box.
             */
            var methodName = thread.getThreadPool().getJVM().internString(this.nameAndTypeInfo.name),
              appendixArr = (<ClassData.ArrayClassData> cl.getInitializedClass(thread, '[Ljava/lang/Object;')).create([null]),
              staticArgs = (<ClassData.ArrayClassData> cl.getInitializedClass(thread, '[Ljava/lang/Object;')).create(args),
              mhn = cl.getInitializedClass(thread, 'Ljava/lang/invoke/MethodHandleNatives;');
            thread.runMethod(mhn.methodLookup(thread, 'linkCallSite(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/invoke/MemberName;'),
              [clazz.getClassObject(thread), mh, methodName, mt, staticArgs, appendixArr], (e?: any, rv?: any) => {
              if (e) {
                thread.throwException(e);
              } else {
                this.callSiteObjects[pc] = [rv, appendixArr.array[0]];
                cb(rv);
              }
            });
          });
        });
      }
    });
  }

  public static size: number = 1;
  public static infoByteSize: number = 4;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var bootstrapMethodAttrIndex = byteStream.getUint16(),
      nameAndTypeIndex = byteStream.getUint16(),
      nameAndTypeInfo = <NameAndTypeInfo> constantPool.get(nameAndTypeIndex);
    assert(nameAndTypeInfo.getType() === enums.ConstantPoolItemType.NAME_AND_TYPE,
      'ConstantPool InvokeDynamic types mismatch');
    return new this(bootstrapMethodAttrIndex, nameAndTypeInfo);
  }
}
CP_CLASSES[enums.ConstantPoolItemType.INVOKE_DYNAMIC] = InvokeDynamic;

// #endregion

// #region Tier 3

export interface IConstantPoolReference extends IConstantPoolItem {
  classInfo: ClassReference;
  nameAndTypeInfo: NameAndTypeInfo;
  getMethodHandleType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, cb: (e: any, type: java_object.JavaObject) => void): void;
}

/**
 * Represents a given method handle.
 * ```
 * CONSTANT_MethodHandle_info {
 *   u1 tag;
 *   u1 reference_kind;
 *   u2 reference_index;
 * }
 * ```
 */
export class MethodHandle implements IConstantPoolItem {
  // @todo Use a union type here:
  //   FieldReference|MethodReference|InterfaceMethodReference
  public reference: IConstantPoolReference;
  public referenceType: enums.MethodHandleReferenceKind;
  /**
   * Java object representing this particular method handle.
   */
  public methodHandle: java_object.JavaObject = null;
  constructor(reference: IConstantPoolReference, referenceType: enums.MethodHandleReferenceKind) {
    this.reference = reference;
    this.referenceType = referenceType;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.METHOD_HANDLE;
  }

  /**
   * Asynchronously constructs a JVM-visible MethodHandle object for this
   * MethodHandle.
   *
   * Requires producing the following, and passing it to a MethodHandle
   * constructor:
   * * [java.lang.Class] The defining class.
   * * [java.lang.String] The name of the field/method/etc.
   * * [java.lang.invoke.MethodType | java.lang.Class] The type of the field OR,
   *   if a method, the type of the method descriptor.
   *
   * If needed, this function will resolve needed classes.
   */
  public constructMethodHandle(thread: threading.JVMThread, caller: ClassData.ClassData, cl: ClassLoader.ClassLoader, cb: (err: any, methodHandle: java_object.JavaObject) => void): void {
    var definingClassRef: ClassReference = this.reference.classInfo,
      nameAndTypeInfo: NameAndTypeInfo = this.reference.nameAndTypeInfo,
      isMethod: boolean = this.reference.getType() === enums.ConstantPoolItemType.FIELDREF ? false : true,
      definingClass: ClassData.ClassData = definingClassRef.tryGetClass(cl),
      definingClassObject: java_object.JavaClassObject,
      name: java_object.JavaObject = thread.getThreadPool().getJVM().internString(nameAndTypeInfo.name),
      getType = () => {
        this.reference.getMethodHandleType(thread, cl, (e: any, type: java_object.JavaObject) => {
          if (!e) {
            // Construct the method handle!
            var methodHandleNatives = cl.getInitializedClass(thread, 'Ljava/lang/invoke/MethodHandleNatives;'),
              linkMethodHandleConstant = methodHandleNatives.methodLookup(thread, 'linkMethodHandleConstant(Ljava/lang/Class;ILjava/lang/Class;Ljava/lang/String;Ljava/lang/Object;)Ljava/lang/invoke/MethodHandle;');
            thread.runMethod(linkMethodHandleConstant, [caller.getClassObject(thread), this.referenceType, definingClassObject, name, type], (e?: java_object.JavaObject, methodHandle?: java_object.JavaObject) => {
              if (e) {
                thread.throwException(e);
              } else {
                this.methodHandle = methodHandle;
                cb(null, methodHandle);
              }
            });
          }
        });
      };

    assert(this.methodHandle === null, "Should not be constructing the same MethodHandle twice!");

    if (definingClass === null) {
      definingClassRef.getClass(thread, cl, (cdata: ClassData.ClassData) => {
        definingClassObject = cdata.getClassObject(thread);
        getType();
      });
    } else {
      definingClassObject = definingClass.getClassObject(thread);
      getType();
    }
  }

  public static size: number = 1;
  public static infoByteSize: number = 3;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var referenceKind: enums.MethodHandleReferenceKind = byteStream.getUint8(),
      referenceIndex = byteStream.getUint16(),
      reference: IConstantPoolItem = constantPool.get(referenceIndex);

    assert(0 < referenceKind && referenceKind < 10,
      'ConstantPool MethodHandle invalid referenceKind: ' + referenceKind);
    // Sanity check.
    assert((() => {
      switch (referenceKind) {
        case enums.MethodHandleReferenceKind.GETFIELD:
        case enums.MethodHandleReferenceKind.GETSTATIC:
        case enums.MethodHandleReferenceKind.PUTFIELD:
        case enums.MethodHandleReferenceKind.PUTSTATIC:
          return reference.getType() === enums.ConstantPoolItemType.FIELDREF;
        case enums.MethodHandleReferenceKind.INVOKEINTERFACE:
          return reference.getType() === enums.ConstantPoolItemType.INTERFACE_METHODREF
            && (<MethodReference>reference).nameAndTypeInfo.name[0] !== '<';
        case enums.MethodHandleReferenceKind.INVOKEVIRTUAL:
        case enums.MethodHandleReferenceKind.INVOKESTATIC:
        case enums.MethodHandleReferenceKind.INVOKESPECIAL:
          // NOTE: Spec says METHODREF, but I've found instances where
          // INVOKESPECIAL is used on an INTERFACE_METHODREF.
          return (reference.getType() === enums.ConstantPoolItemType.METHODREF
            || reference.getType() === enums.ConstantPoolItemType.INTERFACE_METHODREF)
            && (<MethodReference>reference).nameAndTypeInfo.name[0] !== '<';
        case enums.MethodHandleReferenceKind.NEWINVOKESPECIAL:
          return reference.getType() === enums.ConstantPoolItemType.METHODREF
            && (<MethodReference>reference).nameAndTypeInfo.name === '<init>';
      }
      return true;
    })(), "Invalid constant pool reference for method handle reference type: " + enums.MethodHandleReferenceKind[referenceKind]);

    return new this(<any> reference, referenceKind);
  }
}
CP_CLASSES[enums.ConstantPoolItemType.METHOD_HANDLE] = MethodHandle;

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
      enums.ConstantPoolItemType.METHOD_TYPE
    ],
    // Tier 2
    [
      enums.ConstantPoolItemType.FIELDREF,
      enums.ConstantPoolItemType.METHODREF,
      enums.ConstantPoolItemType.INTERFACE_METHODREF,
      enums.ConstantPoolItemType.INVOKE_DYNAMIC
    ],
    // Tier 3
    [
      enums.ConstantPoolItemType.METHOD_HANDLE
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

  public parse(byteStream: ByteStream, cpPatches: java_object.JavaArray = null): ByteStream {
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
      assert(CP_CLASSES[tag] !== null && CP_CLASSES[tag] !== undefined,
        'Unknown ConstantPool tag: ' + tag);
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
        if (cpPatches !== null && cpPatches.array[item.index] !== null && cpPatches.array[item.index] !== undefined) {
          /*
           * For each CP entry, the corresponding CP patch must either be null or have
           * the format that matches its tag:
           *
           * * Integer, Long, Float, Double: the corresponding wrapper object type from java.lang
           * * Utf8: a string (must have suitable syntax if used as signature or name)
           * * Class: any java.lang.Class object
           * * String: any object (not just a java.lang.String)
           * * InterfaceMethodRef: (NYI) a method handle to invoke on that call site's arguments
           */
          var patchObj: java_object.JavaObject = cpPatches.array[item.index];
          switch (patchObj.cls.getInternalName()) {
            case 'Ljava/lang/Integer;':
              assert(tag === enums.ConstantPoolItemType.INTEGER);
              (<ConstInt32> this.constantPool[item.index]).value = patchObj.get_field(null, 'Ljava/lang/Integer;value');
              break;
            case 'Ljava/lang/Long;':
              assert(tag === enums.ConstantPoolItemType.LONG);
              (<ConstLong> this.constantPool[item.index]).value = patchObj.get_field(null, 'Ljava/lang/Long;value');
              break;
            case 'Ljava/lang/Float;':
              assert(tag === enums.ConstantPoolItemType.FLOAT);
              (<ConstFloat> this.constantPool[item.index]).value = patchObj.get_field(null, 'Ljava/lang/Float;value');
              break;
            case 'Ljava/lang/Double;':
              assert(tag === enums.ConstantPoolItemType.DOUBLE);
              (<ConstDouble> this.constantPool[item.index]).value = patchObj.get_field(null, 'Ljava/lang/Double;value');
              break;
            case 'Ljava/lang/String;':
              assert(tag === enums.ConstantPoolItemType.UTF8);
              (<ConstUTF8> this.constantPool[item.index]).value = patchObj.jvm2js_str();
              break;
            case 'Ljava/lang/Class;':
              assert(tag === enums.ConstantPoolItemType.CLASS);
              (<ClassReference> this.constantPool[item.index]).name = (<java_object.JavaClassObject> patchObj).$cls.getInternalName();
              (<ClassReference> this.constantPool[item.index]).cls = (<java_object.JavaClassObject> patchObj).$cls;
              break;
            default:
              assert(tag === enums.ConstantPoolItemType.STRING);
              (<ConstString> this.constantPool[item.index]).stringValue = "";
              (<ConstString> this.constantPool[item.index]).value = patchObj;
              break;
          }
        }
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
