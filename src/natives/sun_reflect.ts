import runtime = require('../runtime');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import exceptions = require('../exceptions');
import threading = require('../threading');
import methods = require('../methods');
import ConstantPool = require('../ConstantPool');

// Used by invoke0 to handle manually setting up the caller's stack frame
function setup_caller_stack(rs: runtime.RuntimeState, method: methods.Method, obj: java_object.JavaObject, params: java_object.JavaArray): threading.StackFrame {
  var primitive_value, _i: number;

  if (!method.access_flags["static"]) {
    rs.push(obj);
  }
  // we don't get unboxing for free anymore, so we have to do it ourselves
  var i = 0, p_types = method.param_types;
  for (_i = 0; _i < p_types.length; _i++) {
    var p_type = p_types[_i],
      p = params.array[i++];
    // cat 2 primitives
    if (p_type === 'J' || p_type === 'D') {
      if (p != null && p.ref != null) {
        primitive_value = p.get_field(rs, p.cls.get_type() + 'value');
        rs.push2(primitive_value, null);
      } else {
        rs.push2(p, null);
        i++; // skip past the null spacer
      }
    } else if (util.is_primitive_type(p_type)) { // any other primitive
      if (p != null && p.ref != null) {
        primitive_value = p.get_field(rs, p.cls.get_type() + 'value');
        rs.push(primitive_value);
      } else {
        rs.push(p);
      }
    } else {
      rs.push(p);
    }
  }
  return rs.curr_frame();
}

class sun_reflect_ConstantPool {

  public static 'getSize0(Ljava/lang/Object;)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getClassAt0(Ljava/lang/Object;I)Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaClassObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getClassAtIfLoaded0(Ljava/lang/Object;I)Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaClassObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMethodAt0(Ljava/lang/Object;I)Ljava/lang/reflect/Member;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMethodAtIfLoaded0(Ljava/lang/Object;I)Ljava/lang/reflect/Member;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getFieldAt0(Ljava/lang/Object;I)Ljava/lang/reflect/Field;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getFieldAtIfLoaded0(Ljava/lang/Object;I)Ljava/lang/reflect/Field;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMemberRefInfoAt0(Ljava/lang/Object;I)[Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaArray {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getIntAt0(Ljava/lang/Object;I)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getLongAt0(Ljava/lang/Object;I)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, cpo: java_object.JavaObject, idx: number): gLong {
    var cp = <ConstantPool.ConstantPool> cpo.get_field(rs, 'Lsun/reflect/ConstantPool;constantPoolOop');
    return cp.get(idx).value;
  }

  public static 'getFloatAt0(Ljava/lang/Object;I)F'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getDoubleAt0(Ljava/lang/Object;I)D'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getStringAt0(Ljava/lang/Object;I)Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getUTF8At0(Ljava/lang/Object;I)Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, cpo: java_object.JavaObject, idx: number): java_object.JavaObject {
    var cp = <ConstantPool.ConstantPool> cpo.get_field(rs, 'Lsun/reflect/ConstantPool;constantPoolOop');
    return rs.init_string(cp.get(idx).value);
  }

}

class sun_reflect_NativeConstructorAccessorImpl {

  public static 'newInstance0(Ljava/lang/reflect/Constructor;[Ljava/lang/Object;)Ljava/lang/Object;'(rs: runtime.RuntimeState, m: java_object.JavaObject, params: java_object.JavaArray): void {
    var cls = <java_object.JavaClassObject> m.get_field(rs, 'Ljava/lang/reflect/Constructor;clazz'),
      slot = m.get_field(rs, 'Ljava/lang/reflect/Constructor;slot');
    rs.async_op((resume_cb, except_cb) => {
      cls.$cls.loader.initialize_class(rs, cls.$cls.get_type(), ((cls_obj: ClassData.ReferenceClassData) => {
        var methods = cls_obj.get_methods(), sig: string,
          method: methods.Method, my_sf = rs.curr_frame(),
          obj = new java_object.JavaObject(rs, cls_obj);

        for (sig in methods) {
          if (methods.hasOwnProperty(sig)) {
            var aMethod = methods[sig];
            if (aMethod.idx === slot) {
              method = aMethod;
              break;
            }
          }
        }

        rs.push(obj);
        if (params != null) {
          rs.push_array(params.array);
        }
        // Reenter the RuntimeState loop, which should run our new StackFrame.
        // XXX: We use except_cb because it just replaces the runner function of the
        // current frame. We need a better story for calling Java threads through
        // native functions.
        except_cb(() => {
          // Push the constructor's frame onto the stack.
          method.setup_stack(rs);
          // Overwrite my runner.
          my_sf.runner = () => {
            rs.meta_stack().pop();
            rs.push(obj);
          };
        });
      }), except_cb);
    });
  }

}

class sun_reflect_NativeMethodAccessorImpl {

  public static 'invoke0(Ljava/lang/reflect/Method;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;'(rs: runtime.RuntimeState, m: java_object.JavaObject, obj: java_object.JavaObject, params: java_object.JavaArray): void {
    var cleanup_runner, method: methods.Method, caller_sf;

    var cls = <java_object.JavaClassObject> m.get_field(rs, 'Ljava/lang/reflect/Method;clazz'),
      // make the cleanup runner, before we branch too much
      ret_type = m.get_field(rs, 'Ljava/lang/reflect/Method;returnType'),
      ret_descriptor = ret_type.$cls.get_type();

    if (util.is_primitive_type(ret_descriptor) && ret_descriptor !== 'V') {
      cleanup_runner = () => {
        var rv = ret_descriptor === 'J' || ret_descriptor === 'D' ? rs.pop2() : rs.pop();
        rs.meta_stack().pop();
        // wrap up primitives in their Object box
        return rs.push(ret_type.$cls.create_wrapper_object(rs, rv));
      };
    } else {
      cleanup_runner = () => {
        var rv = rs.pop();
        rs.meta_stack().pop();
        return rs.push(rv);
      };
    }
    // dispatch this sucka
    if ((<ClassData.ReferenceClassData> cls.$cls).access_byte & 0x200) { // cls is an interface, so we need to virtual dispatch
      var cls_obj = rs.check_null(obj).cls,
        name: string = m.get_field(rs, 'Ljava/lang/reflect/Method;name').jvm2js_str(rs),
        p_types = <java_object.JavaArray> m.get_field(rs, 'Ljava/lang/reflect/Method;parameterTypes'),
        p_desc = ((function () {
          var i: number, p_types_array: java_object.JavaClassObject[] = p_types.array,
            len = p_types_array.length, results: string[];

          results = [];
          for (i = 0; i < len; i++) {
            var pt = p_types_array[i];
            results.push(pt.$cls.get_type());
          }
          return results;
        })()).join(''),
        m_sig = "" + name + "(" + p_desc + ")" + ret_descriptor;

      method = cls_obj.method_lookup(rs, m_sig),
      caller_sf = setup_caller_stack(rs, method, obj, params);
      method.setup_stack(rs);
      caller_sf.runner = cleanup_runner;
      throw exceptions.ReturnException;
    } else {
      var slot = m.get_field(rs, 'Ljava/lang/reflect/Method;slot');
      rs.async_op(function (resume_cb, except_cb) {
        cls.$cls.loader.initialize_class(rs, cls.$cls.get_type(), ((cls_obj: ClassData.ClassData) => {
          var methods = cls_obj.get_methods(), sig: string;
          for (sig in methods) {
            if (methods.hasOwnProperty(sig)) {
              var aMethod = methods[sig];
              if (aMethod.idx === slot) {
                method = aMethod;
                break;
              }
            }
          }

          caller_sf = setup_caller_stack(rs, method, obj, params);
          // Reenter the RuntimeState loop, which should run our new StackFrame.
          // XXX: We use except_cb because it just replaces the runner function of the
          // current frame. We need a better story for calling Java threads through
          // native functions.
          except_cb(() => {
            method.setup_stack(rs);
            caller_sf.runner = cleanup_runner;
          });
        }), except_cb);
      });
    }
  }

}

function get_caller_class(rs: runtime.RuntimeState, frames_to_skip: number): java_object.JavaClassObject {
  var caller = rs.meta_stack().get_caller(frames_to_skip);
  // Note: disregard frames associated with
  //   java.lang.reflect.Method.invoke() and its implementation.
  if (caller.name.indexOf('Ljava/lang/reflect/Method;::invoke') === 0) {
    caller = rs.meta_stack().get_caller(frames_to_skip + 1);
  }
  var cls = caller.method.cls;
  return cls.get_class_object(rs);
}

class sun_reflect_Reflection {

  public static 'getCallerClass()Ljava/lang/Class;'(rs: runtime.RuntimeState): java_object.JavaClassObject {
    // 0th item is Reflection class, 1st item is the class that called us,
    // and 2nd item is the caller of our caller, which is correct.
    return get_caller_class(rs, 2);
  }

  public static 'getCallerClass0(I)Ljava/lang/Class;': (rs: runtime.RuntimeState, frames_to_skip: number) => java_object.JavaClassObject = get_caller_class;

  public static 'getClassAccessFlags(Ljava/lang/Class;)I'(rs: runtime.RuntimeState, class_obj: java_object.JavaClassObject): number {
    return (<ClassData.ReferenceClassData> class_obj.$cls).access_byte;
  }

}

({
  'sun/reflect/ConstantPool': sun_reflect_ConstantPool,
  'sun/reflect/NativeConstructorAccessorImpl': sun_reflect_NativeConstructorAccessorImpl,
  'sun/reflect/NativeMethodAccessorImpl': sun_reflect_NativeMethodAccessorImpl,
  'sun/reflect/Reflection': sun_reflect_Reflection
})
