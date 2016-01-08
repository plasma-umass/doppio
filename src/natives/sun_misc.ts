import JVMTypes = require('../../includes/JVMTypes');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import ArrayClassData = Doppio.VM.ClassFile.ArrayClassData;
import ClassData = Doppio.VM.ClassFile.ClassData;
import IJVMConstructor = Doppio.VM.ClassFile.IJVMConstructor;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import Long = Doppio.VM.Long;
import ThreadStatus = Doppio.VM.Enums.ThreadStatus;
import ClassLoader = Doppio.VM.ClassFile.ClassLoader;
import CustomClassLoader = Doppio.VM.ClassFile.CustomClassLoader;
import assert = Doppio.Debug.Assert;
declare var registerNatives: (defs: any) => void;

function getFieldInfo(thread: JVMThread, unsafe: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long): [any, string] {
  var fieldName: string, objBase: any, objCls = obj.getClass(), cls: ReferenceClassData<JVMTypes.java_lang_Object>, compName: string,
    unsafeCons: typeof JVMTypes.sun_misc_Unsafe = <any> (<ReferenceClassData<JVMTypes.sun_misc_Unsafe>> unsafe.getClass()).getConstructor(thread),
    stride = 1;
  if (objCls.getInternalName() === "Ljava/lang/Object;") {
    // Static field. The staticFieldBase is always a pure Object that has a
    // class reference on it.
    // There's no reason to get the field on an Object, as they have no fields.
    cls = <ReferenceClassData<JVMTypes.java_lang_Object>> (<any> obj).$staticFieldBase;
    objBase = <any> cls.getConstructor(thread);
    fieldName = cls.getStaticFieldFromVMIndex(offset.toInt()).fullName;
  } else if (objCls instanceof ArrayClassData) {
    compName = util.internal2external[objCls.getInternalName()[1]];
    if (!compName) {
      compName = "OBJECT";
    }
    compName = compName.toUpperCase();
    stride = (<any> unsafeCons)[`sun/misc/Unsafe/ARRAY_${compName}_INDEX_SCALE`];
    if (!stride) {
      stride = 1;
    }

    objBase = (<JVMTypes.JVMArray<any>> obj).array;
    assert(offset.toInt() % stride === 0, `Invalid offset for stride ${stride}: ${offset.toInt()}`);
    fieldName = "" + (offset.toInt() / stride);
  } else {
    cls = <ReferenceClassData<JVMTypes.java_lang_Object>> obj.getClass();
    objBase = obj;
    fieldName = cls.getObjectFieldFromVMIndex(offset.toInt()).fullName;
  }
  return [objBase, fieldName];
}

function unsafeCompareAndSwap<T>(thread: JVMThread, unsafe: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, expected: T, x: T): boolean {
  var fi = getFieldInfo(thread, unsafe, obj, offset),
    actual = fi[0][fi[1]];
  if (actual === expected) {
    fi[0][fi[1]] = x;
    return true;
  } else {
    return false;
  }
}

function getFromVMIndex<T>(thread: JVMThread, unsafe: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long): T {
  var fi = getFieldInfo(thread, unsafe, obj, offset);
  return fi[0][fi[1]];
}

function setFromVMIndex<T>(thread: JVMThread, unsafe: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, val: T): void {
  var fi = getFieldInfo(thread, unsafe, obj, offset);
  fi[0][fi[1]] = val;
}

class sun_misc_GC {

  public static 'maxObjectInspectionAge()J'(thread: JVMThread): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class sun_misc_MessageUtils {

  public static 'toStderr(Ljava/lang/String;)V'(thread: JVMThread, str: JVMTypes.java_lang_String): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'toStdout(Ljava/lang/String;)V'(thread: JVMThread, str: JVMTypes.java_lang_String): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_misc_NativeSignalHandler {

  public static 'handle0(IJ)V'(thread: JVMThread, arg0: number, arg1: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_misc_Perf {

  public static 'attach(Ljava/lang/String;II)Ljava/nio/ByteBuffer;'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Perf, arg0: JVMTypes.java_lang_String, arg1: number, arg2: number): JVMTypes.java_nio_ByteBuffer {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'detach(Ljava/nio/ByteBuffer;)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Perf, arg0: JVMTypes.java_nio_ByteBuffer): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'createLong(Ljava/lang/String;IIJ)Ljava/nio/ByteBuffer;'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Perf, name: JVMTypes.java_lang_String, variability: number, units: number, value: Long): void {
    thread.import('Ljava/nio/DirectByteBuffer;', (buffCons: IJVMConstructor<JVMTypes.java_nio_DirectByteBuffer>) => {
      var buff = new buffCons(thread),
          heap = thread.getJVM().getHeap(),
          addr = heap.malloc(8);
        buff['<init>(JI)V'](thread, [Long.fromNumber(addr), null, 8], (e?: JVMTypes.java_lang_Throwable) => {
          if (e) {
            thread.throwException(e);
          } else {
            heap.store_word(addr, value.getLowBits());
            heap.store_word(addr + 4, value.getHighBits());
            thread.asyncReturn(buff);
          }
        });
    });
  }

  public static 'createByteArray(Ljava/lang/String;II[BI)Ljava/nio/ByteBuffer;'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Perf, arg0: JVMTypes.java_lang_String, arg1: number, arg2: number, arg3: JVMTypes.JVMArray<number>, arg4: number): JVMTypes.java_nio_ByteBuffer {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'highResCounter()J'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Perf): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'highResFrequency()J'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Perf): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'registerNatives()V'(thread: JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_misc_Signal {

  public static 'findSignal(Ljava/lang/String;)I'(thread: JVMThread, arg0: JVMTypes.java_lang_String): number {
    // Signifies that we don't know the signal.
    return -1;
  }

  public static 'handle0(IJ)J'(thread: JVMThread, arg0: number, arg1: Long): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'raise0(I)V'(thread: JVMThread, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_misc_Unsafe {

  public static 'getInt(Ljava/lang/Object;J)I': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putInt(Ljava/lang/Object;JI)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getObject(Ljava/lang/Object;J)Ljava/lang/Object;': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => JVMTypes.java_lang_Object = getFromVMIndex;
  public static 'putObject(Ljava/lang/Object;JLjava/lang/Object;)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, new_obj: JVMTypes.java_lang_Object) => void = setFromVMIndex;

  public static 'getBoolean(Ljava/lang/Object;J)Z': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putBoolean(Ljava/lang/Object;JZ)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getByte(Ljava/lang/Object;J)B': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putByte(Ljava/lang/Object;JB)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getShort(Ljava/lang/Object;J)S': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putShort(Ljava/lang/Object;JS)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getChar(Ljava/lang/Object;J)C': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putChar(Ljava/lang/Object;JC)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getLong(Ljava/lang/Object;J)J': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => Long = getFromVMIndex;
  public static 'putLong(Ljava/lang/Object;JJ)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, x: Long) => void = setFromVMIndex;

  public static 'getFloat(Ljava/lang/Object;J)F': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putFloat(Ljava/lang/Object;JF)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getDouble(Ljava/lang/Object;J)D': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;

  public static 'putDouble(Ljava/lang/Object;JD)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getByte(J)B'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, address: Long): number {
    var heap = thread.getJVM().getHeap();
    return heap.get_signed_byte(address.toNumber());
  }

  public static 'putByte(JB)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, address: Long, val: number): void {
    var heap = thread.getJVM().getHeap();
    heap.set_signed_byte(address.toNumber(), val);
  }

  public static 'getShort(J)S'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putShort(JS)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getChar(J)C'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putChar(JC)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getInt(J)I'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putInt(JI)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getLong(J)J'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, address: Long): Long {
    var heap = thread.getJVM().getHeap(),
     addr = address.toNumber();
    return new Long(heap.get_word(addr), heap.get_word(addr + 4));
  }

  public static 'putLong(JJ)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, address: Long, value: Long): void {
    var heap = thread.getJVM().getHeap(),
      addr = address.toNumber();

    // LE
    heap.store_word(addr, value.getLowBits());
    heap.store_word(addr + 4, value.getHighBits());
  }

  public static 'getFloat(J)F'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putFloat(JF)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getDouble(J)D'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putDouble(JD)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getAddress(J)J'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'putAddress(JJ)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long, arg1: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'allocateMemory(J)J'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, size: Long): Long {
    var heap = thread.getJVM().getHeap();
    return Long.fromNumber(heap.malloc(size.toNumber()));
  }

  public static 'reallocateMemory(JJ)J'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: Long, arg1: Long): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'setMemory(Ljava/lang/Object;JJB)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, address: Long, bytes: Long, value: number): void {
    if (obj === null) {
      // Address is absolute.
      var i: number, addr = address.toNumber(),
        bytesNum: number = bytes.toNumber(),
        heap = thread.getJVM().getHeap();
      for (i = 0; i < bytesNum; i++) {
        heap.set_signed_byte(addr + i, value);
      }
    } else {
      // I have no idea what the semantics are when the object is specified.
      // I think it means use the object as the starting address... which doesn't
      // make sense for us.
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }
  }

  /**
   * Sets all bytes in a given block of memory to a copy of another
   * block.
   *
   * <p>This method determines each block's base address by means of two parameters,
   * and so it provides (in effect) a <em>double-register</em> addressing mode,
   * as discussed in {@link #getInt(Object,long)}.  When the object reference is null,
   * the offset supplies an absolute base address.
   *
   * <p>The transfers are in coherent (atomic) units of a size determined
   * by the address and length parameters.  If the effective addresses and
   * length are all even modulo 8, the transfer takes place in 'long' units.
   * If the effective addresses and length are (resp.) even modulo 4 or 2,
   * the transfer takes place in units of 'int' or 'short'.
   *
   * @since 1.7
   */
  public static 'copyMemory(Ljava/lang/Object;JLjava/lang/Object;JJ)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, srcBase: JVMTypes.java_lang_Object, srcOffset: Long, destBase: JVMTypes.java_lang_Object, destOffset: Long, bytes: Long): void {
    const heap = thread.getJVM().getHeap(),
      srcAddr = srcOffset.toNumber(),
      destAddr = destOffset.toNumber(),
      length = bytes.toNumber();
    if (srcBase === null && destBase === null) {
      // memcopy semantics w/ srcoffset/destoffset as absolute offsets.
      heap.memcpy(srcAddr, destAddr, length);
    } else if (srcBase === null && destBase !== null) {
      // OK, so... destBase is an array, destOffset is a byte offset from the
      // start of the array. Need to copy data from the heap directly into the array.
      if (util.is_array_type(destBase.getClass().getInternalName()) && util.is_primitive_type((<ArrayClassData<any>> destBase.getClass()).getComponentClass().getInternalName())) {
        const destArray: JVMTypes.JVMArray<any> = <any> destBase;
        switch (destArray.getClass().getComponentClass().getInternalName()) {
          case 'B':
            for (let i = 0; i < length; i++) {
              destArray.array[destAddr + i] = heap.get_signed_byte(srcAddr + i);
            }
            break;
          /*case 'C':
            break;
          case 'D':
            break;
          case 'F':
            break;
          case 'I':
            break;
          case 'J':
            break;
          case 'S':
            break;
          case 'Z':
            break;*/
          default:
            // I have no idea what the appropriate semantics are for this.
            thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented. destArray type: ' + destArray.getClass().getComponentClass().getInternalName());
            break;
        }
      } else {
        // I have no idea what the appropriate semantics are for this.
        thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      }
    } else if (srcBase !== null && destBase === null) {
      // srcBase is an array, destOffset is an address where the contents of srcBase should be copied.
      if (util.is_array_type(srcBase.getClass().getInternalName()) && util.is_primitive_type((<ArrayClassData<any>> srcBase.getClass()).getComponentClass().getInternalName())) {
        const srcArray: JVMTypes.JVMArray<any> = <any> srcBase;
        switch (srcArray.getClass().getComponentClass().getInternalName()) {
          case 'B':
          case 'C':
            for (let i = 0; i < length; i++) {
              heap.set_signed_byte(destAddr + i, srcArray.array[srcAddr + i]);
            }
            break;
          default:
            // I have no idea what the appropriate semantics are for this.
            thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented. srcArray:' + srcArray.getClass().getComponentClass().getInternalName());
            break;
        }
      } else {
        // I have no idea what the appropriate semantics are for this.
        thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      }
    } else {
      // I have no idea what the appropriate semantics are for this.
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented. Both src and dest are arrays?');
    }
  }

  public static 'freeMemory(J)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, address: Long): void {
    var heap = thread.getJVM().getHeap();
    heap.free(address.toNumber());
  }

  public static 'staticFieldOffset(Ljava/lang/reflect/Field;)J'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, field: JVMTypes.java_lang_reflect_Field): Long {
    var cls = <ReferenceClassData<JVMTypes.java_lang_Object>> field['java/lang/reflect/Field/clazz'].$cls;
    return Long.fromNumber(cls.getVMIndexForField(cls.getFieldFromSlot(field['java/lang/reflect/Field/slot'])));
  }

  public static 'objectFieldOffset(Ljava/lang/reflect/Field;)J'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, field: JVMTypes.java_lang_reflect_Field): Long {
    var cls = <ReferenceClassData<JVMTypes.java_lang_Object>> field['java/lang/reflect/Field/clazz'].$cls;
    return Long.fromNumber(cls.getVMIndexForField(cls.getFieldFromSlot(field['java/lang/reflect/Field/slot'])));
  }

  public static 'staticFieldBase(Ljava/lang/reflect/Field;)Ljava/lang/Object;'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, field: JVMTypes.java_lang_reflect_Field): JVMTypes.java_lang_Object {
    // Return a special JVM object.
    // TODO: Actually create a special DoppioJVM class for this.
    var rv = new ((<ReferenceClassData<JVMTypes.java_lang_Object>> thread.getBsCl().getInitializedClass(thread, 'Ljava/lang/Object;')).getConstructor(thread))(thread);
    (<any> rv).$staticFieldBase = field['java/lang/reflect/Field/clazz'].$cls;
    return rv;
  }

  public static 'ensureClassInitialized(Ljava/lang/Class;)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, cls: JVMTypes.java_lang_Class): void {
    if (cls.$cls.isInitialized(thread)) {
      return;
    }
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    cls.$cls.initialize(thread, (cdata: ClassData) => {
      if (cdata != null) {
        thread.asyncReturn();
      }
    }, true);
  }

  public static 'arrayBaseOffset(Ljava/lang/Class;)I'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: JVMTypes.java_lang_Class): number {
    return 0;
  }

  /**
   * Determines the size of elements in an array.
   * e.g. if the array index scale of something is *4*, then each element is 4*minimal addressable unit large.
   * Doppio emulates byte-addressable memory, so a return value of 4 indicates 4 bytes/32-bit large elements.
   */
  public static 'arrayIndexScale(Ljava/lang/Class;)I'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: JVMTypes.java_lang_Class): number {
    var cls = arg0.$cls;
    if (cls instanceof ArrayClassData) {
      switch(cls.getComponentClass().getInternalName()[0]) {
        case 'L':
        case '[':
        case 'F':
        case 'I':
          // 32-bits
          return 4;
        case 'B':
        case 'Z':
          // 8 bit
          return 1;
        case 'C':
        case 'S':
          // 16-bit
          return 2;
        case 'D':
        case 'J':
          // 64-bit
          return 8;
        default:
          // Erroneous input.
          return -1;
      }
    } else {
      // Erroneous input.
      return -1;
    }
  }

  public static 'addressSize()I'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe): number {
    return 4;
  }

  public static 'pageSize()I'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe): number {
    // Matches the heap.
    return 4096;
  }

  public static 'defineClass(Ljava/lang/String;[BIILjava/lang/ClassLoader;Ljava/security/ProtectionDomain;)Ljava/lang/Class;'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, name: JVMTypes.java_lang_String, bytes: JVMTypes.JVMArray<number>, offset: number, len: number, loaderObj: JVMTypes.java_lang_ClassLoader, pd: JVMTypes.java_security_ProtectionDomain): void {
    var loader = util.getLoader(thread, loaderObj),
      cdata: ClassData = loader.defineClass(thread, util.int_classname(name.toString()), util.byteArray2Buffer(bytes.array, offset, len), pd);
    if (cdata !== null) {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      // Resolve the class, since we're handing it back to the application
      // and we expect these things to be resolved.
      cdata.resolve(thread, (cdata: ClassData) => {
        if (cdata !== null) {
          thread.asyncReturn(cdata.getClassObject(thread));
        }
      });
    }
  }

  public static 'allocateInstance(Ljava/lang/Class;)Ljava/lang/Object;'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, jco: JVMTypes.java_lang_Class): JVMTypes.java_lang_Object {
    // This can trigger class initialization, so check if the class is
    // initialized.
    var cls = <ReferenceClassData<JVMTypes.java_lang_Object>> jco.$cls;
    if (cls.isInitialized(thread)) {
      return new (cls.getConstructor(thread))(thread);
    } else {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      cls.initialize(thread, () => {
        thread.asyncReturn(new (cls.getConstructor(thread))(thread));
      });
    }
  }

  public static 'monitorEnter(Ljava/lang/Object;)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: JVMTypes.java_lang_Object): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'monitorExit(Ljava/lang/Object;)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: JVMTypes.java_lang_Object): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'tryMonitorEnter(Ljava/lang/Object;)Z'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: JVMTypes.java_lang_Object): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'throwException(Ljava/lang/Throwable;)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, exception: JVMTypes.java_lang_Throwable): void {
    thread.throwException(exception);
  }

  public static 'compareAndSwapObject(Ljava/lang/Object;JLjava/lang/Object;Ljava/lang/Object;)Z': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: JVMTypes.java_lang_Object, arg1: Long, arg2: JVMTypes.java_lang_Object, arg3: JVMTypes.java_lang_Object) => boolean = unsafeCompareAndSwap;
  public static 'compareAndSwapInt(Ljava/lang/Object;JII)Z': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: JVMTypes.java_lang_Object, arg1: Long, arg2: number, arg3: number) => boolean = unsafeCompareAndSwap;
  public static 'compareAndSwapLong(Ljava/lang/Object;JJJ)Z': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: JVMTypes.java_lang_Object, arg1: Long, arg2: Long, arg3: Long) => boolean = unsafeCompareAndSwap;

  public static 'getObjectVolatile(Ljava/lang/Object;J)Ljava/lang/Object;': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => JVMTypes.java_lang_Object = getFromVMIndex;
  public static 'putObjectVolatile(Ljava/lang/Object;JLjava/lang/Object;)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: JVMTypes.java_lang_Object) => void  = setFromVMIndex;

  public static 'getIntVolatile(Ljava/lang/Object;J)I': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putIntVolatile(Ljava/lang/Object;JI)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getBooleanVolatile(Ljava/lang/Object;J)Z': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putBooleanVolatile(Ljava/lang/Object;JZ)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getByteVolatile(Ljava/lang/Object;J)B': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putByteVolatile(Ljava/lang/Object;JB)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getShortVolatile(Ljava/lang/Object;J)S': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putShortVolatile(Ljava/lang/Object;JS)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getCharVolatile(Ljava/lang/Object;J)C': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putCharVolatile(Ljava/lang/Object;JC)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getLongVolatile(Ljava/lang/Object;J)J': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => Long = getFromVMIndex;
  public static 'putLongVolatile(Ljava/lang/Object;JJ)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: Long) => void = setFromVMIndex;

  public static 'getFloatVolatile(Ljava/lang/Object;J)F': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putFloatVolatile(Ljava/lang/Object;JF)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'getDoubleVolatile(Ljava/lang/Object;J)D': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long) => number = getFromVMIndex;
  public static 'putDoubleVolatile(Ljava/lang/Object;JD)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;

  public static 'putOrderedObject(Ljava/lang/Object;JLjava/lang/Object;)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newObj: JVMTypes.java_lang_Object) => void = setFromVMIndex;
  public static 'putOrderedInt(Ljava/lang/Object;JI)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: number) => void = setFromVMIndex;
  public static 'putOrderedLong(Ljava/lang/Object;JJ)V': (thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, obj: JVMTypes.java_lang_Object, offset: Long, newValue: Long) => void = setFromVMIndex;

  /**
   * Unblock the given thread blocked on park, or, if it is not blocked, cause
   * the subsequent call to park not to block.
   */
  public static 'unpark(Ljava/lang/Object;)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, theThread: JVMTypes.java_lang_Thread): void {
    thread.getJVM().getParker().unpark(theThread.$thread);
  }

  /**
   * Block current thread, returning when a balancing unpark occurs, or a
   * balancing unpark has already occurred, or the thread is interrupted, or,
   * if not absolute and time is not zero, the given time nanoseconds have
   * elapsed, or if absolute, the given deadline in milliseconds since Epoch
   * has passed, or spuriously (i.e., returning for no "reason").
   */
  public static 'park(ZJ)V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, absolute: number, time: Long): void {
    var timeout = Infinity, parker = thread.getJVM().getParker();
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

    // Typed as any due to type discrepency between browser and node.
    var timer: any;
    if (timeout !== Infinity) {
      timer = setTimeout(() => {
        parker.completelyUnpark(thread);
      }, timeout);
    }

    parker.park(thread, () => {
      clearTimeout(timer);
      thread.asyncReturn();
    });
  }

  public static 'getLoadAverage([DI)I'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, arg0: JVMTypes.JVMArray<number>, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  /**
   * Detect if the given class may need to be initialized. This is often
   * needed in conjunction with obtaining the static field base of a
   * class.
   * @return false only if a call to {@code ensureClassInitialized} would have no effect
   */
  public static 'shouldBeInitialized(Ljava/lang/Class;)Z'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, cls: JVMTypes.java_lang_Class): number {
    return !cls.$cls.isInitialized(thread) ? 1 : 0;
  }

  /**
   * Define a class but do not make it known to the class loader or system dictionary.
   *
   * For each CP entry, the corresponding CP patch must either be null or have
   * the format that matches its tag:
   *
   * * Integer, Long, Float, Double: the corresponding wrapper object type from java.lang
   * * Utf8: a string (must have suitable syntax if used as signature or name)
   * * Class: any java.lang.Class object
   * * String: any object (not just a java.lang.String)
   * * InterfaceMethodRef: (NYI) a method handle to invoke on that call site's arguments
   *
   * @params hostClass context for linkage, access control, protection domain, and class loader
   * @params data      bytes of a class file
   * @params cpPatches where non-null entries exist, they replace corresponding CP entries in data
   */
  public static 'defineAnonymousClass(Ljava/lang/Class;[B[Ljava/lang/Object;)Ljava/lang/Class;'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe, hostClass: JVMTypes.java_lang_Class, data: JVMTypes.JVMArray<number>, cpPatches: JVMTypes.JVMArray<JVMTypes.java_lang_Object>): JVMTypes.java_lang_Class {
    return new ReferenceClassData(new Buffer(data.array), null, hostClass.$cls.getLoader(), cpPatches).getClassObject(thread);
  }

  /**
   * Ensures lack of reordering of loads before the fence
   * with loads or stores after the fence.
   * @since 1.8
   */
  public static 'loadFence()V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe): void {
    // NOP
  }

  /**
   * Ensures lack of reordering of stores before the fence
   * with loads or stores after the fence.
   * @since 1.8
   */
  public static 'storeFence()V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe): void {
    // NOP
  }

  /**
   * Ensures lack of reordering of loads or stores before the fence
   * with loads or stores after the fence.
   * @since 1.8
   */
  public static 'fullFence()V'(thread: JVMThread, javaThis: JVMTypes.sun_misc_Unsafe): void {
    // NOP
  }
}

class sun_misc_Version {

  public static 'getJvmSpecialVersion()Ljava/lang/String;'(thread: JVMThread): JVMTypes.java_lang_String {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getJdkSpecialVersion()Ljava/lang/String;'(thread: JVMThread): JVMTypes.java_lang_String {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getJvmVersionInfo()Z'(thread: JVMThread): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getJdkVersionInfo()V'(thread: JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_misc_VM {

  public static 'initialize()V'(thread: JVMThread): void {
    return;
  }

  /**
   * Returns the first non-null class loader (not counting class loaders
   * of generated reflection implementation classes) up the execution stack,
   * or null if only code from the null class loader is on the stack.
   */
  public static 'latestUserDefinedLoader()Ljava/lang/ClassLoader;'(thread: JVMThread): JVMTypes.java_lang_ClassLoader {
    var stackTrace = thread.getStackTrace(), i: number,
      bsCl = thread.getBsCl(), loader: ClassLoader;
    for (i = stackTrace.length - 1; i >= 0; i--) {
      loader = stackTrace[i].method.cls.getLoader();
      if (loader !== bsCl) {
        return (<CustomClassLoader> loader).getLoaderObject();
      }
    }
    return null;
  }

}

class sun_misc_VMSupport {

  public static 'initAgentProperties(Ljava/util/Properties;)Ljava/util/Properties;'(thread: JVMThread, arg0: JVMTypes.java_util_Properties): JVMTypes.java_util_Properties {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

/**
 * URLClassPath has optional support for a lookupcache, which we do not support.
 */
class sun_misc_URLClassPath {

  public static 'getLookupCacheURLs(Ljava/lang/ClassLoader;)[Ljava/net/URL;'(thread: JVMThread, loader: JVMTypes.java_lang_ClassLoader): JVMTypes.JVMArray<JVMTypes.java_net_URL> {
    return null;
  }


  public static 'getLookupCacheForClassLoader(Ljava/lang/ClassLoader;Ljava/lang/String;)[I'(thread: JVMThread, loader: JVMTypes.java_lang_ClassLoader, name: JVMTypes.java_lang_String): JVMTypes.JVMArray<number> {
    return null;
  }

  public static 'knownToNotExist0(Ljava/lang/ClassLoader;Ljava/lang/String;)Z'(thread: JVMThread, loader: JVMTypes.java_lang_ClassLoader, name: JVMTypes.java_lang_String): boolean {
    return false;
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
  'sun/misc/VMSupport': sun_misc_VMSupport,
  'sun/misc/URLClassPath': sun_misc_URLClassPath
});
