import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import enums = require('../enums');
import ClassLoader = require('../ClassLoader');
declare var registerNatives: (defs: any) => void;

function unsafe_compare_and_swap(thread: threading.JVMThread, _this: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, expected: any, x: any): boolean {
  var actual = obj.get_field_from_offset(thread, offset);
  if (actual === expected) {
    obj.set_field_from_offset(thread, offset, x);
    return true;
  } else {
    return false;
  }
}

class sun_misc_GC {

  public static 'maxObjectInspectionAge()J'(thread: threading.JVMThread): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class sun_misc_MessageUtils {

  public static 'toStderr(Ljava/lang/String;)V'(thread: threading.JVMThread, arg0: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'toStdout(Ljava/lang/String;)V'(thread: threading.JVMThread, arg0: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_misc_NativeSignalHandler {

  public static 'handle0(IJ)V'(thread: threading.JVMThread, arg0: number, arg1: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_misc_Perf {

  public static 'attach(Ljava/lang/String;II)Ljava/nio/ByteBuffer;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number, arg2: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'detach(Ljava/nio/ByteBuffer;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'createLong(Ljava/lang/String;IIJ)Ljava/nio/ByteBuffer;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number, arg2: number, arg3: gLong): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'createByteArray(Ljava/lang/String;II[BI)Ljava/nio/ByteBuffer;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number, arg2: number, arg3: java_object.JavaArray, arg4: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'highResCounter()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'highResFrequency()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'registerNatives()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_misc_Signal {

  public static 'findSignal(Ljava/lang/String;)I'(thread: threading.JVMThread, arg0: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'handle0(IJ)J'(thread: threading.JVMThread, arg0: number, arg1: gLong): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'raise0(I)V'(thread: threading.JVMThread, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_misc_Unsafe {

  public static 'getInt(Ljava/lang/Object;J)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putInt(Ljava/lang/Object;JI)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    return obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getObject(Ljava/lang/Object;J)Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): java_object.JavaObject {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putObject(Ljava/lang/Object;JLjava/lang/Object;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_obj: java_object.JavaObject): void {
    return obj.set_field_from_offset(thread, offset, new_obj);
  }

  public static 'getBoolean(Ljava/lang/Object;J)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putBoolean(Ljava/lang/Object;JZ)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    return obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getByte(Ljava/lang/Object;J)B'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putByte(Ljava/lang/Object;JB)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getShort(Ljava/lang/Object;J)S'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putShort(Ljava/lang/Object;JS)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getChar(Ljava/lang/Object;J)C'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putChar(Ljava/lang/Object;JC)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    return obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getLong(Ljava/lang/Object;J)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): gLong {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putLong(Ljava/lang/Object;JJ)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, x: gLong): void {
    obj.set_field_from_offset(thread, offset, x);
  }

  public static 'getFloat(Ljava/lang/Object;J)F'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putFloat(Ljava/lang/Object;JF)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getDouble(Ljava/lang/Object;J)D'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putDouble(Ljava/lang/Object;JD)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getByte(J)B'(thread: threading.JVMThread, javaThis: java_object.JavaObject, address: gLong): number {
    var heap = thread.getThreadPool().getJVM().getHeap();
    return heap.get_signed_byte(address.toNumber());
  }

  public static 'putByte(JB)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getShort(J)S'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putShort(JS)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getChar(J)C'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putChar(JC)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getInt(J)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putInt(JI)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getLong(J)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'putLong(JJ)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, address: gLong, value: gLong): void {
    var heap = thread.getThreadPool().getJVM().getHeap(),
      addr = address.toNumber();

    // LE
    heap.store_word(addr, value.getLowBits());
    heap.store_word(addr + 4, value.getHighBits());
  }

  public static 'getFloat(J)F'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putFloat(JF)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getDouble(J)D'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putDouble(JD)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getAddress(J)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'putAddress(JJ)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'allocateMemory(J)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, size: gLong): gLong {
    var heap = thread.getThreadPool().getJVM().getHeap();
    return gLong.fromNumber(heap.malloc(size.toNumber()));
  }

  public static 'reallocateMemory(JJ)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'setMemory(JJB)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, address: gLong, bytes: gLong, value: number): void {
    var i: number, addr = address.toNumber(),
      bytesNum: number = bytes.toNumber(),
      heap = thread.getThreadPool().getJVM().getHeap();
    for (i = 0; i < bytesNum; i++) {
      heap.set_signed_byte(addr + i, value);
    }
  }

  public static 'copyMemory(Ljava/lang/Object;JLjava/lang/Object;JJ)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: java_object.JavaObject, arg3: gLong, arg4: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'freeMemory(J)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, address: gLong): void {
    var heap = thread.getThreadPool().getJVM().getHeap();
    heap.free(address.toNumber());
  }

  public static 'staticFieldOffset(Ljava/lang/reflect/Field;)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, field: java_object.JavaObject): gLong {
    // XXX: encode both the class and slot information in an integer
    //      this may cause collisions, but it seems to work ok
    var jco = field.get_field(thread, 'Ljava/lang/reflect/Field;clazz'),
      slot = field.get_field(thread, 'Ljava/lang/reflect/Field;slot');
    return gLong.fromNumber(slot + jco.ref);
  }

  public static 'objectFieldOffset(Ljava/lang/reflect/Field;)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, field: java_object.JavaObject): gLong {
    var jco = field.get_field(thread, 'Ljava/lang/reflect/Field;clazz'),
      slot = field.get_field(thread, 'Ljava/lang/reflect/Field;slot');
    return gLong.fromNumber(slot + jco.ref);
  }

  public static 'staticFieldBase(Ljava/lang/reflect/Field;)Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, field: java_object.JavaObject): java_object.JavaObject {
    var cls = field.get_field(thread, 'Ljava/lang/reflect/Field;clazz');
    return new java_object.JavaObject(cls.$cls);
  }

  public static 'ensureClassInitialized(Ljava/lang/Class;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, cls: java_object.JavaClassObject): void {
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    cls.$cls.loader.initializeClass(thread, cls.$cls.get_type(), () => {
      thread.asyncReturn();
    }, true);
  }

  public static 'arrayBaseOffset(Ljava/lang/Class;)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaClassObject): number {
    return 0;
  }

  public static 'arrayIndexScale(Ljava/lang/Class;)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaClassObject): number {
    return 1;
  }

  public static 'addressSize()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    return 4;
  }

  public static 'pageSize()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    return 1024;
  }

  public static 'defineClass(Ljava/lang/String;[BIILjava/lang/ClassLoader;Ljava/security/ProtectionDomain;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, name: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number, loaderObj: ClassLoader.JavaClassLoaderObject, pd: java_object.JavaObject): java_object.JavaClassObject {
    var loader = java_object.get_cl_from_jclo(thread, loaderObj);
    if (loader != null) {
      return loader.defineClass(thread, util.int_classname(name.jvm2js_str()), util.byteArray2Buffer(bytes.array, offset, len)).get_class_object(thread);
    }
  }

  public static 'defineClass(Ljava/lang/String;[BII)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: java_object.JavaArray, arg2: number, arg3: number): java_object.JavaClassObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'allocateInstance(Ljava/lang/Class;)Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, jco: java_object.JavaClassObject): any {
    // This can trigger class initialization, so check if the class is
    // initialized.
    var cls = <ClassData.ReferenceClassData> jco.$cls;
    if (cls.is_initialized()) {
      return new java_object.JavaObject(cls);
    } else {
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      cls.loader.initializeClass(thread, cls.get_type(), () => {
        thread.asyncReturn(new java_object.JavaObject(cls));
      });
    }
  }

  public static 'monitorEnter(Ljava/lang/Object;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'monitorExit(Ljava/lang/Object;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'tryMonitorEnter(Ljava/lang/Object;)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'throwException(Ljava/lang/Throwable;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, exception: java_object.JavaObject): void {
    thread.throwException(exception);
  }

  public static 'compareAndSwapObject(Ljava/lang/Object;JLjava/lang/Object;Ljava/lang/Object;)Z': (thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: java_object.JavaObject, arg3: java_object.JavaObject) => boolean = unsafe_compare_and_swap;
  public static 'compareAndSwapInt(Ljava/lang/Object;JII)Z': (thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: number, arg3: number) => boolean = unsafe_compare_and_swap;
  public static 'compareAndSwapLong(Ljava/lang/Object;JJJ)Z': (thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong) => boolean = unsafe_compare_and_swap;

  public static 'getObjectVolatile(Ljava/lang/Object;J)Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): java_object.JavaObject {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putObjectVolatile(Ljava/lang/Object;JLjava/lang/Object;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: java_object.JavaObject): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getIntVolatile(Ljava/lang/Object;J)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putIntVolatile(Ljava/lang/Object;JI)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getBooleanVolatile(Ljava/lang/Object;J)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putBooleanVolatile(Ljava/lang/Object;JZ)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getByteVolatile(Ljava/lang/Object;J)B'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putByteVolatile(Ljava/lang/Object;JB)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getShortVolatile(Ljava/lang/Object;J)S'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putShortVolatile(Ljava/lang/Object;JS)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getCharVolatile(Ljava/lang/Object;J)C'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putCharVolatile(Ljava/lang/Object;JC)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getLongVolatile(Ljava/lang/Object;J)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): gLong {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putLongVolatile(Ljava/lang/Object;JJ)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: gLong): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getFloatVolatile(Ljava/lang/Object;J)F'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putFloatVolatile(Ljava/lang/Object;JF)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'getDoubleVolatile(Ljava/lang/Object;J)D'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(thread, offset);
  }

  public static 'putDoubleVolatile(Ljava/lang/Object;JD)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'putOrderedObject(Ljava/lang/Object;JLjava/lang/Object;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_obj: java_object.JavaObject): void {
    obj.set_field_from_offset(thread, offset, new_obj);
  }

  public static 'putOrderedInt(Ljava/lang/Object;JI)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  public static 'putOrderedLong(Ljava/lang/Object;JJ)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: gLong): void {
    obj.set_field_from_offset(thread, offset, new_value);
  }

  /**
   * Unblock the given thread blocked on park, or, if it is not blocked, cause
   * the subsequent call to park not to block.
   */
  public static 'unpark(Ljava/lang/Object;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, theThread: threading.JVMThread): void {
    theThread.getThreadPool().unpark(theThread);
  }

  /**
   * Block current thread, returning when a balancing unpark occurs, or a
   * balancing unpark has already occurred, or the thread is interrupted, or,
   * if not absolute and time is not zero, the given time nanoseconds have
   * elapsed, or if absolute, the given deadline in milliseconds since Epoch
   * has passed, or spuriously (i.e., returning for no "reason").
   */
  public static 'park(ZJ)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, absolute: number, time: gLong): void {
    var timeout = Infinity;
    if (absolute) {
      // Time is an absolute time (milliseconds since Epoch).
      // Calculate the timeout from the current time.
      timeout = time.toNumber() - (new Date()).getTime();
      if (timeout < 0) {
        // Forbid negative timeouts.
        timeout = 0;
      }
    } else {
      // time is in nanoseconds, but we don't have that
      // type of precision
      if (time.toNumber() > 0) {
        timeout = time.toNumber() / 1000000;
      }
    }
    thread.getThreadPool().park(thread);
    // @todo Cancel timeout if thread is unparked.
    if (timeout !== Infinity && thread.getThreadPool().isParked(thread)) {
      setTimeout(() => {
        if (thread.getThreadPool().isParked(thread)) {
          thread.getThreadPool().completelyUnpark(thread);
        }
      }, timeout);
    }
  }

  public static 'getLoadAverage([DI)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaArray, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

}

class sun_misc_Version {

  public static 'getJvmSpecialVersion()Ljava/lang/String;'(thread: threading.JVMThread): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getJdkSpecialVersion()Ljava/lang/String;'(thread: threading.JVMThread): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getJvmVersionInfo()Z'(thread: threading.JVMThread): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getJdkVersionInfo()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_misc_VM {

  /**
   * Fill in vmThreadStateValues with int arrays, each of which contains
   * the threadStatus values mapping to the Thread.State enum constant.
   *
   * Fill in vmThreadStateNames with String arrays, each of which contains
   * the name of each threadStatus value of the format:
   *    <Thread.State.name()>[.<Substate name>]
   * e.g. WAITING.OBJECT_WAIT
   *
   * Note: Both of these arrays are preinitialized to the correct length.
   *
   * Here's an example output:
   * vmThreadStateValues = [
   *   [enums.ThreadStatus.NEW],
   *   ...
   * ];
   * vmThreadStateNames = [
   *   ["NEW.NEW"]
   * ];
   *
   * The actual indices of the state values *does not* need to match the
   * Thread.State enum values! The JVM uses the beginning of the *strings*
   * in the vmThreadStateNames array to figure out which index is associated
   * with each state.
   */
  public static 'getThreadStateValues([[I[[Ljava/lang/String;)V'(thread: threading.JVMThread, vmThreadStateValues: java_object.JavaArray, vmThreadStateNames: java_object.JavaArray): void {
    var bsCl = thread.getBsCl(),
      threadStateArray: java_object.JavaArray[] = vmThreadStateValues.array,
      threadStateNamesArray: java_object.JavaArray[] = vmThreadStateNames.array,
      intArrCls = <ClassData.ArrayClassData> vmThreadStateValues.cls.get_component_class(),
      strArrCls = <ClassData.ArrayClassData> vmThreadStateNames.cls.get_component_class(),
      // NOTE: These values do not need to map to Thread.State, but they need
      // to be contiguous.
      // A thread that has not yet started is in this state.
      NEW = 0,
      // A thread executing in the Java virtual machine is in this state.
      RUNNABLE = 1,
      // A thread that is blocked waiting for a monitor lock is in this state.
      BLOCKED = 2,
      // A thread that is waiting indefinitely for another thread to perform a
      // particular action is in this state.
      WAITING = 3,
      // A thread that is waiting for another thread to perform an action for up
      // to a specified waiting time is in this state.
      TIMED_WAITING = 4,
      // A thread that has exited is in this state.
      TERMINATED = 5;

    function jvmStrArr(strs: string[]): java_object.JavaArray {
      var arr: java_object.JavaObject[] = [], i: number;
      for (i = 0; i < strs.length; i++) {
        arr.push(java_object.initString(bsCl, strs[i]));
      }
      return new java_object.JavaArray(strArrCls, arr);
    }

    threadStateArray[NEW] = new java_object.JavaArray(intArrCls, [enums.ThreadStatus.NEW]);
    threadStateNamesArray[NEW] = jvmStrArr(['NEW.NEW']);

    threadStateArray[RUNNABLE] = new java_object.JavaArray(intArrCls, [enums.ThreadStatus.RUNNING, enums.ThreadStatus.RUNNABLE]);
    threadStateNamesArray[RUNNABLE] = jvmStrArr(['RUNNABLE.RUNNING', 'RUNNABLE.RUNNABLE']);

    threadStateArray[BLOCKED] = new java_object.JavaArray(intArrCls, [enums.ThreadStatus.BLOCKED, enums.ThreadStatus.UNINTERRUPTABLY_BLOCKED]);
    threadStateNamesArray[BLOCKED] = jvmStrArr(['BLOCKED.BLOCKED', 'BLOCKED.UNINTERRUPTABLY_BLOCKED']);

    // @todo Distinguish between TIMED parks, and UNTIMED parks.
    threadStateArray[WAITING] = new java_object.JavaArray(intArrCls, [enums.ThreadStatus.WAITING, enums.ThreadStatus.ASYNC_WAITING, enums.ThreadStatus.PARKED]);
    threadStateNamesArray[WAITING] = jvmStrArr(['WAITING.WAITING', 'WAITING.ASYNC_WAITING', 'WAITING.PARKED']);

    threadStateArray[TIMED_WAITING] = new java_object.JavaArray(intArrCls, [enums.ThreadStatus.TIMED_WAITING]);
    threadStateNamesArray[TIMED_WAITING] = jvmStrArr(['TIMED_WAITING.TIMED_WAITING']);

    threadStateArray[TERMINATED] = new java_object.JavaArray(intArrCls, [enums.ThreadStatus.TERMINATED]);
    threadStateNamesArray[TERMINATED] = jvmStrArr(['TERMINATED.TERMINATED']);
  }

  public static 'initialize()V'(thread: threading.JVMThread): void {
    var vm_cls = <ClassData.ReferenceClassData> thread.getBsCl().getInitializedClass(thread, 'Lsun/misc/VM;');
    // this only applies to Java 7
    if (!(vm_cls.major_version >= 51)) {
      return;
    }
    // XXX: make savedProps refer to the system props
    var sys_cls = <ClassData.ReferenceClassData> thread.getBsCl().getInitializedClass(thread, 'Ljava/lang/System;'),
      props = sys_cls.static_get(thread, 'props');
    vm_cls = <ClassData.ReferenceClassData> thread.getBsCl().getInitializedClass(thread, 'Lsun/misc/VM;');
    vm_cls.static_put(thread, 'savedProps', props);
  }

}

class sun_misc_VMSupport {

  public static 'initAgentProperties(Ljava/util/Properties;)Ljava/util/Properties;'(thread: threading.JVMThread, arg0: java_object.JavaObject): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

registerNatives({
  'sun/misc/GC': sun_misc_GC,
  'sun/misc/MessageUtils': sun_misc_MessageUtils,
  'sun/misc/NativeSignalHandler': sun_misc_NativeSignalHandler,
  'sun/misc/Perf': sun_misc_Perf,
  'sun/misc/Signal': sun_misc_Signal,
  'sun/misc/Unsafe': sun_misc_Unsafe,
  'sun/misc/Version': sun_misc_Version,
  'sun/misc/VM': sun_misc_VM,
  'sun/misc/VMSupport': sun_misc_VMSupport
});
