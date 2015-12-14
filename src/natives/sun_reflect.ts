import JVMTypes = require('../../includes/JVMTypes');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import ConstantPool = Doppio.VM.ClassFile.ConstantPool;
import Long = Doppio.VM.Long;
import Method = Doppio.VM.ClassFile.Method;
import ThreadStatus = Doppio.VM.Enums.ThreadStatus;
import assert = Doppio.Debug.Assert;
import PrimitiveClassData = Doppio.VM.ClassFile.PrimitiveClassData;
import IStackTraceFrame = Doppio.VM.Threading.IStackTraceFrame;
declare var registerNatives: (defs: any) => void;

class sun_reflect_ConstantPool {

  public static 'getSize0(Ljava/lang/Object;)I'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getClassAt0(Ljava/lang/Object;I)Ljava/lang/Class;'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, arg1: number): JVMTypes.java_lang_Class {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getClassAtIfLoaded0(Ljava/lang/Object;I)Ljava/lang/Class;'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, arg1: number): JVMTypes.java_lang_Class {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMethodAt0(Ljava/lang/Object;I)Ljava/lang/reflect/Member;'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, arg1: number): JVMTypes.java_lang_reflect_Member {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMethodAtIfLoaded0(Ljava/lang/Object;I)Ljava/lang/reflect/Member;'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, arg1: number): JVMTypes.java_lang_reflect_Member {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getFieldAt0(Ljava/lang/Object;I)Ljava/lang/reflect/Field;'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, arg1: number): JVMTypes.java_lang_reflect_Field {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getFieldAtIfLoaded0(Ljava/lang/Object;I)Ljava/lang/reflect/Field;'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, arg1: number): JVMTypes.java_lang_reflect_Field {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMemberRefInfoAt0(Ljava/lang/Object;I)[Ljava/lang/String;'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, arg1: number): JVMTypes.JVMArray<JVMTypes.java_lang_String> {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getIntAt0(Ljava/lang/Object;I)I'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, idx: number): number {
    return (<ConstantPool.ConstInt32> cp.get(idx)).value;
  }

  public static 'getLongAt0(Ljava/lang/Object;I)J'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, idx: number): Long {
    return (<ConstantPool.ConstLong> cp.get(idx)).value;
  }

  public static 'getFloatAt0(Ljava/lang/Object;I)F'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getDoubleAt0(Ljava/lang/Object;I)D'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getStringAt0(Ljava/lang/Object;I)Ljava/lang/String;'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, arg1: number): JVMTypes.java_lang_String {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getUTF8At0(Ljava/lang/Object;I)Ljava/lang/String;'(thread: JVMThread, javaThis: JVMTypes.sun_reflect_ConstantPool, cp: ConstantPool.ConstantPool, idx: number): JVMTypes.java_lang_String {
    return util.initString(thread.getBsCl(), (<ConstantPool.ConstUTF8> cp.get(idx)).value);
  }

}

class sun_reflect_NativeConstructorAccessorImpl {

  public static 'newInstance0(Ljava/lang/reflect/Constructor;[Ljava/lang/Object;)Ljava/lang/Object;'(thread: JVMThread, m: JVMTypes.java_lang_reflect_Constructor, params: JVMTypes.JVMArray<JVMTypes.java_lang_Object>): void {
    var cls = m['java/lang/reflect/Constructor/clazz'],
      slot = m['java/lang/reflect/Constructor/slot'];
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    cls.$cls.initialize(thread, (cls: ReferenceClassData<JVMTypes.java_lang_Object>) => {
      if (cls !== null) {
        var method: Method = cls.getMethodFromSlot(slot),
          obj = new (cls.getConstructor(thread))(thread), i: number,
          cb = (e?: JVMTypes.java_lang_Throwable) => {
            if (e) {
              // Wrap in a java.lang.reflect.InvocationTargetException
              thread.getBsCl().initializeClass(thread, 'Ljava/lang/reflect/InvocationTargetException;', (cdata: ReferenceClassData<JVMTypes.java_lang_reflect_InvocationTargetException>) => {
                if (cdata !== null) {
                  var wrappedE = new (cdata.getConstructor(thread))(thread);
                  wrappedE['<init>(Ljava/lang/Throwable;)V'](thread, [e], (e?: JVMTypes.java_lang_Throwable) => {
                    thread.throwException(e ? e : wrappedE);
                  });
                }
              });
            } else {
              // rv is not defined, since constructors do not return a value.
              // Return the object we passed to the constructor.
              thread.asyncReturn(obj);
            }
          };

        assert(slot >= 0, "Found a constructor without a slot?!");
        (<JVMTypes.JVMFunction> (<any> obj)[method.signature])(thread, params ? params.array : null, cb);
      }
    }, true);
  }

}

class sun_reflect_NativeMethodAccessorImpl {

  /**
   * Invoke the specified method on the given object with the given parameters.
   * If the method is an interface method, perform a virtual method dispatch.
   */
  public static 'invoke0(Ljava/lang/reflect/Method;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;'(thread: JVMThread, mObj: JVMTypes.java_lang_reflect_Method, obj: JVMTypes.java_lang_Object, params: JVMTypes.JVMArray<JVMTypes.java_lang_Object>): void {
    var cls = <ReferenceClassData<JVMTypes.java_lang_Object>> mObj['java/lang/reflect/Method/clazz'].$cls,
      slot: number = mObj['java/lang/reflect/Method/slot'],
      retType = mObj['java/lang/reflect/Method/returnType'],
      m: Method = cls.getMethodFromSlot(slot),
      args: any[] = [],
      cb = (e?: JVMTypes.java_lang_Throwable, rv?: any) => {
        if (e) {
          // Wrap in a java.lang.reflect.InvocationTargetException
          thread.getBsCl().initializeClass(thread, 'Ljava/lang/reflect/InvocationTargetException;', (cdata: ReferenceClassData<JVMTypes.java_lang_reflect_InvocationTargetException>) => {
            if (cdata !== null) {
              var wrappedE = new (cdata.getConstructor(thread))(thread);
              wrappedE['<init>(Ljava/lang/Throwable;)V'](thread, [e], (e?: JVMTypes.java_lang_Throwable) => {
                thread.throwException(e ? e : wrappedE);
              });
            }
          });
        } else {
          if (util.is_primitive_type(m.returnType)) {
            if (m.returnType === 'V') {
              // apparently the JVM returns NULL when there's a void return value,
              // rather than autoboxing a Void object. Go figure!
              thread.asyncReturn(null);
            } else {
              // wrap up primitives in their Object box
              thread.asyncReturn((<PrimitiveClassData> retType.$cls).createWrapperObject(thread, rv));
            }
          } else {
            thread.asyncReturn(rv);
          }
        }
      };

    if (params !== null) {
      args = util.unboxArguments(thread, m.parameterTypes, params.array)
    }

    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    if (m.accessFlags.isStatic()) {
      (<JVMTypes.JVMFunction> (<any> cls.getConstructor(thread))[m.fullSignature])(thread, args, cb);
    } else {
      (<JVMTypes.JVMFunction> (<any> obj)[m.signature])(thread, args, cb);
    }
  }
}

/**
 * From JDK documentation:
 *   Returns the class of the method realFramesToSkip frames up the stack
 *   (zero-based), ignoring frames associated with
 *   java.lang.reflect.Method.invoke() and its implementation. The first
 *   frame is that associated with this method, so getCallerClass(0) returns
 *   the Class object for sun.reflect.Reflection. Frames associated with
 *   java.lang.reflect.Method.invoke() and its implementation are completely
 *   ignored and do not count toward the number of "real" frames skipped.
 */
function getCallerClass(thread: JVMThread, framesToSkip: number): JVMTypes.java_lang_Class {
  var caller = thread.getStackTrace(),
    idx = caller.length - 1 - framesToSkip,
    frame: IStackTraceFrame = caller[idx];
  while (frame.method.fullSignature.indexOf('java/lang/reflect/Method/invoke') === 0) {
    if (idx === 0) {
      // No more stack to search!
      // XXX: What does the JDK do here, throw an exception?
      return null;
    }
    frame = caller[--idx];
  }

  return frame.method.cls.getClassObject(thread);
}

class sun_reflect_Reflection {

  public static 'getCallerClass()Ljava/lang/Class;'(thread: JVMThread): JVMTypes.java_lang_Class {
    // 0th item is Reflection class, 1st item is the class that called us,
    // and 2nd item is the caller of our caller, which is correct.
    return getCallerClass(thread, 2);
  }

  public static 'getCallerClass(I)Ljava/lang/Class;': (thread: JVMThread, framesToSkip: number) => JVMTypes.java_lang_Class = getCallerClass;

  public static 'getClassAccessFlags(Ljava/lang/Class;)I'(thread: JVMThread, classObj: JVMTypes.java_lang_Class): number {
    return (<ReferenceClassData<JVMTypes.java_lang_Object>> classObj.$cls).accessFlags.getRawByte();
  }

}

registerNatives({
  'sun/reflect/ConstantPool': sun_reflect_ConstantPool,
  'sun/reflect/NativeConstructorAccessorImpl': sun_reflect_NativeConstructorAccessorImpl,
  'sun/reflect/NativeMethodAccessorImpl': sun_reflect_NativeMethodAccessorImpl,
  'sun/reflect/Reflection': sun_reflect_Reflection
});
