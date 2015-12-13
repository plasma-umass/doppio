"use strict";
import gLong = require('./gLong');
import ByteStream = require('./ByteStream');
import util = require('./util');
import enums = require('./enums');
import assert = require('./assert');
import ClassData = require('./ClassData');
import methods = require('./methods');
import ClassLoader = require('./ClassLoader');
// For type information.
import threading = require('./threading');
import JVMTypes = require('../includes/JVMTypes');

/**
 * Represents a constant pool item. Use the item's type to discriminate among them.
 */
export interface IConstantPoolItem {
  getType(): enums.ConstantPoolItemType;
  /**
   * Is this constant pool item resolved? Use to discriminate among resolved
   * and unresolved reference types.
   */
  isResolved(): boolean;
  /**
   * Returns the constant associated with the constant pool item. The item *must*
   * be resolved.
   * Only defined on constant pool items that return values through LDC.
   */
  getConstant?(thread: threading.JVMThread): any;
  /**
   * Resolves an unresolved constant pool item. Can only be called if
   * isResolved() returns false.
   */
  resolve?(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, caller: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, cb: (status: boolean) => void, explicit?: boolean): void;
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
  constructor(rawBytes: Buffer) {
    this.value = this.bytes2str(rawBytes);
  }

  /**
   * Parse Java's pseudo-UTF-8 strings into valid UTF-16 codepoints (spec 4.4.7)
   * Note that Java uses UTF-16 internally by default for string representation,
   * and the pseudo-UTF-8 strings are *only* used for serialization purposes.
   * Thus, there is no reason for other parts of the code to call this routine!
   * TODO: To avoid copying, create a character array for this data.
   * http://docs.oracle.com/javase/specs/jvms/se8/html/jvms-4.html#jvms-4.4.7
   */
  private bytes2str(bytes: Buffer): string {
    var y: number, z: number, v: number, w: number, x: number, charCode: number, idx = 0, rv = '';
    while (idx < bytes.length) {
      x = bytes.readUInt8(idx++) & 0xff;
      // While the standard specifies that surrogate pairs should be handled, it seems like
      // they are by default with the three byte format. See parsing code here:
      // http://hg.openjdk.java.net/jdk8u/jdk8u-dev/jdk/file/3623f1b29b58/src/share/classes/java/io/DataInputStream.java#l618

      // One UTF-16 character.
      if (x <= 0x7f) {
        // One character, one byte.
        charCode = x;
      } else if (x <= 0xdf) {
        // One character, two bytes.
        y = bytes.readUInt8(idx++);
        charCode = ((x & 0x1f) << 6) + (y & 0x3f);
      } else {
        // One character, three bytes.
        y = bytes.readUInt8(idx++);
        z = bytes.readUInt8(idx++);
        charCode = ((x & 0xf) << 12) + ((y & 0x3f) << 6) + (z & 0x3f);
      }
      rv += String.fromCharCode(charCode);
    }

    return rv;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.UTF8;
  }

  public getConstant(thread: threading.JVMThread) { return this.value; }

  public isResolved() { return true; }

  public static size: number = 1;
  // Variable-size.
  public static infoByteSize: number = 0;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var strlen = byteStream.getUint16();
    return new this(byteStream.read(strlen));
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

  public getConstant(thread: threading.JVMThread) { return this.value; }

  public isResolved() { return true; }

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

  public getConstant(thread: threading.JVMThread) { return this.value; }

  public isResolved() { return true; }

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

  public getConstant(thread: threading.JVMThread) { return this.value; }

  public isResolved() { return true; }

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

  public getConstant(thread: threading.JVMThread) { return this.value; }

  public isResolved() { return true; }

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
   * The resolved class reference.
   */
  public cls: ClassData.ReferenceClassData<JVMTypes.java_lang_Object> | ClassData.ArrayClassData<any> = null;
  /**
   * The JavaScript constructor for the referenced class.
   */
  public clsConstructor: ClassData.IJVMConstructor<JVMTypes.java_lang_Object> = null;
  /**
   * The array class for the resolved class reference.
   */
  public arrayClass: ClassData.ArrayClassData<any> = null;
  /**
   * The JavaScript constructor for the array class.
   */
  public arrayClassConstructor: ClassData.IJVMConstructor<JVMTypes.JVMArray<any>> = null;
  constructor(name: string) {
    this.name = name;
  }

  /**
   * Attempt to synchronously resolve.
   */
  public tryResolve(loader: ClassLoader.ClassLoader): boolean {
    if (this.cls === null) {
      this.cls = <ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> loader.getResolvedClass(this.name);
    }
    return this.cls !== null;
  }

  /**
   * Resolves the class reference by resolving the class. Does not run
   * class initialization.
   */
  public resolve(thread: threading.JVMThread, loader: ClassLoader.ClassLoader, caller: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, cb: (status: boolean) => void, explicit: boolean = true) {
    // Because of Java 8 anonymous classes, THIS CHECK IS REQUIRED FOR CORRECTNESS.
    // (ClassLoaders do not know about anonymous classes, hence they are
    //  'anonymous')
    // (Anonymous classes are an 'Unsafe' feature, and are not part of the standard,
    //  but they are employed for lambdas and such.)
    // NOTE: Thread is 'null' during JVM bootstrapping.
    if (thread !== null) {
      var currentMethod = thread.currentMethod();
      // The stack might be empty during resolution, which occurs during JVM bootup.
      if (currentMethod !== null && this.name === currentMethod.cls.getInternalName()) {
        this.setResolved(thread, thread.currentMethod().cls);
        return cb(true);
      }
    }

    loader.resolveClass(thread, this.name, (cdata: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>) => {
      this.setResolved(thread, cdata);
      cb(cdata !== null);
    }, explicit);
  }

  private setResolved(thread: threading.JVMThread, cls: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>) {
    this.cls = cls;
    if (cls !== null) {
      this.clsConstructor = cls.getConstructor(thread);
    }
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.CLASS;
  }

  public getConstant(thread: threading.JVMThread) { return this.cls.getClassObject(thread); }

  public isResolved() { return this.cls !== null; }

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
  constructor(name: string, descriptor: string) {
    this.name = name;
    this.descriptor = descriptor;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.NAME_AND_TYPE;
  }

  public isResolved() { return true; }

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
  public stringValue: string;
  public value: JVMTypes.java_lang_String = null;
  constructor(stringValue: string) {
    this.stringValue = stringValue;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.STRING;
  }

  public resolve(thread: threading.JVMThread, loader: ClassLoader.ClassLoader, caller: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, cb: (status: boolean) => void) {
    this.value = thread.getJVM().internString(this.stringValue);
    setImmediate(() => cb(true));
  }

  public getConstant(thread: threading.JVMThread) { return this.value; }

  public isResolved() { return this.value !== null; }

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
  private descriptor: string;
  public methodType: JVMTypes.java_lang_invoke_MethodType = null;
  constructor(descriptor: string) {
    this.descriptor = descriptor;
  }

  public resolve(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, caller: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, cb: (status: boolean) => void) {
    util.createMethodType(thread, cl, this.descriptor, (e: JVMTypes.java_lang_Throwable, type: JVMTypes.java_lang_invoke_MethodType) => {
      if (e) {
        thread.throwException(e);
        cb(false);
      } else {
        this.methodType = type;
        cb(true);
      }
    });
  }

  public getConstant(thread: threading.JVMThread) { return this.methodType; }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.METHOD_TYPE;
  }

  public isResolved() { return this.methodType !== null; }

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
  public classInfo: ClassReference;
  public nameAndTypeInfo: NameAndTypeInfo;
  public method: methods.Method = null;
  /**
   * The signature of the method, without the owning class.
   * e.g. foo(IJ)V
   */
  public signature: string;
  /**
   * The signature of the method, including the owning class.
   * e.g. bar/Baz/foo(IJ)V
   */
  public fullSignature: string = null;
  public paramWordSize: number = -1;
  /**
   * Contains a reference to the MemberName object for the method that invokes
   * the desired function.
   */
  public memberName: JVMTypes.java_lang_invoke_MemberName = null;
  /**
   * Contains an object that needs to be pushed onto the stack before invoking
   * memberName.
   */
  public appendix: JVMTypes.java_lang_Object = null;
  /**
   * The JavaScript constructor for the class that the method belongs to.
   */
  public jsConstructor: any = null;

  constructor(classInfo: ClassReference, nameAndTypeInfo: NameAndTypeInfo) {
    this.classInfo = classInfo;
    this.nameAndTypeInfo = nameAndTypeInfo;
    this.signature = this.nameAndTypeInfo.name + this.nameAndTypeInfo.descriptor;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.METHODREF;
  }

  /**
   * Checks the method referenced by this constant pool item in the specified
   * bytecode context.
   * Returns null if an error occurs.
   * - Throws a NoSuchFieldError if missing.
   * - Throws an IllegalAccessError if field is inaccessible.
   * - Throws an IncompatibleClassChangeError if the field is an incorrect type
   *   for the field access.
   */
  public hasAccess(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, isStatic: boolean): boolean {
    var method = this.method, accessingCls = frame.method.cls;
    if (method.accessFlags.isStatic() !== isStatic) {
      thread.throwNewException('Ljava/lang/IncompatibleClassChangeError;', `Method ${method.name} from class ${method.cls.getExternalName()} is ${isStatic ? 'not ' : ''}static.`);
      frame.returnToThreadLoop = true;
      return false;
    } else if (!util.checkAccess(accessingCls, method.cls, method.accessFlags)) {
      thread.throwNewException('Ljava/lang/IllegalAccessError;', `${accessingCls.getExternalName()} cannot access ${method.cls.getExternalName()}.${method.name}`);
      frame.returnToThreadLoop = true;
      return false;
    }
    return true;
  }

  private resolveMemberName(method: methods.Method, thread: threading.JVMThread, cl: ClassLoader.ClassLoader, caller: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, cb: (status: boolean) => void): void {
    var memberHandleNatives = <typeof JVMTypes.java_lang_invoke_MethodHandleNatives>  (<ClassData.ReferenceClassData<JVMTypes.java_lang_invoke_MethodHandleNatives>> thread.getBsCl().getInitializedClass(thread, 'Ljava/lang/invoke/MethodHandleNatives;')).getConstructor(thread),
      appendix = new ((<ClassData.ArrayClassData<JVMTypes.java_lang_Object>> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/Object;')).getConstructor(thread))(thread, 1);

    util.createMethodType(thread, cl, this.nameAndTypeInfo.descriptor, (e: JVMTypes.java_lang_Throwable, type: JVMTypes.java_lang_invoke_MethodType) => {
      if (e) {
        thread.throwException(e);
        cb(false);
      } else {
        /* MemberName linkMethod( int refKind, Class<?> defc,
           String name, Object type,
           Object[] appendixResult) */
        memberHandleNatives['java/lang/invoke/MethodHandleNatives/linkMethod(Ljava/lang/Class;ILjava/lang/Class;Ljava/lang/String;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/invoke/MemberName;'](
          thread,
          // Class callerClass
          [caller.getClassObject(thread),
          // int refKind
           enums.MethodHandleReferenceKind.INVOKEVIRTUAL,
          // Class defc
           this.classInfo.cls.getClassObject(thread),
          // String name
           thread.getJVM().internString(this.nameAndTypeInfo.name),
          // Object type, Object[] appendixResult
           type, appendix],
        (e?: JVMTypes.java_lang_Throwable, rv?: JVMTypes.java_lang_invoke_MemberName) => {
          if (e !== null) {
            thread.throwException(e);
            cb(false);
          } else {
            this.appendix = appendix.array[0];
            this.memberName = rv;
            cb(true);
          }
        });
      }
    });
  }

  public resolve(thread: threading.JVMThread, loader: ClassLoader.ClassLoader, caller: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, cb: (status: boolean) => void, explicit: boolean = true) {
    if (!this.classInfo.isResolved()) {
      this.classInfo.resolve(thread, loader, caller, (status: boolean) => {
        if (!status) {
          cb(false);
        } else {
          this.resolve(thread, loader, caller, cb, explicit);
        }
      }, explicit);
    } else {
      var cls = this.classInfo.cls,
        method = cls.methodLookup(this.signature);
      if (method === null) {
        if (util.is_reference_type(cls.getInternalName())) {
          // Signature polymorphic lookup.
          method = (<ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> cls).signaturePolymorphicAwareMethodLookup(this.signature);
          if (method !== null && (method.name === 'invoke' || method.name === 'invokeExact')) {
            // In order to completely resolve the signature polymorphic function,
            // we need to resolve its MemberName object and Appendix.
            return this.resolveMemberName(method, thread, loader, caller, (status: boolean) => {
              if (status === true) {
                this.setResolved(thread, method);
              } else {
                thread.throwNewException('Ljava/lang/NoSuchMethodError;', `Method ${this.signature} does not exist in class ${this.classInfo.cls.getExternalName()}.`);
              }
              cb(status);
            });
          }
        }
      }
      if (method !== null) {
        this.setResolved(thread, method);
        cb(true);
      } else {
        thread.throwNewException('Ljava/lang/NoSuchMethodError;', `Method ${this.signature} does not exist in class ${this.classInfo.cls.getExternalName()}.`);
        cb(false);
      }
    }
  }

  public setResolved(thread: threading.JVMThread, method: methods.Method): void {
    this.method = method;
    this.paramWordSize = util.getMethodDescriptorWordSize(this.nameAndTypeInfo.descriptor);
    this.fullSignature = this.method.fullSignature;
    this.jsConstructor = this.method.cls.getConstructor(thread);
  }

  public isResolved() { return this.method !== null; }
  public getParamWordSize(): number {
    if (this.paramWordSize === -1) {
      this.paramWordSize = util.getMethodDescriptorWordSize(this.nameAndTypeInfo.descriptor);
    }
    return this.paramWordSize;
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
  public classInfo: ClassReference;
  public nameAndTypeInfo: NameAndTypeInfo;
  /**
   * The signature of the method, without the owning class.
   * e.g. foo(IJ)V
   */
  public signature: string;
  /**
   * The signature of the method, including the owning class.
   * e.g. bar/Baz/foo(IJ)V
   */
  public fullSignature: string = null;
  public method: methods.Method = null;
  public paramWordSize: number = -1;
  public jsConstructor: any = null;
  constructor(classInfo: ClassReference, nameAndTypeInfo: NameAndTypeInfo) {
    this.classInfo = classInfo;
    this.nameAndTypeInfo = nameAndTypeInfo;
    this.signature = this.nameAndTypeInfo.name + this.nameAndTypeInfo.descriptor;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.INTERFACE_METHODREF;
  }

  /**
   * Checks the method referenced by this constant pool item in the specified
   * bytecode context.
   * Returns null if an error occurs.
   * - Throws a NoSuchFieldError if missing.
   * - Throws an IllegalAccessError if field is inaccessible.
   * - Throws an IncompatibleClassChangeError if the field is an incorrect type
   *   for the field access.
   */
  public hasAccess(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, isStatic: boolean): boolean {
    var method = this.method, accessingCls = frame.method.cls;
    if (method.accessFlags.isStatic() !== isStatic) {
      thread.throwNewException('Ljava/lang/IncompatibleClassChangeError;', `Method ${method.name} from class ${method.cls.getExternalName()} is ${isStatic ? 'not ' : ''}static.`);
      frame.returnToThreadLoop = true;
      return false;
    } else if (!util.checkAccess(accessingCls, method.cls, method.accessFlags)) {
      thread.throwNewException('Ljava/lang/IllegalAccessError;', `${accessingCls.getExternalName()} cannot access ${method.cls.getExternalName()}.${method.name}`);
      frame.returnToThreadLoop = true;
      return false;
    }
    return true;
  }

  public resolve(thread: threading.JVMThread, loader: ClassLoader.ClassLoader, caller: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, cb: (status: boolean) => void, explicit: boolean = true) {
    if (!this.classInfo.isResolved()) {
      this.classInfo.resolve(thread, loader, caller, (status: boolean) => {
        if (!status) {
          cb(false);
        } else {
          this.resolve(thread, loader, caller, cb, explicit);
        }
      }, explicit);
    } else {
      var cls = this.classInfo.cls,
        method = cls.methodLookup(this.signature);
      this.paramWordSize = util.getMethodDescriptorWordSize(this.nameAndTypeInfo.descriptor);
      if (method !== null) {
        this.setResolved(thread, method);
        cb(true);
      } else {
        thread.throwNewException('Ljava/lang/NoSuchMethodError;', `Method ${this.signature} does not exist in class ${this.classInfo.cls.getExternalName()}.`);
        cb(false);
      }
    }
  }

  public setResolved(thread: threading.JVMThread, method: methods.Method): void {
    this.method = method;
    this.paramWordSize = util.getMethodDescriptorWordSize(this.nameAndTypeInfo.descriptor);
    this.fullSignature = this.method.fullSignature;
    this.jsConstructor = this.method.cls.getConstructor(thread);
  }

  public getParamWordSize(): number {
    if (this.paramWordSize === -1) {
      this.paramWordSize = util.getMethodDescriptorWordSize(this.nameAndTypeInfo.descriptor);
    }
    return this.paramWordSize;
  }

  public isResolved() { return this.method !== null; }

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
  public classInfo: ClassReference;
  public nameAndTypeInfo: NameAndTypeInfo;
  public field: methods.Field = null;
  /**
   * The full name of the field, including the owning class.
   * e.g. java/lang/String/value
   */
  public fullFieldName: string = null;
  /**
   * The constructor for the field owner. Used for static fields.
   */
  public fieldOwnerConstructor: any = null;
  constructor(classInfo: ClassReference, nameAndTypeInfo: NameAndTypeInfo) {
    this.classInfo = classInfo;
    this.nameAndTypeInfo = nameAndTypeInfo;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.FIELDREF;
  }

  /**
   * Checks the field referenced by this constant pool item in the specified
   * bytecode context.
   * Returns null if an error occurs.
   * - Throws a NoSuchFieldError if missing.
   * - Throws an IllegalAccessError if field is inaccessible.
   * - Throws an IncompatibleClassChangeError if the field is an incorrect type
   *   for the field access.
   */
  public hasAccess(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, isStatic: boolean): boolean {
    var field = this.field, accessingCls = frame.method.cls;
    if (field.accessFlags.isStatic() !== isStatic) {
      thread.throwNewException('Ljava/lang/IncompatibleClassChangeError;', `Field ${name} from class ${field.cls.getExternalName()} is ${isStatic ? 'not ' : ''}static.`);
      frame.returnToThreadLoop = true;
      return false;
    } else if (!util.checkAccess(accessingCls, field.cls, field.accessFlags)) {
      thread.throwNewException('Ljava/lang/IllegalAccessError;', `${accessingCls.getExternalName()} cannot access ${field.cls.getExternalName()}.${name}`);
      frame.returnToThreadLoop = true;
      return false;
    }
    return true;
  }

  public resolve(thread: threading.JVMThread, loader: ClassLoader.ClassLoader, caller: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, cb: (status: boolean) => void, explicit: boolean = true) {
    if (!this.classInfo.isResolved()) {
      this.classInfo.resolve(thread, loader, caller, (status: boolean) => {
        if (!status) {
          cb(false);
        } else {
          this.resolve(thread, loader, caller, cb, explicit);
        }
      }, explicit);
    } else {
      var cls = this.classInfo.cls,
        field = cls.fieldLookup(this.nameAndTypeInfo.name);
      if (field !== null) {
        this.fullFieldName = `${util.descriptor2typestr(field.cls.getInternalName())}/${field.name}`;
        this.field = field;
        cb(true);
      } else {
        thread.throwNewException('Ljava/lang/NoSuchFieldError;', `Field ${this.nameAndTypeInfo.name} does not exist in class ${this.classInfo.cls.getExternalName()}.`);
        cb(false);
      }
    }
  }

  public isResolved() { return this.field !== null; }

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
  /**
   * The parameter word size of the nameAndTypeInfo's descriptor.
   * Does not take appendix into account; this is the static paramWordSize.
   */
  public paramWordSize: number;
  /**
   * Once a CallSite is defined for a particular lexical occurrence of
   * InvokeDynamic, the CallSite will be reused for each future execution
   * of that particular occurrence.
   *
   * We store the CallSite objects here for future retrieval, along with an
   * optional 'appendix' argument.
   */
  private callSiteObjects: { [pc: number]: [JVMTypes.java_lang_invoke_MemberName, JVMTypes.java_lang_Object] } = {};
  /**
   * A MethodType object corresponding to this InvokeDynamic call's
   * method descriptor.
   */
  private methodType: JVMTypes.java_lang_invoke_MethodType = null;

  constructor(bootstrapMethodAttrIndex: number, nameAndTypeInfo: NameAndTypeInfo) {
    this.bootstrapMethodAttrIndex = bootstrapMethodAttrIndex;
    this.nameAndTypeInfo = nameAndTypeInfo;
    this.paramWordSize = util.getMethodDescriptorWordSize(this.nameAndTypeInfo.descriptor);
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.INVOKE_DYNAMIC;
  }
  public isResolved(): boolean { return this.methodType !== null; }
  public resolve(thread: threading.JVMThread, loader: ClassLoader.ClassLoader, caller: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, cb: (status: boolean) => void) {
    util.createMethodType(thread, loader, this.nameAndTypeInfo.descriptor, (e: JVMTypes.java_lang_Throwable, rv: JVMTypes.java_lang_invoke_MethodType) => {
      if (e) {
        thread.throwException(e);
        cb(false);
      } else {
        this.methodType = rv;
        cb(true);
      }
    });
  }

  public getCallSiteObject(pc: number): [JVMTypes.java_lang_invoke_MemberName, JVMTypes.java_lang_Object] {
    var cso = this.callSiteObjects[pc]
    if (cso) {
      return cso;
    } else {
      return null;
    }
  }

  public constructCallSiteObject(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, clazz: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, pc: number, cb: (status: boolean) => void, explicit: boolean = true): void {
    /**
     * A call site specifier gives a symbolic reference to a method handle which
     * is to serve as the bootstrap method for a dynamic call site (§4.7.23).
     * The method handle is resolved to obtain a reference to an instance of
     * java.lang.invoke.MethodHandle (§5.4.3.5).
     */
    var bootstrapMethod = clazz.getBootstrapMethod(this.bootstrapMethodAttrIndex),
      unresolvedItems: IConstantPoolItem[] = bootstrapMethod[1].concat(bootstrapMethod[0], this).filter((item: IConstantPoolItem) => !item.isResolved());

    if (unresolvedItems.length > 0) {
      // Resolve all needed constant pool items (including this one).
      return util.asyncForEach(unresolvedItems, (cpItem: IConstantPoolItem, nextItem: (err?: any) => void) => {
        cpItem.resolve(thread, cl, clazz, (status: boolean) => {
          if (!status) {
            nextItem("Failed.");
          } else {
            nextItem();
          }
        }, explicit);
      }, (err?: any) => {
        if (err) {
          cb(false);
        } else {
          // Rerun. This time, all items are resolved.
          this.constructCallSiteObject(thread, cl, clazz, pc, cb, explicit);
        }
      });
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
     */
    function getArguments(): JVMTypes.JVMArray<JVMTypes.java_lang_Object> {
      var cpItems = bootstrapMethod[1],
        i: number, cpItem: IConstantPoolItem,
        rvObj = new ((<ClassData.ArrayClassData<JVMTypes.java_lang_Object>> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/Object;')).getConstructor(thread))(thread, cpItems.length),
        rv = rvObj.array;
      for (i = 0; i < cpItems.length; i++) {
        cpItem = cpItems[i];
        switch (cpItem.getType()) {
          case enums.ConstantPoolItemType.CLASS:
            rv[i] = (<ClassReference> cpItem).cls.getClassObject(thread);
            break;
          case enums.ConstantPoolItemType.METHOD_HANDLE:
            rv[i] = (<MethodHandle> cpItem).methodHandle;
            break;
          case enums.ConstantPoolItemType.METHOD_TYPE:
            rv[i] = (<MethodType> cpItem).methodType;
            break;
          case enums.ConstantPoolItemType.STRING:
            rv[i] = (<ConstString> cpItem).value;
            break;
          case enums.ConstantPoolItemType.UTF8:
            rv[i] = thread.getJVM().internString((<ConstUTF8> cpItem).value);
            break;
          case enums.ConstantPoolItemType.INTEGER:
            rv[i] = (<ClassData.PrimitiveClassData> cl.getInitializedClass(thread, 'I')).createWrapperObject(thread, (<ConstInt32> cpItem).value);
            break;
          case enums.ConstantPoolItemType.LONG:
            rv[i] = (<ClassData.PrimitiveClassData> cl.getInitializedClass(thread, 'J')).createWrapperObject(thread, (<ConstLong> cpItem).value);
            break;
          case enums.ConstantPoolItemType.FLOAT:
            rv[i] = (<ClassData.PrimitiveClassData> cl.getInitializedClass(thread, 'F')).createWrapperObject(thread, (<ConstFloat> cpItem).value);
            break;
          case enums.ConstantPoolItemType.DOUBLE:
            rv[i] = (<ClassData.PrimitiveClassData> cl.getInitializedClass(thread, 'D')).createWrapperObject(thread, (<ConstDouble> cpItem).value);
            break;
          default:
            assert(false, "Invalid CPItem for static args: " + enums.ConstantPoolItemType[cpItem.getType()]);
            break;
        }
      }
      assert((() => {
        var status = true;
        cpItems.forEach((cpItem: IConstantPoolItem, i: number) => {
          if (rv[i] === undefined) {
            console.log("Undefined item at arg " + i + ": " + enums.ConstantPoolItemType[cpItem.getType()]);
            status = false;
          } else if (rv[i] === null) {
            console.log("Null item at arg " + i + ": " + enums.ConstantPoolItemType[cpItem.getType()]);
            status = false;
          }
        });
        return status;
      })(), "Arguments cannot be undefined or null.");

      return rvObj;
    }

    /**
     * A call site specifier gives a method descriptor, TD. A reference to an
     * instance of java.lang.invoke.MethodType is obtained as if by resolution
     * of a symbolic reference to a method type with the same parameter and
     * return types as TD (§5.4.3.5).
     *
     * Do what all OpenJDK-based JVMs do: Call
     * MethodHandleNatives.linkCallSite with:
     * - The class w/ the invokedynamic instruction
     * - The bootstrap method
     * - The name string from the nameAndTypeInfo
     * - The methodType object from the nameAndTypeInfo
     * - The static arguments from the bootstrap method.
     * - A 1-length appendix box.
     */
    var methodName = thread.getJVM().internString(this.nameAndTypeInfo.name),
      appendixArr = new ((<ClassData.ArrayClassData<JVMTypes.java_lang_Object>> cl.getInitializedClass(thread, '[Ljava/lang/Object;')).getConstructor(thread))(thread, 1),
      staticArgs = getArguments(),
      mhn = <typeof JVMTypes.java_lang_invoke_MethodHandleNatives> (<ClassData.ReferenceClassData<JVMTypes.java_lang_invoke_MethodHandleNatives>> cl.getInitializedClass(thread, 'Ljava/lang/invoke/MethodHandleNatives;')).getConstructor(thread);


    mhn['java/lang/invoke/MethodHandleNatives/linkCallSite(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/invoke/MemberName;'](thread,
      [clazz.getClassObject(thread), bootstrapMethod[0].methodHandle, methodName, this.methodType, staticArgs, appendixArr], (e?: JVMTypes.java_lang_Throwable, rv?: JVMTypes.java_lang_invoke_MemberName) => {
      if (e) {
        thread.throwException(e);
        cb(false);
      } else {
        this.setResolved(pc, [rv, appendixArr.array[0]]);
        cb(true);
      }
    });
  }

  private setResolved(pc: number, cso: [JVMTypes.java_lang_invoke_MemberName, JVMTypes.java_lang_Object]) {
    // Prevent resolution races. It's OK to create multiple CSOs, but only one
    // should ever be used!
    if (this.callSiteObjects[pc] === undefined) {
      this.callSiteObjects[pc] = cso;
    }
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
  getMethodHandleType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, cb: (e: any, type: JVMTypes.java_lang_Object) => void): void;
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
  private reference: FieldReference | MethodReference | InterfaceMethodReference;
  private referenceType: enums.MethodHandleReferenceKind;
  /**
   * The resolved MethodHandle object.
   */
  public methodHandle: JVMTypes.java_lang_invoke_MethodHandle = null;
  constructor(reference: FieldReference | MethodReference | InterfaceMethodReference, referenceType: enums.MethodHandleReferenceKind) {
    this.reference = reference;
    this.referenceType = referenceType;
  }

  public getType(): enums.ConstantPoolItemType {
    return enums.ConstantPoolItemType.METHOD_HANDLE;
  }
  public isResolved(): boolean { return this.methodHandle !== null; }
  public getConstant(thread: threading.JVMThread) { return this.methodHandle; }

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
  public resolve(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, caller: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, cb: (status: boolean) => void, explicit: boolean) {
    if (!this.reference.isResolved()) {
      return this.reference.resolve(thread, cl, caller, (status: boolean) => {
        if (!status) {
          cb(false);
        } else {
          this.resolve(thread, cl, caller, cb, explicit);
        }
      }, explicit);
    }

    this.constructMethodHandleType(thread, cl, (type: JVMTypes.java_lang_Object) => {
      if (type === null) {
        cb(false);
      } else {
        var methodHandleNatives = <typeof JVMTypes.java_lang_invoke_MethodHandleNatives> (<ClassData.ReferenceClassData<JVMTypes.java_lang_invoke_MethodHandleNatives>> cl.getInitializedClass(thread, 'Ljava/lang/invoke/MethodHandleNatives;')).getConstructor(thread);
        methodHandleNatives['linkMethodHandleConstant(Ljava/lang/Class;ILjava/lang/Class;Ljava/lang/String;Ljava/lang/Object;)Ljava/lang/invoke/MethodHandle;'](
          thread,
          [caller.getClassObject(thread), this.referenceType, this.getDefiningClassObj(thread), thread.getJVM().internString(this.reference.nameAndTypeInfo.name), type], (e?: JVMTypes.java_lang_Throwable, methodHandle?: JVMTypes.java_lang_invoke_MethodHandle) => {
          if (e) {
            thread.throwException(e);
            cb(false);
          } else {
            this.methodHandle = methodHandle;
            cb(true);
          }
        });
      }
    });
  }

  private getDefiningClassObj(thread: threading.JVMThread): JVMTypes.java_lang_Class {
    if (this.reference.getType() === enums.ConstantPoolItemType.FIELDREF) {
      return (<FieldReference> this.reference).field.cls.getClassObject(thread);
    } else {
      return (<MethodReference> this.reference).method.cls.getClassObject(thread);
    }
  }

  private constructMethodHandleType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, cb: (type: JVMTypes.java_lang_Object) => void): void {
    if (this.reference.getType() === enums.ConstantPoolItemType.FIELDREF) {
      var resolveObj: string = this.reference.nameAndTypeInfo.descriptor;
      cl.resolveClass(thread, resolveObj, (cdata: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>) => {
        if (cdata !== null) {
          cb(cdata.getClassObject(thread));
        } else {
          cb(null);
        }
      });
    } else {
      util.createMethodType(thread, cl, this.reference.nameAndTypeInfo.descriptor, (e: JVMTypes.java_lang_Throwable, rv: JVMTypes.java_lang_invoke_MethodType) => {
        if (e) {
          thread.throwException(e);
          cb(null);
        } else {
          cb(rv);
        }
      });
    }
  }

  public static size: number = 1;
  public static infoByteSize: number = 3;
  public static fromBytes(byteStream: ByteStream, constantPool: ConstantPool): IConstantPoolItem {
    var referenceKind: enums.MethodHandleReferenceKind = byteStream.getUint8(),
      referenceIndex = byteStream.getUint16(),
      reference: FieldReference | MethodReference | InterfaceMethodReference = <any> constantPool.get(referenceIndex);

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

    return new this(reference, referenceKind);
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

  public parse(byteStream: ByteStream, cpPatches: JVMTypes.JVMArray<JVMTypes.java_lang_Object> = null): ByteStream {
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
          var patchObj: JVMTypes.java_lang_Object = cpPatches.array[item.index];
          switch (patchObj.getClass().getInternalName()) {
            case 'Ljava/lang/Integer;':
              assert(tag === enums.ConstantPoolItemType.INTEGER);
              (<ConstInt32> this.constantPool[item.index]).value = (<JVMTypes.java_lang_Integer> patchObj)['java/lang/Integer/value'];
              break;
            case 'Ljava/lang/Long;':
              assert(tag === enums.ConstantPoolItemType.LONG);
              (<ConstLong> this.constantPool[item.index]).value = (<JVMTypes.java_lang_Long> patchObj)['java/lang/Long/value'];
              break;
            case 'Ljava/lang/Float;':
              assert(tag === enums.ConstantPoolItemType.FLOAT);
              (<ConstFloat> this.constantPool[item.index]).value = (<JVMTypes.java_lang_Float> patchObj)['java/lang/Float/value'];
              break;
            case 'Ljava/lang/Double;':
              assert(tag === enums.ConstantPoolItemType.DOUBLE);
              (<ConstDouble> this.constantPool[item.index]).value = (<JVMTypes.java_lang_Double> patchObj)['java/lang/Double/value'];
              break;
            case 'Ljava/lang/String;':
              assert(tag === enums.ConstantPoolItemType.UTF8);
              (<ConstUTF8> this.constantPool[item.index]).value = (<JVMTypes.java_lang_String> patchObj).toString();
              break;
            case 'Ljava/lang/Class;':
              assert(tag === enums.ConstantPoolItemType.CLASS);
              (<ClassReference> this.constantPool[item.index]).name = (<JVMTypes.java_lang_Class> patchObj).$cls.getInternalName();
              (<ClassReference> this.constantPool[item.index]).cls = <ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> (<JVMTypes.java_lang_Class> patchObj).$cls;
              break;
            default:
              assert(tag === enums.ConstantPoolItemType.STRING);
              (<ConstString> this.constantPool[item.index]).stringValue = "";
              // XXX: Not actually a string, but the JVM does this.
              (<ConstString> this.constantPool[item.index]).value = <JVMTypes.java_lang_String> patchObj;
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

/// Resolved forms of constant pool items.
