import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import attributes = require('../attributes');
import methods = require('../methods');
import threading = require('../threading');
import ClassLoader = require('../ClassLoader');
import enums = require('../enums');
import assert = require('../assert');
declare var registerNatives: (defs: any) => void;

var debug = logging.debug;

function array_get(thread: threading.JVMThread, arr: java_object.JavaArray, idx: number): any {
  if (arr == null) {
    thread.throwNewException('Ljava/lang/NullPointerException;', '');
  } else {
    var array = arr.array;
    if (idx < 0 || idx >= array.length) {
      thread.throwNewException('Ljava/lang/ArrayIndexOutOfBoundsException;', 'Tried to access an illegal index in an array.');
    } else {
      return array[idx];
    }
  }
}

function isNotNull(thread: threading.JVMThread, obj: any): boolean {
  if (obj == null) {
    thread.throwNewException('Ljava/lang/NullPointerException;', '');
    return false;
  } else {
    return true;
  }
}

function verify_array(thread: threading.JVMThread, obj: java_object.JavaArray): boolean {
  if (!(obj instanceof java_object.JavaArray)) {
    thread.throwNewException('Ljava/lang/IllegalArgumentException;', 'Object is not an array.');
    return false;
  } else {
    return true;
  }
}

// helper function for stack trace natives (see java/lang/Throwable)
function create_stack_trace(thread: threading.JVMThread, throwable: java_object.JavaObject): java_object.JavaObject[] {
  var stacktrace = [],
    cstack = thread.getStackTrace(),
    i: number, j: number, bsCl = thread.getBsCl(),
    stackTraceElementCls = <ClassData.ReferenceClassData> bsCl.getInitializedClass(thread, 'Ljava/lang/StackTraceElement;');
  /**
   * OK, so we need to toss the following stack frames:
   * - The stack frame for this method.
   * - If we're still constructing the throwable object, we need to toss any
   *   stack frames involved in constructing the throwable. But if we're not,
   *   then there's no other frames we should cut.
   */
  cstack.pop(); // The stack frame for this method.
  // Bytecode methods involved in constructing the throwable. We assume that
  // there are no native methods involved in the mix other than this one.
  while (cstack.length > 0 &&
    !cstack[cstack.length - 1].method.access_flags.native &&
    cstack[cstack.length - 1].locals[0] === throwable) {
    cstack.pop();
  }
  assert(cstack.length > 0);

  for (i = 0; i < cstack.length; i++) {
    var sf = cstack[i],
      cls = sf.method.cls,
      ln = -1,
      sourceFile: string;
    if (sf.method.access_flags.native) {
      sourceFile = 'Native Method';
    } else {
      var srcAttr = <attributes.SourceFile> cls.get_attribute('SourceFile'),
        code = sf.method.getCodeAttribute(),
        table = <attributes.LineNumberTable> code.get_attribute('LineNumberTable');
      sourceFile = (srcAttr != null) ? srcAttr.filename : 'unknown';

      if (table != null) {
        // get the last line number before the stack frame's pc
        for (j = 0; j < table.entries.length; j++) {
          var row = table.entries[j];
          if (row.start_pc <= sf.pc) {
            ln = row.line_number;
          }
        }
      } else {
        ln = -1;
      }
    }
    stacktrace.push(new java_object.JavaObject(stackTraceElementCls, {
      'Ljava/lang/StackTraceElement;declaringClass': java_object.initString(bsCl, util.ext_classname(cls.get_type())),
      'Ljava/lang/StackTraceElement;methodName': java_object.initString(bsCl, sf.method.name != null ? sf.method.name : 'unknown'),
      'Ljava/lang/StackTraceElement;fileName': java_object.initString(bsCl, sourceFile),
      'Ljava/lang/StackTraceElement;lineNumber': ln
    }));
  }
  return stacktrace.reverse();
}

class java_lang_Class {

  public static 'forName0(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;'(thread: threading.JVMThread, jvm_str: java_object.JavaObject, initialize: number, jclo: ClassLoader.JavaClassLoaderObject): void {
    var classname = util.int_classname(jvm_str.jvm2js_str());
    if (!util.verify_int_classname(classname)) {
      thread.throwNewException('Ljava/lang/ClassNotFoundException;', classname);
    } else {
      var loader = java_object.get_cl_from_jclo(thread, jclo);
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      if (initialize) {
        loader.initializeClass(thread, classname, (cls: ClassData.ReferenceClassData) => {
          if (cls != null) {
            thread.asyncReturn(cls.get_class_object(thread));
          }
        });
      } else {
        loader.resolveClass(thread, classname, (cls: ClassData.ReferenceClassData) => {
          if (cls != null) {
            thread.asyncReturn(cls.get_class_object(thread));
          }
        });
      }
    }
  }

  public static 'isInstance(Ljava/lang/Object;)Z'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject, obj: java_object.JavaObject): boolean {
    return obj.cls.is_castable(javaThis.$cls);
  }

  public static 'isAssignableFrom(Ljava/lang/Class;)Z'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject, cls: java_object.JavaClassObject): boolean {
    return cls.$cls.is_castable(javaThis.$cls);
  }

  public static 'isInterface()Z'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): boolean {
    if (!(javaThis.$cls instanceof ClassData.ReferenceClassData)) {
      return false;
    }
    return javaThis.$cls.access_flags["interface"];
  }

  public static 'isArray()Z'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): boolean {
    return javaThis.$cls instanceof ClassData.ArrayClassData;
  }

  public static 'isPrimitive()Z'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): boolean {
    return javaThis.$cls instanceof ClassData.PrimitiveClassData;
  }

  public static 'getName0()Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaObject {
    return java_object.initString(thread.getBsCl(), javaThis.$cls.toExternalString());
  }

  public static 'getClassLoader0()Ljava/lang/ClassLoader;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): ClassLoader.JavaClassLoaderObject {
    // The bootstrap classloader is represented as 'null', which is OK
    // according to the spec.
    return javaThis.$cls.loader.getLoaderObject();
  }

  public static 'getSuperclass()Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaClassObject {
    if (javaThis.$cls instanceof ClassData.PrimitiveClassData) {
      return null;
    }
    var cls = javaThis.$cls;
    if (cls.access_flags["interface"] || (cls.get_super_class() == null)) {
      return null;
    }
    return cls.get_super_class().get_class_object(thread);
  }

  public static 'getInterfaces()[Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaArray {
    var cls = javaThis.$cls;
    var ifaces = cls.get_interfaces();
    var iface_objs = ifaces.map((iface) => iface.get_class_object(thread));
    return new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/Class;'), iface_objs);
  }

  public static 'getComponentType()Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaClassObject {
    if (!(javaThis.$cls instanceof ClassData.ArrayClassData)) {
      return null;
    }
    // As this array type is loaded, the component type is guaranteed
    // to be loaded as well. No need for asynchronicity.
    return (<ClassData.ArrayClassData>javaThis.$cls).get_component_class().get_class_object(thread);
  }

  public static 'getModifiers()I'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): number {
    return javaThis.$cls.access_byte;
  }

  public static 'getSigners()[Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaArray {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'setSigners([Ljava/lang/Object;)V'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject, arg0: java_object.JavaArray): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getEnclosingMethod0()[Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaArray {
    var enc_desc: java_object.JavaObject, enc_name: java_object.JavaObject,
      bsCl = thread.getBsCl();

    if (!(javaThis.$cls instanceof ClassData.ReferenceClassData)) {
      return null;
    }
    var cls: ClassData.ReferenceClassData = <ClassData.ReferenceClassData> javaThis.$cls,
      em: attributes.EnclosingMethod = <attributes.EnclosingMethod> cls.get_attribute('EnclosingMethod');
    if (em == null) {
      return null;
    }
    var enc_cls = cls.loader.getResolvedClass(em.enc_class).get_class_object(thread);
    if (em.enc_method != null) {
      enc_name = java_object.initString(bsCl, em.enc_method.name);
      enc_desc = java_object.initString(bsCl, em.enc_method.type);
    } else {
      enc_name = null;
      enc_desc = null;
    }
    // array w/ 3 elements:
    // - the immediately enclosing class (java/lang/Class)
    // - the immediately enclosing method or constructor's name (can be null). (String)
    // - the immediately enclosing method or constructor's descriptor (null iff name is). (String)
    return new java_object.JavaArray(<ClassData.ArrayClassData> bsCl.getInitializedClass(thread, '[Ljava/lang/Object;'), [enc_cls, enc_name, enc_desc]);
  }

  public static 'getDeclaringClass0()Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaClassObject {
    var declaring_name, entry, name, _i, _len;

    if (!(javaThis.$cls instanceof ClassData.ReferenceClassData)) {
      return null;
    }
    var cls = <ClassData.ReferenceClassData> javaThis.$cls,
      icls = <attributes.InnerClasses> cls.get_attribute('InnerClasses');
    if (icls == null) {
      return null;
    }
    var my_class = cls.get_type(),
      _ref5 = icls.classes;
    for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
      entry = _ref5[_i];
      if (!(entry.outer_info_index > 0)) {
        continue;
      }
      name = cls.constant_pool.get(entry.inner_info_index).deref();
      if (name !== my_class) {
        continue;
      }
      // XXX(jez): this assumes that the first enclosing entry is also
      // the immediate enclosing parent, and I'm not 100% sure this is
      // guaranteed by the spec
      declaring_name = cls.constant_pool.get(entry.outer_info_index).deref();
      return cls.loader.getResolvedClass(declaring_name).get_class_object(thread);
    }
    return null;
  }

  public static 'getProtectionDomain0()Ljava/security/ProtectionDomain;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaObject {
    return null;
  }

  public static 'setProtectionDomain0(Ljava/security/ProtectionDomain;)V'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject, arg0: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getPrimitiveClass(Ljava/lang/String;)Ljava/lang/Class;'(thread: threading.JVMThread, jvm_str: java_object.JavaObject): java_object.JavaClassObject {
    var type_desc = util.typestr2descriptor(jvm_str.jvm2js_str()),
      prim_cls = thread.getBsCl().getInitializedClass(thread, type_desc);
    return prim_cls.get_class_object(thread);
  }

  public static 'getGenericSignature()Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaObject {
    var sigAttr = <attributes.Signature> (<ClassData.ReferenceClassData> javaThis.$cls).get_attribute('Signature');
    if (sigAttr != null && sigAttr.sig != null) {
      return java_object.initString(thread.getBsCl(), sigAttr.sig);
    } else {
      return null;
    }
  }

  public static 'getRawAnnotations()[B'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaArray {
    var cls = <ClassData.ReferenceClassData> javaThis.$cls,
      annotations = <attributes.RuntimeVisibleAnnotations> cls.get_attribute('RuntimeVisibleAnnotations');
    if (annotations != null) {
      return new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[B'), annotations.raw_bytes);
    }

    var methods = cls.get_methods();
    for (var sig in methods) {
      if (methods.hasOwnProperty(sig)) {
        var m = methods[sig];
        annotations = <attributes.RuntimeVisibleAnnotations> m.get_attribute('RuntimeVisibleAnnotations');
        if (annotations != null) {
          return new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[B'), annotations.raw_bytes);
        }
      }
    }
    return null;
  }

  public static 'getConstantPool()Lsun/reflect/ConstantPool;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): java_object.JavaObject {
    var cls = <ClassData.ReferenceClassData> javaThis.$cls;
    // @todo Make this a proper JavaObject. I don't think the JCL uses it as such,
    // but right now this function fails any automated sanity checks on return values.
    return new java_object.JavaObject(<ClassData.ReferenceClassData> thread.getBsCl().getInitializedClass(thread, 'Lsun/reflect/ConstantPool;'), {
      'Lsun/reflect/ConstantPool;constantPoolOop': cls.constant_pool
    });
  }

  public static 'getDeclaredFields0(Z)[Ljava/lang/reflect/Field;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject, public_only: number): void {
    var fields = javaThis.$cls.get_fields();
    if (public_only) {
      fields = fields.filter((f) => f.access_flags["public"]);
    }
    var base_array = [];
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    util.async_foreach(fields,
      (f, next_item) => {
        f.reflector(thread, (jco) => {
          if (jco != null) {
            base_array.push(jco);
            next_item();
          }
        });
      }, () => {
        var field_arr_cls = <ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/reflect/Field;');
        thread.asyncReturn(new java_object.JavaArray(field_arr_cls, base_array));
      });
  }

  public static 'getDeclaredMethods0(Z)[Ljava/lang/reflect/Method;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject, public_only: number): void {
    var methodsHash = javaThis.$cls.get_methods();
    var methods: methods.Method[] = (function () {
      var _results: methods.Method[] = [];
      for (var sig in methodsHash) {
        var m = methodsHash[sig];
        if (sig[0] !== '<' && (m.access_flags["public"] || !public_only)) {
          _results.push(m);
        }
      }
      return _results;
    })();
    var base_array = [];
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    util.async_foreach(methods,
      (m, next_item) => {
        m.reflector(thread, false, (jco) => {
          if (jco != null) {
            base_array.push(jco);
            next_item()
          }
        });
      }, () => {
        var method_arr_cls = <ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/reflect/Method;');
        thread.asyncReturn(new java_object.JavaArray(method_arr_cls, base_array));
      });
  }

  public static 'getDeclaredConstructors0(Z)[Ljava/lang/reflect/Constructor;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject, public_only: number): void {
    var methodsHash = javaThis.$cls.get_methods();
    var methods: methods.Method[] = (function () {
      var _results: methods.Method[] = [];
      for (var sig in methodsHash) {
        var m = methodsHash[sig];
        if (m.name === '<init>') {
          _results.push(m);
        }
      }
      return _results;
    })();
    if (public_only) {
      methods = methods.filter((m) => m.access_flags["public"]);
    }
    var ctor_array_cdata = <ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/reflect/Constructor;');
    var base_array = [];
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    util.async_foreach(methods,
      (m, next_item) => {
        m.reflector(thread, true, (jco) => {
          if (jco != null) {
            base_array.push(jco);
            next_item()
          }
        });
      }, () => {
        thread.asyncReturn(new java_object.JavaArray(ctor_array_cdata, base_array));
      });
  }

  public static 'getDeclaredClasses0()[Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaClassObject): any {
    var ret = new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/Class;'), []),
      cls = <ClassData.ReferenceClassData> javaThis.$cls;
    if (!(cls instanceof ClassData.ReferenceClassData)) {
      return ret;
    }
    var my_class = cls.get_type();
    var iclses = <attributes.InnerClasses[]> cls.get_attributes('InnerClasses');
    if (iclses.length === 0) {
      return ret;
    }
    var flat_names = [];
    for (var i = 0; i < iclses.length; i++) {
      var names = iclses[i].classes.filter((c: any) =>
        // select inner classes where the enclosing class is my_class
        c.outer_info_index > 0 && cls.constant_pool.get(c.outer_info_index).deref() === my_class)
        .map((c: any) => cls.constant_pool.get(c.inner_info_index).deref());
      flat_names.push.apply(flat_names, names);
    }
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    util.async_foreach(flat_names,
      (name: string, next_item: () => void) => {
        cls.loader.resolveClass(thread, name, (cls) => {
          if (cls != null) {
            ret.array.push(cls.get_class_object(thread));
            next_item();
          }
        });
      }, () => thread.asyncReturn(ret));
  }

  public static 'desiredAssertionStatus0(Ljava/lang/Class;)Z'(thread: threading.JVMThread, arg0: java_object.JavaClassObject): boolean {
    // we don't need no stinkin asserts
    // @todo Actually need stinkin asserts
    return false;
  }

}

class java_lang_ClassLoader$NativeLibrary {

  public static 'load(Ljava/lang/String;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'find(Ljava/lang/String;)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'unload()V'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

// Fun Note: The bootstrap classloader object is represented by null.
class java_lang_ClassLoader {

  public static 'defineClass0(Ljava/lang/String;[BIILjava/security/ProtectionDomain;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: ClassLoader.JavaClassLoaderObject, arg0: java_object.JavaObject, arg1: java_object.JavaArray, arg2: number, arg3: number, arg4: java_object.JavaObject): java_object.JavaClassObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'defineClass1(Ljava/lang/String;[BIILjava/security/ProtectionDomain;Ljava/lang/String;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: ClassLoader.JavaClassLoaderObject, name: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number, pd: gLong, source: java_object.JavaObject): java_object.JavaClassObject {
    var loader = java_object.get_cl_from_jclo(thread, javaThis),
      type = util.int_classname(name.jvm2js_str()),
      cls = loader.defineClass(thread, type, util.byteArray2Buffer(bytes.array, offset, len));
    if (cls == null) {
      return null;
    }
    // Ensure that this class is resolved.
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    loader.resolveClass(thread, type, () => {
      thread.asyncReturn(cls.get_class_object(thread));
    }, true);
  }

  public static 'defineClass2(Ljava/lang/String;Ljava/nio/ByteBuffer;IILjava/security/ProtectionDomain;Ljava/lang/String;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: ClassLoader.JavaClassLoaderObject, arg0: java_object.JavaObject, arg1: java_object.JavaObject, arg2: number, arg3: number, arg4: java_object.JavaObject, arg5: java_object.JavaObject): java_object.JavaClassObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'resolveClass0(Ljava/lang/Class;)V'(thread: threading.JVMThread, javaThis: ClassLoader.JavaClassLoaderObject, cls: java_object.JavaClassObject): void {
    var loader = java_object.get_cl_from_jclo(thread, javaThis),
      type = cls.$cls.get_type();
    if (loader.getResolvedClass(type) != null) {
      return;
    }
    // Ensure that this class is resolved.
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    loader.resolveClass(thread, type, () => {
      thread.asyncReturn();
    }, true);
  }

  public static 'findBootstrapClass(Ljava/lang/String;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: ClassLoader.JavaClassLoaderObject, name: java_object.JavaObject): void {
    var type = util.int_classname(name.jvm2js_str());
    // This returns null in OpenJDK7, but actually can throw an exception
    // in OpenJDK6.
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    thread.getBsCl().resolveClass(thread, type, (cls) => {
      if (cls != null) {
        thread.asyncReturn(cls.get_class_object(thread));
      }
    }, true);
  }

  public static 'findLoadedClass0(Ljava/lang/String;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: ClassLoader.JavaClassLoaderObject, name: java_object.JavaObject): java_object.JavaClassObject {
    var loader = java_object.get_cl_from_jclo(thread, javaThis),
      type = util.int_classname(name.jvm2js_str()),
      // Return JavaClassObject if loaded, or null otherwise.
      cls = loader.getResolvedClass(type);
    if (cls != null) {
      return cls.get_class_object(thread);
    } else {
      return null;
    }
  }

  public static 'retrieveDirectives()Ljava/lang/AssertionStatusDirectives;'(thread: threading.JVMThread): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class java_lang_Compiler {

  public static 'initialize()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'registerNatives()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'compileClass(Ljava/lang/Class;)Z'(thread: threading.JVMThread, arg0: java_object.JavaClassObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'compileClasses(Ljava/lang/String;)Z'(thread: threading.JVMThread, arg0: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'command(Ljava/lang/Object;)Ljava/lang/Object;'(thread: threading.JVMThread, arg0: java_object.JavaObject): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  // NOP'd.
  public static 'enable()V'(thread: threading.JVMThread): void {}
  public static 'disable()V'(thread: threading.JVMThread): void {}

}

// Used for converting between numerical representations.
var conversionBuffer = new Buffer(8);

class java_lang_Double {

  public static 'doubleToRawLongBits(D)J'(thread: threading.JVMThread, num: number): gLong {
    conversionBuffer.writeDoubleLE(num, 0);
    return gLong.fromBits(conversionBuffer.readUInt32LE(0), conversionBuffer.readUInt32LE(4));
  }

  public static 'longBitsToDouble(J)D'(thread: threading.JVMThread, num: gLong): number {
    conversionBuffer.writeInt32LE(num.getLowBits(), 0);
    conversionBuffer.writeInt32LE(num.getHighBits(), 4);
    return conversionBuffer.readDoubleLE(0);
  }

}

class java_lang_Float {

  public static 'floatToRawIntBits(F)I'(thread: threading.JVMThread, num: number): number {
    conversionBuffer.writeFloatLE(num, 0);
    return conversionBuffer.readInt32LE(0);
  }

  public static 'intBitsToFloat(I)F'(thread: threading.JVMThread, num: number): number {
    conversionBuffer.writeInt32LE(num, 0);
    return conversionBuffer.readFloatLE(0);
  }

}

class java_lang_Object {

  public static 'getClass()Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaObject): java_object.JavaClassObject {
    return javaThis.cls.get_class_object(thread);
  }

  public static 'hashCode()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    return javaThis.ref;
  }

  public static 'clone()Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: java_object.JavaObject): java_object.JavaObject {
    return javaThis.clone();
  }

  public static 'notify()V'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    debug("TE(notify): on lock *" + javaThis.ref);
    javaThis.getMonitor().notify(thread);
  }

  public static 'notifyAll()V'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    debug("TE(notifyAll): on lock *" + javaThis.ref);
    javaThis.getMonitor().notifyAll(thread);
  }

  public static 'wait(J)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, timeout: gLong): void {
    debug("TE(wait): on lock *" + javaThis.ref);
    javaThis.getMonitor().wait(thread, (fromTimer: boolean) => {
      thread.asyncReturn();
    }, timeout.toNumber());
  }

}

class java_lang_Package {

  public static 'getSystemPackage0(Ljava/lang/String;)Ljava/lang/String;'(thread: threading.JVMThread, pkg_name_obj: java_object.JavaObject): java_object.JavaObject {
    var pkg_name = pkg_name_obj.jvm2js_str();
    if (thread.getBsCl().getPackageNames().indexOf(pkg_name) >= 0) {
      return pkg_name_obj;
    } else {
      return null;
    }
  }

  public static 'getSystemPackages0()[Ljava/lang/String;'(thread: threading.JVMThread): java_object.JavaArray {
    return new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/String;'), (() => {
      var pkgNames = thread.getBsCl().getPackageNames(), i: number,
        results: java_object.JavaObject[] = [];
      for (i = 0; i < pkgNames.length; i++) {
        results.push(java_object.initString(thread.getBsCl(), pkgNames[i]));
      }
      return results;
    })());
  }

}

class java_lang_ProcessEnvironment {

  public static 'environ()[[B'(thread: threading.JVMThread): java_object.JavaArray {
    var env_arr: java_object.JavaArray[] = [], env = process.env,
      key: string, v: string;
    // convert to an array of strings of the form [key, value, key, value ...]
    for (key in env) {
      v = env[key];
      env_arr.push(new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[B'), util.bytestr_to_array(key)));
      env_arr.push(new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[B'), util.bytestr_to_array(v)));
    }
    return new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[[B'), env_arr);
  }

}

class java_lang_ref_Finalizer {

  public static 'invokeFinalizeMethod(Ljava/lang/Object;)V'(thread: threading.JVMThread, arg0: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_lang_reflect_Array {

  public static 'getLength(Ljava/lang/Object;)I'(thread: threading.JVMThread, arr: java_object.JavaArray): number {
    if (verify_array(thread, arr)) {
      if (isNotNull(thread, arr)) {
        return arr.array.length;
      }
    }
  }

  public static 'get(Ljava/lang/Object;I)Ljava/lang/Object;'(thread: threading.JVMThread, arr: java_object.JavaArray, idx: number): java_object.JavaObject {
    var val = array_get(thread, arr, idx);
    if (val != null) {
      // Box primitive values (fast check: prims don't have .ref attributes).
      if (val.ref == null) {
        return (<ClassData.PrimitiveClassData> arr.cls.get_component_class()).create_wrapper_object(thread, val);
      }
    }
    return val;
  }

  public static 'getBoolean(Ljava/lang/Object;I)Z': (thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getByte(Ljava/lang/Object;I)B': (thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getChar(Ljava/lang/Object;I)C': (thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getShort(Ljava/lang/Object;I)S': (thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getInt(Ljava/lang/Object;I)I': (thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getLong(Ljava/lang/Object;I)J': (thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number) => gLong = array_get;
  public static 'getFloat(Ljava/lang/Object;I)F': (thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getDouble(Ljava/lang/Object;I)D': (thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number) => number = array_get;

  public static 'set(Ljava/lang/Object;ILjava/lang/Object;)V'(thread: threading.JVMThread, arr: java_object.JavaArray, idx: number, val: java_object.JavaObject): void {
    if (verify_array(thread, arr) && isNotNull(thread, arr)) {
      if (idx < 0 || idx >= arr.array.length) {
        thread.throwNewException('Ljava/lang/ArrayIndexOutOfBoundsException;', 'Tried to write to an illegal index in an array.');
      } else {
        var ccls = arr.cls.get_component_class();
        if (ccls instanceof ClassData.PrimitiveClassData) {
          if (val.cls.is_subclass(thread.getBsCl().getInitializedClass(thread, (<ClassData.PrimitiveClassData> ccls).box_class_name()))) {
            var ccname = ccls.get_type(),
              m = val.cls.method_lookup(thread, "" + util.internal2external[ccname] + "Value()" + ccname);
            thread.runMethod(m, [val], (e?, rv?) => {
              if (e) {
                thread.throwException(e);
              } else {
                arr.array[idx] = rv;
                thread.asyncReturn();
              }
            });
          } else {
            thread.throwNewException('Ljava/lang/IllegalArgumentException;', 'argument type mismatch');
          }
        } else if (val.cls.is_subclass(ccls)) {
          arr.array[idx] = val;
        } else {
          thread.throwNewException('Ljava/lang/IllegalArgumentException;', 'argument type mismatch');
        }
      }
    }
  }

  public static 'setBoolean(Ljava/lang/Object;IZ)V'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setByte(Ljava/lang/Object;IB)V'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setChar(Ljava/lang/Object;IC)V'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setShort(Ljava/lang/Object;IS)V'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setInt(Ljava/lang/Object;II)V'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setLong(Ljava/lang/Object;IJ)V'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: number, arg2: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setFloat(Ljava/lang/Object;IF)V'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setDouble(Ljava/lang/Object;ID)V'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'newArray(Ljava/lang/Class;I)Ljava/lang/Object;'(thread: threading.JVMThread, cls: java_object.JavaClassObject, len: number): java_object.JavaArray {
    return java_object.heapNewArray(thread, cls.$cls.loader, cls.$cls.get_type(), len);
  }

  public static 'multiNewArray(Ljava/lang/Class;[I)Ljava/lang/Object;'(thread: threading.JVMThread, jco: java_object.JavaClassObject, lens: java_object.JavaArray): java_object.JavaArray {
    var counts = lens.array;
    var cls = jco.$cls.loader.getInitializedClass(thread, jco.$cls.get_type());
    if (cls == null) {
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      jco.$cls.loader.initializeClass(thread, jco.$cls.get_type(), (cls) => {
        var type_str = (new Array(counts.length + 1)).join('[') + cls.get_type();
        thread.asyncReturn(java_object.heapMultiNewArray(thread, jco.$cls.loader, type_str, counts));
      });
    } else {
      var type_str = (new Array(counts.length + 1)).join('[') + cls.get_type();
      return java_object.heapMultiNewArray(thread, jco.$cls.loader, type_str, counts);
    }
  }

}

class java_lang_reflect_Proxy {

  public static 'defineClass0(Ljava/lang/ClassLoader;Ljava/lang/String;[BII)Ljava/lang/Class;'(thread: threading.JVMThread, cl: ClassLoader.JavaClassLoaderObject, name: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number): java_object.JavaClassObject {
    var loader = java_object.get_cl_from_jclo(thread, cl),
      cls = loader.defineClass(thread, util.int_classname(name.jvm2js_str()), util.byteArray2Buffer(bytes.array, offset, len));
    if (cls != null) {
      return cls.get_class_object(thread);
    }
  }

}

class java_lang_Runtime {

  public static 'availableProcessors()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    return 1;
  }

  public static 'freeMemory()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'totalMemory()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  /**
   * Returns the maximum amount of memory that the Java Virtual Machine will
   * attempt to use, in bytes, as a Long. If there is no inherent limit then the
   * value Long.MAX_VALUE will be returned.
   *
   * Currently returns Long.MAX_VALUE because unlike other JVMs Doppio has no
   * hard limit on the heap size.
   */
  public static 'maxMemory()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    debug("Warning: maxMemory has no meaningful value in Doppio -- there is no hard memory limit.");
    return gLong.MAX_VALUE;
  }

  /**
   * No universal way of forcing browser to GC, so we yield in hopes
   * that the browser will use it as an opportunity to GC.
   */
  public static 'gc()V'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    setImmediate(() => {
      thread.asyncReturn();
    });
  }

  public static 'runFinalization0()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'traceInstructions(Z)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'traceMethodCalls(Z)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_lang_SecurityManager {

  public static 'getClassContext()[Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaObject): java_object.JavaArray {
    // return an array of classes for each method on the stack
    // starting with the current method and going up the call chain
    var classes: java_object.JavaClassObject[] = [],
      stack = thread.getStackTrace(),
      i: number;
    for (i = stack.length - 1; i >= 0; i--) {
      var sf = stack[i];
      classes.push(sf.method.cls.get_class_object(thread));
    }
    return new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/Class;'), classes);
  }

  public static 'currentClassLoader0()Ljava/lang/ClassLoader;'(thread: threading.JVMThread, javaThis: java_object.JavaObject): ClassLoader.JavaClassLoaderObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'classDepth(Ljava/lang/String;)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'classLoaderDepth0()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'currentLoadedClass0()Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaObject): java_object.JavaClassObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class java_lang_Shutdown {

  public static 'halt0(I)V'(thread: threading.JVMThread, status: number): void {
    // @todo Actually add a mechanism to abort with a code.
    thread.getThreadPool().getJVM().abort();
  }

  public static 'runAllFinalizers()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_lang_StrictMath {

  public static 'sin(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.sin(d_val);
  }

  public static 'cos(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.cos(d_val);
  }

  public static 'tan(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.tan(d_val);
  }

  public static 'asin(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.asin(d_val);
  }

  public static 'acos(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.acos(d_val);
  }

  public static 'atan(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.atan(d_val);
  }

  public static 'exp(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.exp(d_val);
  }

  public static 'log(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.log(d_val);
  }

  public static 'log10(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.log(d_val) / Math.LN10;
  }

  public static 'sqrt(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.sqrt(d_val);
  }

  public static 'cbrt(D)D'(thread: threading.JVMThread, d_val: number): number {
    var is_neg = d_val < 0;
    if (is_neg) {
      return -Math.pow(-d_val, 1 / 3);
    } else {
      return Math.pow(d_val, 1 / 3);
    }
  }

  public static 'IEEEremainder(DD)D'(thread: threading.JVMThread, arg0: number, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'ceil(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.ceil(d_val);
  }

  public static 'floor(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.floor(d_val);
  }

  public static 'atan2(DD)D'(thread: threading.JVMThread, y: number, x: number): number {
    return Math.atan2(y, x);
  }

  public static 'pow(DD)D'(thread: threading.JVMThread, base: number, exp: number): number {
    return Math.pow(base, exp);
  }

  public static 'sinh(D)D'(thread: threading.JVMThread, d_val: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'cosh(D)D'(thread: threading.JVMThread, d_val: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'tanh(D)D'(thread: threading.JVMThread, d_val: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'hypot(DD)D'(thread: threading.JVMThread, arg0: number, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'expm1(D)D'(thread: threading.JVMThread, d_val: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'log1p(D)D'(thread: threading.JVMThread, d_val: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

}

class java_lang_String {

  public static 'intern()Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaObject): java_object.JavaObject {
    return thread.getThreadPool().getJVM().internString(javaThis.jvm2js_str(), javaThis);
  }

}

class java_lang_System {

  public static 'setIn0(Ljava/io/InputStream;)V'(thread: threading.JVMThread, stream: java_object.JavaObject): void {
    var sys = <ClassData.ReferenceClassData> thread.getBsCl().getInitializedClass(thread, 'Ljava/lang/System;');
    sys.static_put(thread, 'in', stream);
  }

  public static 'setOut0(Ljava/io/PrintStream;)V'(thread: threading.JVMThread, stream: java_object.JavaObject): void {
    var sys = <ClassData.ReferenceClassData> thread.getBsCl().getInitializedClass(thread, 'Ljava/lang/System;');
    sys.static_put(thread, 'out', stream);
  }

  public static 'setErr0(Ljava/io/PrintStream;)V'(thread: threading.JVMThread, stream: java_object.JavaObject): void {
    var sys = <ClassData.ReferenceClassData> thread.getBsCl().getInitializedClass(thread, 'Ljava/lang/System;');
    sys.static_put(thread, 'err', stream);
  }

  public static 'currentTimeMillis()J'(thread: threading.JVMThread): gLong {
    return gLong.fromNumber((new Date).getTime());
  }

  /**
   * @todo Use performance.now() if available.
   */
  public static 'nanoTime()J'(thread: threading.JVMThread): gLong {
    return gLong.fromNumber((new Date).getTime()).multiply(gLong.fromNumber(1000000));
  }

  public static 'arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V'(thread: threading.JVMThread, src: java_object.JavaArray, src_pos: number, dest: java_object.JavaArray, dest_pos: number, length: number): void {
    var dest_comp_cls, src_comp_cls;
    // Needs to be checked *even if length is 0*.
    if ((src == null) || (dest == null)) {
      thread.throwNewException('Ljava/lang/NullPointerException;', 'Cannot copy to/from a null array.');
    }
    // Can't do this on non-array types. Need to check before I check bounds below, or else I'll get an exception.
    else if (!(src.cls instanceof ClassData.ArrayClassData) || !(dest.cls instanceof ClassData.ArrayClassData)) {
      thread.throwNewException('Ljava/lang/ArrayStoreException;', 'src and dest arguments must be of array type.');
    }
    // Also needs to be checked *even if length is 0*.
    else if (src_pos < 0 || (src_pos + length) > src.array.length || dest_pos < 0 || (dest_pos + length) > dest.array.length || length < 0) {
      // System.arraycopy requires IndexOutOfBoundsException, but Java throws an array variant of the exception in practice.
      thread.throwNewException('Ljava/lang/ArrayIndexOutOfBoundsException;', 'Tried to write to an illegal index in an array.');
    } else {
      // Special case; need to copy the section of src that is being copied into a temporary array before actually doing the copy.
      if (src === dest) {
        src = <any> {
          cls: src.cls,
          array: src.array.slice(src_pos, src_pos + length)
        };
        src_pos = 0;
      }
      if (src.cls.is_castable(dest.cls)) {
        // Fast path
        java_object.arraycopy_no_check(src, src_pos, dest, dest_pos, length);
      } else {
        // Slow path
        // Absolutely cannot do this when two different primitive types, or a primitive type and a reference type.
        src_comp_cls = src.cls.get_component_class();
        dest_comp_cls = dest.cls.get_component_class();
        if ((src_comp_cls instanceof ClassData.PrimitiveClassData) || (dest_comp_cls instanceof ClassData.PrimitiveClassData)) {
          thread.throwNewException('Ljava/lang/ArrayStoreException;', 'If calling arraycopy with a primitive array, both src and dest must be of the same primitive type.');
        } else {
          // Must be two reference types.
          java_object.arraycopy_check(thread, src, src_pos, dest, dest_pos, length);
        }
      }
    }
  }

  public static 'identityHashCode(Ljava/lang/Object;)I'(thread: threading.JVMThread, x: java_object.JavaObject): number {
    if (x != null && x.ref != null) {
      return x.ref;
    }
    return 0;
  }

  /**
   * @todo Store our system properties in a proper JVM hashMap, as is expected.
   */
  public static 'initProperties(Ljava/util/Properties;)Ljava/util/Properties;'(thread: threading.JVMThread, arg0: java_object.JavaObject): void {
    return null;
  }

  public static 'mapLibraryName(Ljava/lang/String;)Ljava/lang/String;'(thread: threading.JVMThread, arg0: java_object.JavaObject): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class java_lang_Thread {

  public static 'currentThread()Ljava/lang/Thread;'(thread: threading.JVMThread): java_object.JavaObject {
    return thread;
  }

  public static 'yield()V'(thread: threading.JVMThread): void {
    // Force the thread scheduler to pick another thread by waiting for a short
    // amount of time.
    // @todo Build this into the scheduler?
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    setImmediate(() => {
      thread.setStatus(enums.ThreadStatus.RUNNABLE);
      thread.asyncReturn();
    });
  }

  public static 'sleep(J)V'(thread: threading.JVMThread, millis: gLong): void {
    var beforeMethod = thread.currentMethod();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    setTimeout(() => {
      // Check if the thread was interrupted during our sleep. Interrupting
      // sleep causes an exception, so we need to ignore the setTimeout
      // callback in this case.
      if (beforeMethod === thread.currentMethod()) {
        thread.setStatus(enums.ThreadStatus.RUNNABLE);
        thread.asyncReturn();
      }
    }, millis.toNumber());
  }

  public static 'start0()V'(thread: threading.JVMThread, javaThis: threading.JVMThread): void {
    var runMethod = javaThis.cls.method_lookup(thread, 'run()V');
    if (runMethod != null) {
      javaThis.runMethod(runMethod, [javaThis]);
    }
  }

  public static 'isInterrupted(Z)Z'(thread: threading.JVMThread, javaThis: threading.JVMThread, clearFlag: number): boolean {
    var isInterrupted = javaThis.isInterrupted();
    if (clearFlag) {
      javaThis.setInterrupted(false);
    }
    return isInterrupted;
  }

  public static 'isAlive()Z'(thread: threading.JVMThread, javaThis: threading.JVMThread): boolean {
    var state = javaThis.getStatus();
    return state !== enums.ThreadStatus.TERMINATED && state !== enums.ThreadStatus.NEW;
  }

  public static 'countStackFrames()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    return thread.getStackTrace().length;
  }

  public static 'holdsLock(Ljava/lang/Object;)Z'(thread: threading.JVMThread, obj: java_object.JavaObject): boolean {
    var mon = obj.getMonitor();
    return mon.getOwner() === thread;
  }

  public static 'dumpThreads([Ljava/lang/Thread;)[[Ljava/lang/StackTraceElement;'(thread: threading.JVMThread, arg0: java_object.JavaArray): java_object.JavaArray {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getThreads()[Ljava/lang/Thread;'(thread: threading.JVMThread): java_object.JavaArray {
    return new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/Thread;'), thread.getThreadPool().getThreads());
  }

  public static 'setPriority0(I)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: number): void {
    // NOP
  }

  public static 'stop0(Ljava/lang/Object;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'suspend0()V'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'resume0()V'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  /**
   * Interrupts this thread.
   *
   * Unless the current thread is interrupting itself, which is always
   * permitted, the checkAccess method of this thread is invoked, which may
   * cause a SecurityException to be thrown.
   *
   * - If this thread is blocked in an invocation of the Object.wait(),
   *   wait(long), or Object.wait(long,int) methods of the Object class, or of
   *   the join(), join(long), join(long,int), sleep(long), or sleep(long,int),
   *   methods of this class, then its interrupt status will be cleared and it
   *   will receive an InterruptedException.
   *
   * - If this thread is blocked in an I/O operation upon an
   *   java.nio.channels.InterruptibleChannel then the channel will be closed,
   *   the thread's interrupt status will be set, and the thread will receive a
   *   java.nio.channels.ClosedByInterruptException.
   *
   * - If this thread is blocked in a java.nio.channels.Selector then the
   *   thread's interrupt status will be set and it will return immediately from
   *   the selection operation, possibly with a non-zero value, just as if the
   *   selector's java.nio.channels.Selector.wakeup() method were invoked.
   *
   * - If none of the previous conditions hold then this thread's interrupt
   *   status will be set.
   *
   * Interrupting a thread that is not alive need not have any effect.
   */
  public static 'interrupt0()V'(thread: threading.JVMThread, javaThis: threading.JVMThread): void {
    function throwInterruptedException() {
      javaThis.throwNewException('Ljava/lang/InterruptedException;', 'interrupt0 called');
    }

    // See if we have access to modify this thread.
    var checkAccessMethod = javaThis.cls.method_lookup(thread, 'checkAccess()V');
    if (checkAccessMethod != null) {
      thread.runMethod(checkAccessMethod, [javaThis], (e?, rv?) => {
        if (e) {
          // SecurityException. Rethrow it.
          thread.throwException(e);
        } else {
          // Check if thread is alive.
          var status = javaThis.getStatus();
          switch (status) {
            case enums.ThreadStatus.NEW:
            case enums.ThreadStatus.TERMINATED:
              // Thread is not alive. NOP.
              return thread.asyncReturn();
            case enums.ThreadStatus.BLOCKED:
            case enums.ThreadStatus.WAITING:
            case enums.ThreadStatus.TIMED_WAITING:
              // Thread is waiting or blocked on a monitor. Clear interrupted
              // status, and throw an interrupted exception.
              javaThis.setInterrupted(false);
              // Exit the monitor.
              var monitor = javaThis.getMonitorBlock();
              if (status === enums.ThreadStatus.BLOCKED) {
                monitor.unblock(javaThis, true);
                throwInterruptedException();
              } else {
                monitor.unwait(javaThis, false, true, throwInterruptedException);
              }
              return thread.asyncReturn();
            case enums.ThreadStatus.PARKED:
              // Parked threads become unparked when interrupted.
              javaThis.getThreadPool().completelyUnpark(javaThis);
              // FALL-THROUGH
            default:
              var threadCls = thread.getBsCl().getInitializedClass(thread, 'Ljava/lang/Thread;'),
                // If we are in the following methods, we throw an InterruptedException:
                interruptMethods: methods.Method[] = [
                  threadCls.method_lookup(thread, 'join()V'),   // * Thread.join()
                  threadCls.method_lookup(thread, 'join(J)V'),  // * Thread.join(long)
                  threadCls.method_lookup(thread, 'join(JI)V'), // * Thread.join(long, int)
                  threadCls.method_lookup(thread, 'sleep(J)V'), // * Thread.sleep(long)
                  threadCls.method_lookup(thread, 'sleep(JI)V') // * Thread.sleep(long, int)
                ],
                stackTrace = javaThis.getStackTrace(),
                currentMethod = stackTrace[stackTrace.length - 1].method;
              if (interruptMethods.indexOf(currentMethod) !== -1) {
                // Clear interrupt state before throwing the exception.
                javaThis.setInterrupted(false);
                javaThis.throwNewException('Ljava/lang/InterruptedException;', 'interrupt0 called');
              } else {
                // Set the interrupted status.
                javaThis.setInterrupted(true);
              }
              return thread.asyncReturn();
          }
        }
      });
    }
  }

}

/**
 * @todo Don't create a stack trace every time an element is created. Use the
 * field in the object.
 */
class java_lang_Throwable {

  public static 'fillInStackTrace()Ljava/lang/Throwable;'(thread: threading.JVMThread, javaThis: java_object.JavaObject): java_object.JavaObject {
    var strace = new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/StackTraceElement;'), create_stack_trace(thread, javaThis));
    javaThis.set_field(thread, 'Ljava/lang/Throwable;stackTrace', strace);
    return javaThis;
  }

  public static 'getStackTraceDepth()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    return create_stack_trace(thread, javaThis).length;
  }

  public static 'getStackTraceElement(I)Ljava/lang/StackTraceElement;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, depth: number): java_object.JavaObject {
    return create_stack_trace(thread, javaThis)[depth];
  }

}

class java_lang_UNIXProcess {

  public static 'waitForProcessExit(I)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'forkAndExec([B[BI[BI[BZLjava/io/FileDescriptor;Ljava/io/FileDescriptor;Ljava/io/FileDescriptor;)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, prog: java_object.JavaArray, argBlock: java_object.JavaArray, arg2: number, arg3: java_object.JavaArray, arg4: number, arg5: java_object.JavaArray, arg6: number, arg7: java_object.JavaObject, arg8: java_object.JavaObject, arg9: java_object.JavaObject): void {
    var progname = util.chars2js_str(prog, 0, prog.array.length),
      args = util.chars2js_str(argBlock, 0, argBlock.array.length);
    thread.throwNewException('Ljava/lang/Error;', "Doppio doesn't support forking processes. Command was: `" + progname + " " + args + "`");
  }

  public static 'destroyProcess(I)V'(thread: threading.JVMThread, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'initIDs()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

registerNatives({
  'java/lang/Class': java_lang_Class,
  'java/lang/ClassLoader$NativeLibrary': java_lang_ClassLoader$NativeLibrary,
  'java/lang/ClassLoader': java_lang_ClassLoader,
  'java/lang/Compiler': java_lang_Compiler,
  'java/lang/Double': java_lang_Double,
  'java/lang/Float': java_lang_Float,
  'java/lang/Object': java_lang_Object,
  'java/lang/Package': java_lang_Package,
  'java/lang/ProcessEnvironment': java_lang_ProcessEnvironment,
  'java/lang/ref/Finalizer': java_lang_ref_Finalizer,
  'java/lang/reflect/Array': java_lang_reflect_Array,
  'java/lang/reflect/Proxy': java_lang_reflect_Proxy,
  'java/lang/Runtime': java_lang_Runtime,
  'java/lang/SecurityManager': java_lang_SecurityManager,
  'java/lang/Shutdown': java_lang_Shutdown,
  'java/lang/StrictMath': java_lang_StrictMath,
  'java/lang/String': java_lang_String,
  'java/lang/System': java_lang_System,
  'java/lang/Thread': java_lang_Thread,
  'java/lang/Throwable': java_lang_Throwable,
  'java/lang/UNIXProcess': java_lang_UNIXProcess
});
