import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import methods = require('../methods');
import ConstantPool = require('../ConstantPool');
import enums = require('../enums');

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

  public static 'getIntAt0(Ljava/lang/Object;I)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getLongAt0(Ljava/lang/Object;I)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, cpo: java_object.JavaObject, idx: number): gLong {
    var cp = <ConstantPool.ConstantPool> cpo.get_field(thread, 'Lsun/reflect/ConstantPool;constantPoolOop');
    return cp.get(idx).value;
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

  public static 'getUTF8At0(Ljava/lang/Object;I)Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, cpo: java_object.JavaObject, idx: number): java_object.JavaObject {
    var cp = <ConstantPool.ConstantPool> cpo.get_field(thread, 'Lsun/reflect/ConstantPool;constantPoolOop');
    return java_object.initString(thread.getBsCl(), cp.get(idx).value);
  }

}

class sun_reflect_NativeConstructorAccessorImpl {

  public static 'newInstance0(Ljava/lang/reflect/Constructor;[Ljava/lang/Object;)Ljava/lang/Object;'(thread: threading.JVMThread, m: java_object.JavaObject, params: java_object.JavaArray): void {
    var cls = <java_object.JavaClassObject> m.get_field(thread, 'Ljava/lang/reflect/Constructor;clazz'),
      slot = m.get_field(thread, 'Ljava/lang/reflect/Constructor;slot');
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    cls.$cls.loader.initializeClass(thread, cls.$cls.get_type(), (cls_obj: ClassData.ReferenceClassData) => {
      var methods = cls_obj.get_methods(), sig: string,
        method: methods.Method,
        obj = new java_object.JavaObject(cls_obj),
        args: any[] = [obj];

      for (sig in methods) {
        if (methods.hasOwnProperty(sig)) {
          var aMethod = methods[sig];
          if (aMethod.idx === slot) {
            method = aMethod;
            break;
          }
        }
      }

      if (params != null) {
        args = args.concat(params.array);
      }
      thread.runMethod(method, args, (e?, rv?) => {
        if (e) {
          thread.throwException(e);
        } else {
          // rv is not defined, since constructors do not return a value.
          // Return the object we passed to the constructor.
          thread.asyncReturn(obj);
        }
      });
    }, true);
  }

}

class sun_reflect_NativeMethodAccessorImpl {

  public static 'invoke0(Ljava/lang/reflect/Method;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;'(thread: threading.JVMThread, mObj: java_object.JavaObject, obj: java_object.JavaObject, params: java_object.JavaArray): void {
    var cls = <ClassData.ReferenceClassData> (<java_object.JavaClassObject> mObj.get_field(thread, 'Ljava/lang/reflect/Method;clazz')).$cls,
      slot: number = mObj.get_field(thread, 'Ljava/lang/reflect/Method;slot'),
      ret_type = mObj.get_field(thread, 'Ljava/lang/reflect/Method;returnType'),
      m: methods.Method,
      methods = cls.get_methods(),
      sig: string, args: any[] = [];

    // Find the method object.
    // @todo This should probably be easier to get to from a reflected object.
    for (sig in methods) {
      if (methods.hasOwnProperty(sig)) {
        var aMethod = methods[sig];
        if (aMethod.idx === slot) {
          m = aMethod;
          break;
        }
      }
    }

    if (!m.access_flags.static) {
      args.push(obj);
    }
    if (params != null) {
      args = args.concat(params.array);
    }

    thread.runMethod(m, args, (e?, rv?) => {
      if (e) {
        thread.throwException(e);
      } else {
        if (util.is_primitive_type(ret_type)) {
          // wrap up primitives in their Object box
          thread.asyncReturn(ret_type.$cls.create_wrapper_object(thread, rv));
        } else {
          thread.asyncReturn(rv);
        }
      }
    });
  }

}

function get_caller_class(thread: threading.JVMThread, framesToSkip: number): java_object.JavaClassObject {
  var caller = thread.getStackTrace();
  return caller[caller.length - 1 - framesToSkip].method.cls.get_class_object(thread);
}

class sun_reflect_Reflection {

  public static 'getCallerClass()Ljava/lang/Class;'(thread: threading.JVMThread): java_object.JavaClassObject {
    // 0th item is Reflection class, 1st item is the class that called us,
    // and 2nd item is the caller of our caller, which is correct.
    return get_caller_class(thread, 2);
  }

  public static 'getCallerClass0(I)Ljava/lang/Class;': (thread: threading.JVMThread, frames_to_skip: number) => java_object.JavaClassObject = get_caller_class;

  public static 'getClassAccessFlags(Ljava/lang/Class;)I'(thread: threading.JVMThread, class_obj: java_object.JavaClassObject): number {
    return (<ClassData.ReferenceClassData> class_obj.$cls).access_byte;
  }

}

({
  'sun/reflect/ConstantPool': sun_reflect_ConstantPool,
  'sun/reflect/NativeConstructorAccessorImpl': sun_reflect_NativeConstructorAccessorImpl,
  'sun/reflect/NativeMethodAccessorImpl': sun_reflect_NativeMethodAccessorImpl,
  'sun/reflect/Reflection': sun_reflect_Reflection
})
