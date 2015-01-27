import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import methods = require('../methods');
import ConstantPool = require('../ConstantPool');
import enums = require('../enums');
import assert = require('../assert');
declare var registerNatives: (defs: any) => void;

class sun_reflect_ConstantPool {

  public static 'getSize0(Ljava/lang/Object;)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getClassAt0(Ljava/lang/Object;I)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaClassObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getClassAtIfLoaded0(Ljava/lang/Object;I)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaClassObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMethodAt0(Ljava/lang/Object;I)Ljava/lang/reflect/Member;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMethodAtIfLoaded0(Ljava/lang/Object;I)Ljava/lang/reflect/Member;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getFieldAt0(Ljava/lang/Object;I)Ljava/lang/reflect/Field;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getFieldAtIfLoaded0(Ljava/lang/Object;I)Ljava/lang/reflect/Field;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMemberRefInfoAt0(Ljava/lang/Object;I)[Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaArray {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getIntAt0(Ljava/lang/Object;I)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, cp: ConstantPool.ConstantPool, idx: number): number {
    return (<ConstantPool.ConstInt32> cp.get(idx)).value;
  }

  public static 'getLongAt0(Ljava/lang/Object;I)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, cpo: java_object.JavaObject, idx: number): gLong {
    var cp = <ConstantPool.ConstantPool> cpo.get_field(thread, 'Lsun/reflect/ConstantPool;constantPoolOop');
    return (<ConstantPool.ConstLong> cp.get(idx)).value;
  }

  public static 'getFloatAt0(Ljava/lang/Object;I)F'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getDoubleAt0(Ljava/lang/Object;I)D'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getStringAt0(Ljava/lang/Object;I)Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getUTF8At0(Ljava/lang/Object;I)Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, cp: ConstantPool.ConstantPool, idx: number): java_object.JavaObject {
    return java_object.initString(thread.getBsCl(), (<ConstantPool.ConstUTF8> cp.get(idx)).value);
  }

}

class sun_reflect_NativeConstructorAccessorImpl {

  public static 'newInstance0(Ljava/lang/reflect/Constructor;[Ljava/lang/Object;)Ljava/lang/Object;'(thread: threading.JVMThread, m: java_object.JavaObject, params: java_object.JavaArray): void {
    var cls = <java_object.JavaClassObject> m.get_field(thread, 'Ljava/lang/reflect/Constructor;clazz'),
      slot = m.get_field(thread, 'Ljava/lang/reflect/Constructor;slot');
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    cls.$cls.initialize(thread, (cls_obj: ClassData.ReferenceClassData) => {
      if (cls_obj !== null) {
        var method: methods.Method = cls_obj.getMethodFromSlot(slot),
          obj = new java_object.JavaObject(cls_obj),
          args: any[] = [obj], i: number;

        if (slot === -1) {
          // HACK: Need to manually look up. :|
          method = cls_obj.methodLookup(thread, "<init>" + util.getDescriptorString(thread.getBsCl().getInitializedClass(thread, 'V').getClassObject(thread), m.get_field(thread, 'Ljava/lang/reflect/Constructor;parameterTypes')));
        }

        if (params !== null) {
          args = args.concat(params.array);
        }
        thread.runMethod(method, args, (e?, rv?) => {
          if (e) {
            // Wrap in a java.lang.reflect.InvocationTargetException
            thread.getBsCl().initializeClass(thread, 'Ljava/lang/reflect/InvocationTargetException;', (cdata: ClassData.ReferenceClassData) => {
              if (cdata !== null) {
                var wrappedE = new java_object.JavaObject(cdata);
                thread.runMethod(cdata.methodLookup(thread, '<init>(Ljava/lang/Throwable;)V'), [wrappedE, e], (e?, rv?) => {
                  thread.throwException(e ? e : wrappedE);
                });
              }
            });
          } else {
            // rv is not defined, since constructors do not return a value.
            // Return the object we passed to the constructor.
            thread.asyncReturn(obj);
          }
        });
      }
    }, true);
  }

}

class sun_reflect_NativeMethodAccessorImpl {

  /**
   * Invoke the specified method on the given object with the given parameters.
   * If the method is an interface method, perform a virtual method dispatch.
   */
  public static 'invoke0(Ljava/lang/reflect/Method;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;'(thread: threading.JVMThread, mObj: java_object.JavaObject, obj: java_object.JavaObject, params: java_object.JavaArray): void {
    var cls = <ClassData.ReferenceClassData> (<java_object.JavaClassObject> mObj.get_field(thread, 'Ljava/lang/reflect/Method;clazz')).$cls,
      slot: number = mObj.get_field(thread, 'Ljava/lang/reflect/Method;slot'),
      ret_type = <java_object.JavaClassObject> mObj.get_field(thread, 'Ljava/lang/reflect/Method;returnType'),
      m: methods.Method = cls.getMethodFromSlot(slot),
      args: any[] = [], i: number;

    if (cls.accessFlags.isInterface()) {
      // It's an interface method. Look up the implementation in the object.
      m = obj.cls.methodLookup(thread, m.name + m.raw_descriptor);
      if (m == null) {
        // Method not found, exception thrown. Return.
        return;
      }
    }

    if (!m.accessFlags.isStatic()) {
      args.push(obj);
    }
    if (params != null) {
      // Unbox any primitives in the arguments array, and pad them if they are 64-bit.
      args = args.concat(util.unboxArguments(thread, m.param_types, params.array));
    }

    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    thread.runMethod(m, args, (e?, rv?) => {
      if (e) {
        // Wrap in a java.lang.reflect.InvocationTargetException
        thread.getBsCl().initializeClass(thread, 'Ljava/lang/reflect/InvocationTargetException;', (cdata: ClassData.ReferenceClassData) => {
          if (cdata !== null) {
            var wrappedE = new java_object.JavaObject(cdata);
            thread.runMethod(cdata.methodLookup(thread, '<init>(Ljava/lang/Throwable;)V'), [wrappedE, e], (e?, rv?) => {
              thread.throwException(e ? e : wrappedE);
            });
          }
        });
      } else {
        if (util.is_primitive_type(m.return_type)) {
          if (m.return_type === 'V') {
            // apparently the JVM returns NULL when there's a void return value,
            // rather than autoboxing a Void object. Go figure!
            thread.asyncReturn(null);
          } else {
            // wrap up primitives in their Object box
            thread.asyncReturn((<ClassData.PrimitiveClassData> ret_type.$cls).createWrapperObject(thread, rv));
          }
        } else {
          thread.asyncReturn(rv);
        }
      }
    });
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
function get_caller_class(thread: threading.JVMThread, framesToSkip: number): java_object.JavaClassObject {
  var caller = thread.getStackTrace(),
    idx = caller.length - 1 - framesToSkip,
    frame: threading.IStackTraceFrame = caller[idx];
  while (frame.method.full_signature().indexOf('Ljava/lang/reflect/Method;::invoke') === 0) {
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

  public static 'getCallerClass()Ljava/lang/Class;'(thread: threading.JVMThread): java_object.JavaClassObject {
    // 0th item is Reflection class, 1st item is the class that called us,
    // and 2nd item is the caller of our caller, which is correct.
    return get_caller_class(thread, 2);
  }

  public static 'getCallerClass(I)Ljava/lang/Class;': (thread: threading.JVMThread, frames_to_skip: number) => java_object.JavaClassObject = get_caller_class;

  public static 'getClassAccessFlags(Ljava/lang/Class;)I'(thread: threading.JVMThread, class_obj: java_object.JavaClassObject): number {
    return (<ClassData.ReferenceClassData> class_obj.$cls).accessFlags.getRawByte();
  }

}

registerNatives({
  'sun/reflect/ConstantPool': sun_reflect_ConstantPool,
  'sun/reflect/NativeConstructorAccessorImpl': sun_reflect_NativeConstructorAccessorImpl,
  'sun/reflect/NativeMethodAccessorImpl': sun_reflect_NativeMethodAccessorImpl,
  'sun/reflect/Reflection': sun_reflect_Reflection
});
