import attributes = require("../../build/dev-cli/src/attributes");
import ClassData = require("../../build/dev-cli/src/ClassData");
import ClassLoader = require("../../build/dev-cli/src/ClassLoader");
import ConstantPool = require("../../build/dev-cli/src/ConstantPool");
import difflib = require("../../build/dev-cli/src/difflib");
import disassembler = require("../../build/dev-cli/src/disassembler");
import doppio = require("../../build/dev-cli/src/doppio");
import enums = require("../../build/dev-cli/src/enums");
import exceptions = require("../../build/dev-cli/src/exceptions");
import gLong = require("../../build/dev-cli/src/gLong");
import jar = require("../../build/dev-cli/src/jar");
import java_cli = require("../../build/dev-cli/src/java_cli");
import java_object = require("../../build/dev-cli/src/java_object");
import jvm = require("../../build/dev-cli/src/jvm");
import logging = require("../../build/dev-cli/src/logging");
import methods = require("../../build/dev-cli/src/methods");
import natives = require("../../build/dev-cli/src/natives");
import opcodes = require("../../build/dev-cli/src/opcodes");
import option_parser = require("../../build/dev-cli/src/option_parser");
import runtime = require("../../build/dev-cli/src/runtime");
import testing = require("../../build/dev-cli/src/testing");
import threading = require("../../build/dev-cli/src/threading");
import util = require("../../build/dev-cli/src/util");

function array_get(rs: runtime.RuntimeState, arr: java_object.JavaArray, idx: number): any {
  var array = rs.check_null(arr).array;
  if (!((0 <= idx && idx < array.length))) {
    var err_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;');
    rs.java_throw(err_cls, 'Tried to access an illegal index in an array.');
  }
  return array[idx];
}

function verify_array(rs: runtime.RuntimeState, obj: java_object.JavaObject): java_object.JavaArray {
  if (!(obj instanceof java_object.JavaArray)) {
    var err_cls = <ClassData.ReferenceClassData> this.get_bs_class('Ljava/lang/IllegalArgumentException;');
    this.java_throw(err_cls, 'Object is not an array.');
  }
  return <java_object.JavaArray><any> obj;
}

// helper function for stack trace natives (see java/lang/Throwable)
function create_stack_trace(rs: runtime.RuntimeState, throwable: java_object.JavaObject): java_object.JavaObject[] {
  var source_file, _ref8;

  // we don't want to include the stack frames that were created by
  // the construction of this exception
  var stacktrace = [];
  var cstack = rs.meta_stack()._cs.slice(1, -1);
  for (var i = 0; i < cstack.length; i++) {
    var sf = cstack[i];
    if (!(!(sf["native"] || sf.locals[0] === throwable))) {
      continue;
    }
    var cls = sf.method.cls;
    var ln = -1;
    if (throwable.cls.get_type() !== 'Ljava/lang/NoClassDefFoundError;') {
      if (sf.method.access_flags["native"]) {
        source_file = 'Native Method';
      } else {
        var src_attr = <attributes.SourceFile> cls.get_attribute('SourceFile');
        source_file = (src_attr != null) ? src_attr.filename : 'unknown';
        var code = sf.method.code;
        var table;
        if (code != null) {
          table = code.get_attribute('LineNumberTable');
        }
        if (table == null) {
          break;
        }
        // get the last line number before the stack frame's pc
        for (var k in table.entries) {
          var row = table.entries[k];
          if (row.start_pc <= sf.pc) {
            ln = row.line_number;
          }
        }
      }
    } else {
      source_file = 'unknown';
    }
    stacktrace.push(new java_object.JavaObject(rs, (<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/StackTraceElement;')), {
      'Ljava/lang/StackTraceElement;declaringClass': rs.init_string(util.ext_classname(cls.get_type())),
      'Ljava/lang/StackTraceElement;methodName': rs.init_string((_ref8 = sf.method.name) != null ? _ref8 : 'unknown'),
      'Ljava/lang/StackTraceElement;fileName': rs.init_string(source_file),
      'Ljava/lang/StackTraceElement;lineNumber': ln
    }));
  }
  return stacktrace.reverse();
}

function get_property(rs: runtime.RuntimeState, jvm_key: java_object.JavaObject, _default: java_object.JavaObject = null): java_object.JavaObject {
  var key = jvm_key.jvm2js_str();
  var val = rs.jvm_state.system_properties[key];
  // special case
  if (key === 'java.class.path') {
    // the first path is actually the bootclasspath (vendor/classes/)
    return rs.init_string(val.slice(1, val.length).join(':'));
  }
  if (val != null) {
    return rs.init_string(val, true);
  } else {
    return _default;
  }
}

class java_lang_Class {

  public static 'forName0(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;'(rs: runtime.RuntimeState, jvm_str: java_object.JavaObject, initialize: number, jclo: java_object.JavaClassLoaderObject): void {
    var classname = util.int_classname(jvm_str.jvm2js_str());
    if (!util.verify_int_classname(classname)) {
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ClassNotFoundException;'), classname);
    }
    var loader = java_object.get_cl_from_jclo(rs, jclo);
    rs.async_op(function (resume_cb, except_cb) {
      if (initialize) {
        return loader.initialize_class(rs, classname, ((cls) => {
          return resume_cb(cls.get_class_object(rs));
        }), except_cb, true);
      } else {
        return loader.resolve_class(rs, classname, ((cls) => {
          return resume_cb(cls.get_class_object(rs));
        }), except_cb, true);
      }
    });
  }

  public static 'isInstance(Ljava/lang/Object;)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject, obj: java_object.JavaObject): boolean {
    return obj.cls.is_castable(javaThis.$cls);
  }

  public static 'isAssignableFrom(Ljava/lang/Class;)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject, cls: java_object.JavaClassObject): boolean {
    return cls.$cls.is_castable(javaThis.$cls);
  }

  public static 'isInterface()Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): boolean {
    if (!(javaThis.$cls instanceof ClassData.ReferenceClassData)) {
      return false;
    }
    return javaThis.$cls.access_flags["interface"];
  }

  public static 'isArray()Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): boolean {
    return javaThis.$cls instanceof ClassData.ArrayClassData;
  }

  public static 'isPrimitive()Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): boolean {
    return javaThis.$cls instanceof ClassData.PrimitiveClassData;
  }

  public static 'getName0()Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaObject {
    return rs.init_string(javaThis.$cls.toExternalString());
  }

  public static 'getClassLoader0()Ljava/lang/ClassLoader;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaClassLoaderObject {
    // The bootstrap classloader is represented as 'null', which is OK
    // according to the spec.
    var loader = javaThis.$cls.loader;
    if ((<any>loader).loader_obj != null) {
      return (<any>loader).loader_obj;
    }
    return null;
  }

  public static 'getSuperclass()Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaClassObject {
    if (javaThis.$cls instanceof ClassData.PrimitiveClassData) {
      return null;
    }
    var cls = javaThis.$cls;
    if (cls.access_flags["interface"] || (cls.get_super_class() == null)) {
      return null;
    }
    return cls.get_super_class().get_class_object(rs);
  }

  public static 'getInterfaces()[Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaArray {
    var cls = javaThis.$cls;
    var ifaces = cls.get_interfaces();
    var iface_objs = ifaces.map((iface) => iface.get_class_object(rs));
    return new java_object.JavaArray(rs, <ClassData.ArrayClassData> rs.get_bs_class('[Ljava/lang/Class;'), iface_objs);
  }

  public static 'getComponentType()Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaClassObject {
    if (!(javaThis.$cls instanceof ClassData.ArrayClassData)) {
      return null;
    }
    // As this array type is loaded, the component type is guaranteed
    // to be loaded as well. No need for asynchronicity.
    return (<ClassData.ArrayClassData>javaThis.$cls).get_component_class().get_class_object(rs);
  }

  public static 'getModifiers()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): number {
    return (<ClassData.ReferenceClassData> javaThis.$cls).access_byte;
  }

  public static 'getSigners()[Ljava/lang/Object;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaArray {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'setSigners([Ljava/lang/Object;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject, arg0: java_object.JavaArray): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getEnclosingMethod0()[Ljava/lang/Object;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaArray {
    var enc_desc, enc_name;
    
    if (!(javaThis.$cls instanceof ClassData.ReferenceClassData)) {
      return null;
    }
    var cls: ClassData.ReferenceClassData = <ClassData.ReferenceClassData> javaThis.$cls,
      em: attributes.EnclosingMethod = <attributes.EnclosingMethod> cls.get_attribute('EnclosingMethod');
    if (em == null) {
      return null;
    }
    var enc_cls = cls.loader.get_resolved_class(em.enc_class).get_class_object(rs);
    if (em.enc_method != null) {
      enc_name = rs.init_string(em.enc_method.name);
      enc_desc = rs.init_string(em.enc_method.type);
    } else {
      enc_name = null;
      enc_desc = null;
    }
    // array w/ 3 elements:
    // - the immediately enclosing class (java/lang/Class)
    // - the immediately enclosing method or constructor's name (can be null). (String)
    // - the immediately enclosing method or constructor's descriptor (null iff name is). (String)
    return new java_object.JavaArray(rs, <ClassData.ArrayClassData> rs.get_bs_class('[Ljava/lang/Object;'), [enc_cls, enc_name, enc_desc]);
  }

  public static 'getDeclaringClass0()Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaClassObject {
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
      return cls.loader.get_resolved_class(declaring_name).get_class_object(rs);
    }
    return null;
  }

  public static 'getProtectionDomain0()Ljava/security/ProtectionDomain;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaObject {
    return null;
  }

  public static 'setProtectionDomain0(Ljava/security/ProtectionDomain;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getPrimitiveClass(Ljava/lang/String;)Ljava/lang/Class;'(rs: runtime.RuntimeState, jvm_str: java_object.JavaObject): java_object.JavaClassObject {
    var type_desc = util.typestr2descriptor(jvm_str.jvm2js_str()),
      prim_cls = rs.get_bs_class(type_desc);
    return prim_cls.get_class_object(rs);
  }

  public static 'getGenericSignature()Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaObject {
    var sigAttr = <attributes.Signature> (<ClassData.ReferenceClassData> javaThis.$cls).get_attribute('Signature');
    if (sigAttr != null && sigAttr.sig != null) {
      return rs.init_string(sigAttr.sig);
    } else {
      return null;
    }
  }

  public static 'getRawAnnotations()[B'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaArray {
    var cls = <ClassData.ReferenceClassData> javaThis.$cls,
      annotations = <attributes.RuntimeVisibleAnnotations> cls.get_attribute('RuntimeVisibleAnnotations');
    if (annotations != null) {
      return new java_object.JavaArray(rs, <ClassData.ArrayClassData> rs.get_bs_class('[B'), annotations.raw_bytes);
    }

    var methods = cls.get_methods();
    for (var sig in methods) {
      if (methods.hasOwnProperty(sig)) {
        var m = methods[sig];
        annotations = <attributes.RuntimeVisibleAnnotations> m.get_attribute('RuntimeVisibleAnnotations');
        if (annotations != null) {
          return new java_object.JavaArray(rs, <ClassData.ArrayClassData> rs.get_bs_class('[B'), annotations.raw_bytes);
        }
      }
    }
    return null;
  }

  public static 'getConstantPool()Lsun/reflect/ConstantPool;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): java_object.JavaObject {
    var cls = <ClassData.ReferenceClassData> javaThis.$cls;
    return new java_object.JavaObject(rs, <ClassData.ReferenceClassData> rs.get_bs_class('Lsun/reflect/ConstantPool;'), {
      'Lsun/reflect/ConstantPool;constantPoolOop': cls.constant_pool
    });
  }

  public static 'getDeclaredFields0(Z)[Ljava/lang/reflect/Field;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject, public_only: number): void {
    var fields = javaThis.$cls.get_fields();
    if (public_only) {
      fields = fields.filter((f) => f.access_flags["public"]);
    }
    var base_array = [];
    rs.async_op(function (resume_cb, except_cb) {
      util.async_foreach(fields,
        function (f, next_item) {
          f.reflector(rs, function (jco) { base_array.push(jco); next_item() }, except_cb);
        },
        function () {
          var field_arr_cls = <ClassData.ArrayClassData> rs.get_bs_class('[Ljava/lang/reflect/Field;');
          resume_cb(new java_object.JavaArray(rs, field_arr_cls, base_array));
        });
    });
  }

  public static 'getDeclaredMethods0(Z)[Ljava/lang/reflect/Method;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject, public_only: number): void {
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
    rs.async_op(function (resume_cb, except_cb) {
      util.async_foreach(methods,
        function (m, next_item) {
          m.reflector(rs, false, function (jco) { base_array.push(jco); next_item() }, except_cb);
        },
        function () {
          var method_arr_cls = <ClassData.ArrayClassData> rs.get_bs_class('[Ljava/lang/reflect/Method;');
          resume_cb(new java_object.JavaArray(rs, method_arr_cls, base_array));
        });
    });
  }

  public static 'getDeclaredConstructors0(Z)[Ljava/lang/reflect/Constructor;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject, public_only: number): void {
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
    var ctor_array_cdata = <ClassData.ArrayClassData> rs.get_bs_class('[Ljava/lang/reflect/Constructor;');
    var base_array = [];
    rs.async_op(function (resume_cb, except_cb) {
      util.async_foreach(methods,
        function (m, next_item) {
          m.reflector(rs, true, function (jco) { base_array.push(jco); next_item() }, except_cb);
        },
        function () {
          resume_cb(new java_object.JavaArray(rs, ctor_array_cdata, base_array));
        });
    });
  }

  public static 'getDeclaredClasses0()[Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassObject): any {
    var _i, _j, _len, _len1;

    var ret = new java_object.JavaArray(rs, <ClassData.ArrayClassData> rs.get_bs_class('[Ljava/lang/Class;'), []),
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
    rs.async_op(function (resume_cb, except_cb) {
      util.async_foreach(flat_names,
        function (name: string, next_item: () => void) {
          cls.loader.resolve_class(rs, name, (function (cls) {
            ret.array.push(cls.get_class_object(rs));
            next_item();
          }), except_cb);
        },
        () => resume_cb(ret));
    });
  }

  public static 'desiredAssertionStatus0(Ljava/lang/Class;)Z'(rs: runtime.RuntimeState, arg0: java_object.JavaClassObject): boolean {
    // we don't need no stinkin asserts
    return false;
  }

}

class java_lang_ClassLoader$NativeLibrary {

  public static 'load(Ljava/lang/String;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'find(Ljava/lang/String;)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'unload()V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

// Fun Note: The bootstrap classloader object is represented by null.
class java_lang_ClassLoader {

  public static 'defineClass0(Ljava/lang/String;[BIILjava/security/ProtectionDomain;)Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassLoaderObject, arg0: java_object.JavaObject, arg1: java_object.JavaArray, arg2: number, arg3: number, arg4: java_object.JavaObject): java_object.JavaClassObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'defineClass1(Ljava/lang/String;[BIILjava/security/ProtectionDomain;Ljava/lang/String;)Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassLoaderObject, name: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number, pd: gLong, source: java_object.JavaObject): void {
    var loader = java_object.get_cl_from_jclo(rs, javaThis);
    rs.async_op<java_object.JavaClassObject>(function (resume_cb, except_cb) {
      java_object.native_define_class(rs, name, bytes, offset, len, loader, resume_cb, except_cb);
    });
  }

  public static 'defineClass2(Ljava/lang/String;Ljava/nio/ByteBuffer;IILjava/security/ProtectionDomain;Ljava/lang/String;)Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassLoaderObject, arg0: java_object.JavaObject, arg1: java_object.JavaObject, arg2: number, arg3: number, arg4: java_object.JavaObject, arg5: java_object.JavaObject): java_object.JavaClassObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'resolveClass0(Ljava/lang/Class;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassLoaderObject, cls: java_object.JavaClassObject): void {
    var loader = java_object.get_cl_from_jclo(rs, javaThis),
      type = cls.$cls.get_type();
    if (loader.get_resolved_class(type, true) != null) {
      return;
    }
    // Ensure that this class is resolved.
    rs.async_op<void>(function (resume_cb, except_cb) {
      loader.resolve_class(rs, type, (function () {
        resume_cb();
      }), except_cb, true);
    });
  }

  public static 'findBootstrapClass(Ljava/lang/String;)Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassLoaderObject, name: java_object.JavaObject): void {
    var type = util.int_classname(name.jvm2js_str());
    // This returns null in OpenJDK7, but actually can throw an exception
    // in OpenJDK6.
    rs.async_op<java_object.JavaClassObject>(function (resume_cb, except_cb) {
      rs.get_bs_cl().resolve_class(rs, type, (function (cls) {
        resume_cb(cls.get_class_object(rs));
      }), except_cb, true);
    });
  }

  public static 'findLoadedClass0(Ljava/lang/String;)Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaClassLoaderObject, name: java_object.JavaObject): java_object.JavaClassObject {
    var loader = java_object.get_cl_from_jclo(rs, javaThis),
      type = util.int_classname(name.jvm2js_str()),
      // Return JavaClassObject if loaded, or null otherwise.
      cls = loader.get_resolved_class(type, true);
    if (cls != null) {
      return cls.get_class_object(rs);
    } else {
      return null;
    }
  }

  public static 'retrieveDirectives()Ljava/lang/AssertionStatusDirectives;'(rs: runtime.RuntimeState): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class java_lang_Compiler {

  public static 'initialize()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'registerNatives()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'compileClass(Ljava/lang/Class;)Z'(rs: runtime.RuntimeState, arg0: java_object.JavaClassObject): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'compileClasses(Ljava/lang/String;)Z'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'command(Ljava/lang/Object;)Ljava/lang/Object;'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  // NOP'd.
  public static 'enable()V'(rs: runtime.RuntimeState): void {}
  public static 'disable()V'(rs: runtime.RuntimeState): void {}

}

// Used for converting between numerical representations.
var conversionBuffer = new Buffer(8);

class java_lang_Double {

  public static 'doubleToRawLongBits(D)J'(rs: runtime.RuntimeState, num: number): gLong {
    conversionBuffer.writeDoubleLE(num, 0);
    return gLong.fromBits(conversionBuffer.readUInt32LE(0), conversionBuffer.readUInt32LE(4));
  }

  public static 'longBitsToDouble(J)D'(rs: runtime.RuntimeState, num: gLong): number {
    conversionBuffer.writeInt32LE(num.getLowBits(), 0);
    conversionBuffer.writeInt32LE(num.getHighBits(), 0);
    return conversionBuffer.readDoubleLE(0);
  }

}

class java_lang_Float {

  public static 'floatToRawIntBits(F)I'(rs: runtime.RuntimeState, num: number): number {
    conversionBuffer.writeFloatLE(num, 0);
    return conversionBuffer.readInt32LE(0);
  }

  public static 'intBitsToFloat(I)F'(rs: runtime.RuntimeState, num: number): number {
    conversionBuffer.writeInt32LE(num, 0);
    return conversionBuffer.readFloatLE(0);
  }

}

class java_lang_Object {

  public static 'getClass()Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): java_object.JavaClassObject {
    return javaThis.cls.get_class_object(rs);
  }

  public static 'hashCode()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): number {
    return javaThis.ref;
  }

  public static 'clone()Ljava/lang/Object;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): java_object.JavaObject {
    return javaThis.clone(rs);
  }

  public static 'notify()V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    var locker;
    logging.debug("TE(notify): on lock *" + javaThis.ref);
    if ((locker = rs.lock_refs[javaThis.ref]) != null) {
      if (locker !== rs.curr_thread) {
        var owner = locker.name(rs);
        rs.java_throw((<ClassData.ReferenceClassData>rs.get_bs_class('Ljava/lang/IllegalMonitorStateException;')), "Thread '" + owner + "' owns this monitor");
      }
    }
    if (rs.waiting_threads[javaThis.ref] != null) {
      rs.waiting_threads[javaThis.ref].shift();
    }
  }

  public static 'notifyAll()V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    var locker;
    logging.debug("TE(notifyAll): on lock *" + javaThis.ref);
    if ((locker = rs.lock_refs[javaThis.ref]) != null) {
      if (locker !== rs.curr_thread) {
        var owner = locker.name(rs);
        rs.java_throw((<ClassData.ReferenceClassData>rs.get_bs_class('Ljava/lang/IllegalMonitorStateException;')), "Thread '" + owner + "' owns this monitor");
      }
    }
    if (rs.waiting_threads[javaThis.ref] != null) {
      rs.waiting_threads[javaThis.ref] = [];
    }
  }

  public static 'wait(J)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, timeout: gLong): void {
    var locker;
    if (timeout !== gLong.ZERO) {
      logging.error("TODO(Object::wait): respect the timeout param (" + timeout + ")");
    }
    if ((locker = rs.lock_refs[javaThis.ref]) != null) {
      if (locker !== rs.curr_thread) {
        var owner = locker.name(rs);
        rs.java_throw((<ClassData.ReferenceClassData>rs.get_bs_class('Ljava/lang/IllegalMonitorStateException;')), "Thread '" + owner + "' owns this monitor");
      }
    }
    rs.lock_refs[javaThis.ref] = null;
    rs.wait(javaThis);
  }

}

class java_lang_Package {

  public static 'getSystemPackage0(Ljava/lang/String;)Ljava/lang/String;'(rs: runtime.RuntimeState, pkg_name_obj: java_object.JavaObject): java_object.JavaObject {
    var pkg_name = pkg_name_obj.jvm2js_str();
    if (rs.get_bs_cl().get_package_names().indexOf(pkg_name) >= 0) {
      return pkg_name_obj;
    } else {
      return null;
    }
  }

  public static 'getSystemPackages0()[Ljava/lang/String;'(rs: runtime.RuntimeState): java_object.JavaArray {
    var cls_name;

    return new java_object.JavaArray(rs, (<ClassData.ArrayClassData>(rs.get_bs_class('[Ljava/lang/String;'))), (function () {
      var _i, _len, _ref5, _results;

      _ref5 = rs.get_bs_cl().get_package_names();
      _results = [];
      for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
        cls_name = _ref5[_i];
        _results.push(rs.init_string(cls_name));
      }
      return _results;
    })());
  }

}

class java_lang_ProcessEnvironment {

  public static 'environ()[[B'(rs: runtime.RuntimeState): java_object.JavaArray {
    var env_arr, k, v, _ref5;

    env_arr = [];
    // convert to an array of strings of the form [key, value, key, value ...]
    _ref5 = process.env;
    for (k in _ref5) {
      v = _ref5[k];
      env_arr.push(new java_object.JavaArray(rs, (<ClassData.ArrayClassData> rs.get_bs_class('[B')), util.bytestr_to_array(k)));
      env_arr.push(new java_object.JavaArray(rs, (<ClassData.ArrayClassData> rs.get_bs_class('[B')), util.bytestr_to_array(v)));
    }
    return new java_object.JavaArray(rs, (<ClassData.ArrayClassData> rs.get_bs_class('[[B')), env_arr);
  }

}

class java_lang_ref_Finalizer {

  public static 'invokeFinalizeMethod(Ljava/lang/Object;)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class java_lang_ref_Reference {

  // NOP. We don't do our own GC.
  public static '<clinit>()V'(rs: runtime.RuntimeState): void {}

}

class java_lang_reflect_Array {

  public static 'getLength(Ljava/lang/Object;)I'(rs: runtime.RuntimeState, obj: java_object.JavaObject): number {
    var arr = verify_array(rs, obj);
    return rs.check_null(arr).array.length;
  }

  public static 'get(Ljava/lang/Object;I)Ljava/lang/Object;'(rs: runtime.RuntimeState, arr: java_object.JavaArray, idx: number): java_object.JavaObject {
    var val = array_get(rs, arr, idx);
    // Box primitive values (fast check: prims don't have .ref attributes).
    if (val.ref == null) {
      return (<ClassData.PrimitiveClassData> arr.cls.get_component_class()).create_wrapper_object(rs, val);
    }
    return val;
  }

  public static 'getBoolean(Ljava/lang/Object;I)Z': (rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getByte(Ljava/lang/Object;I)B': (rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getChar(Ljava/lang/Object;I)C': (rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getShort(Ljava/lang/Object;I)S': (rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getInt(Ljava/lang/Object;I)I': (rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getLong(Ljava/lang/Object;I)J': (rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number) => gLong = array_get;
  public static 'getFloat(Ljava/lang/Object;I)F': (rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number) => number = array_get;
  public static 'getDouble(Ljava/lang/Object;I)D': (rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number) => number = array_get;

  public static 'set(Ljava/lang/Object;ILjava/lang/Object;)V'(rs: runtime.RuntimeState, obj: java_object.JavaObject, idx: number, val: java_object.JavaObject): void {
    var ccname, ecls, illegal_exc, m;
    var arr = verify_array(rs, obj),
      my_sf = rs.curr_frame(),
      array = rs.check_null(arr).array;
    if (!((0 <= idx && idx < array.length))) {
      rs.java_throw((<ClassData.ReferenceClassData>rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;')), 'Tried to write to an illegal index in an array.');
    }

    var ccls = arr.cls.get_component_class();
    if (ccls instanceof ClassData.PrimitiveClassData) {
      if (val.cls.is_subclass(rs.get_bs_class((<ClassData.PrimitiveClassData> ccls).box_class_name()))) {
        ccname = ccls.get_type();
        m = val.cls.method_lookup(rs, "" + util.internal2external[ccname] + "Value()" + ccname);
        rs.push(val);
        m.setup_stack(rs);
        my_sf.runner = function () {
          array[idx] = ccname === 'J' || ccname === 'D' ? rs.pop2() : rs.pop();
          return rs.meta_stack().pop();
        };
        throw exceptions.ReturnException;
      }
    } else if (val.cls.is_subclass(ccls)) {
      array[idx] = val;
      return;
    }
    illegal_exc = 'Ljava/lang/IllegalArgumentException;';
    if ((ecls = rs.get_bs_class(illegal_exc, true)) != null) {
      return rs.java_throw(ecls, 'argument type mismatch');
    } else {
      return rs.async_op(function (resume_cb, except_cb) {
        return rs.get_cl().initialize_class(rs, illegal_exc, (function (ecls) {
          return except_cb((function () {
            return rs.java_throw(ecls, 'argument type mismatch');
          }));
        }), except_cb);
      });
    }
  }

  public static 'setBoolean(Ljava/lang/Object;IZ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'setByte(Ljava/lang/Object;IB)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'setChar(Ljava/lang/Object;IC)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'setShort(Ljava/lang/Object;IS)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'setInt(Ljava/lang/Object;II)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'setLong(Ljava/lang/Object;IJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: number, arg2: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'setFloat(Ljava/lang/Object;IF)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'setDouble(Ljava/lang/Object;ID)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: number, arg2: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'newArray(Ljava/lang/Class;I)Ljava/lang/Object;'(rs: runtime.RuntimeState, cls: java_object.JavaClassObject, len: number): java_object.JavaArray {
    return rs.heap_newarray(cls.$cls.get_type(), len);
  }

  public static 'multiNewArray(Ljava/lang/Class;[I)Ljava/lang/Object;'(rs: runtime.RuntimeState, jco: java_object.JavaClassObject, lens: java_object.JavaArray): java_object.JavaArray {
    var counts = lens.array;
    var cls = rs.get_class(jco.$cls.get_type(), true);
    if (cls == null) {
      rs.async_op((resume_cb, except_cb) => {
        rs.get_cl().initialize_class(rs, jco.$cls.get_type(), ((cls) => {
          var type_str = (new Array(counts.length + 1)).join('[') + cls.get_type();
          rs.heap_multinewarray(type_str, counts);
          resume_cb();
        }), except_cb);
      });
      return;
    }
    var type_str = (new Array(counts.length + 1)).join('[') + cls.get_type();
    return rs.heap_multinewarray(type_str, counts);
  }

}

class java_lang_reflect_Proxy {

  public static 'defineClass0(Ljava/lang/ClassLoader;Ljava/lang/String;[BII)Ljava/lang/Class;'(rs: runtime.RuntimeState, cl: java_object.JavaClassLoaderObject, name: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number): void {
    return rs.async_op((success_cb, except_cb) => {
      return java_object.native_define_class(rs, name, bytes, offset, len, java_object.get_cl_from_jclo(rs, cl), success_cb, except_cb);
    });
  }

}

class java_lang_Runtime {

  public static 'availableProcessors()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): number {
    return 1;
  }

  public static 'freeMemory()J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'totalMemory()J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  /**
   * Returns the maximum amount of memory that the Java virtual machine will
   * attempt to use, in bytes, as a Long. If there is no inherent limit then the
   * value Long.MAX_VALUE will be returned.
   *
   * Currently returns Long.MAX_VALUE because unlike other JVMs Doppio has no
   * hard limit on the heap size.
   */
  public static 'maxMemory()J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): gLong {
    logging.debug("Warning: maxMemory has no meaningful value in Doppio -- there is no hard memory limit.");
    return gLong.MAX_VALUE;
  }

  /**
   * No universal way of forcing browser to GC, so we yield in hopes
   * that the browser will use it as an opportunity to GC.
   */
  public static 'gc()V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    return rs.async_op((cb) => {
      return cb();
    });
  }

  public static 'runFinalization0()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'traceInstructions(Z)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'traceMethodCalls(Z)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class java_lang_SecurityManager {

  public static 'getClassContext()[Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): java_object.JavaArray {
    // return an array of classes for each method on the stack
    // starting with the current method and going up the call chain
    var classes = [];
    var callstack = rs.meta_stack()._cs;
    for (var i = callstack.length - 1; i >= 0; i--) {
      var sf = callstack[i];
      if (!sf["native"]) {
        classes.push(sf.method.cls.get_class_object(rs));
      }
    }
    var arr_cls = <ClassData.ArrayClassData> rs.get_bs_class('[Ljava/lang/Class;');
    return new java_object.JavaArray(rs, arr_cls, classes);
  }

  public static 'currentClassLoader0()Ljava/lang/ClassLoader;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): java_object.JavaClassLoaderObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'classDepth(Ljava/lang/String;)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'classLoaderDepth0()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'currentLoadedClass0()Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): java_object.JavaClassObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class java_lang_Shutdown {

  public static 'halt0(I)V'(rs: runtime.RuntimeState, status: number): void {
    throw new exceptions.HaltException(status);
  }

  public static 'runAllFinalizers()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class java_lang_StrictMath {

  public static 'sin(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.sin(d_val);
  }

  public static 'cos(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.cos(d_val);
  }

  public static 'tan(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.tan(d_val);
  }

  public static 'asin(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.asin(d_val);
  }

  public static 'acos(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.acos(d_val);
  }

  public static 'atan(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.atan(d_val);
  }

  public static 'exp(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.exp(d_val);
  }

  public static 'log(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.log(d_val);
  }

  public static 'log10(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.log(d_val) / Math.LN10;
  }

  public static 'sqrt(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.sqrt(d_val);
  }

  public static 'cbrt(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    var is_neg = d_val < 0;
    if (is_neg) {
      return -Math.pow(-d_val, 1 / 3);
    } else {
      return Math.pow(d_val, 1 / 3);
    }
  }

  public static 'IEEEremainder(DD)D'(rs: runtime.RuntimeState, arg0: number, arg1: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'ceil(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.ceil(d_val);
  }

  public static 'floor(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    return Math.floor(d_val);
  }

  public static 'atan2(DD)D'(rs: runtime.RuntimeState, y: number, x: number): number {
    return Math.atan2(y, x);
  }

  public static 'pow(DD)D'(rs: runtime.RuntimeState, base: number, exp: number): number {
    return Math.pow(base, exp);
  }

  public static 'sinh(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'cosh(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'tanh(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'hypot(DD)D'(rs: runtime.RuntimeState, arg0: number, arg1: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'expm1(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'log1p(D)D'(rs: runtime.RuntimeState, d_val: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

}

class java_lang_String {

  public static 'hashCode()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): number {
    var i: number, hash: number = javaThis.get_field(rs, 'Ljava/lang/String;hash');
    if (hash === 0) {
      var offset = javaThis.get_field(rs, 'Ljava/lang/String;offset'),
        chars = javaThis.get_field(rs, 'Ljava/lang/String;value').array,
        count = javaThis.get_field(rs, 'Ljava/lang/String;count');
      for (i = 0; i < count; i++) {
        hash = (hash * 31 + chars[offset++]) | 0;
      }
      javaThis.set_field(rs, 'Ljava/lang/String;hash', hash);
    }
    return hash;
  }

  public static 'intern()Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): java_object.JavaObject {
    var js_str = javaThis.jvm2js_str(),
      s = rs.string_pool.get(js_str);
    if (s == null) {
      rs.string_pool.set(js_str, javaThis);
      return javaThis;
    }
    return s;
  }

}

class java_lang_System {

  public static 'setIn0(Ljava/io/InputStream;)V'(rs: runtime.RuntimeState, stream: java_object.JavaObject): void {
    var sys = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/System;');
    return sys.static_put(rs, 'in', stream);
  }

  public static 'setOut0(Ljava/io/PrintStream;)V'(rs: runtime.RuntimeState, stream: java_object.JavaObject): void {
    var sys = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/System;');
    return sys.static_put(rs, 'out', stream);
  }

  public static 'setErr0(Ljava/io/PrintStream;)V'(rs: runtime.RuntimeState, stream: java_object.JavaObject): void {
    var sys = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/System;');
    return sys.static_put(rs, 'err', stream);
  }

  public static 'currentTimeMillis()J'(rs: runtime.RuntimeState): gLong {
    return gLong.fromNumber((new Date).getTime());
  }

  /**
   * @todo Use performance.now() if available.
   */
  public static 'nanoTime()J'(rs: runtime.RuntimeState): gLong {
    return gLong.fromNumber((new Date).getTime()).multiply(gLong.fromNumber(1000000));
  }

  public static 'arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V'(rs: runtime.RuntimeState, src: java_object.JavaArray, src_pos: number, dest: java_object.JavaArray, dest_pos: number, length: number): void {
    var dest_comp_cls, src_comp_cls;
    // Needs to be checked *even if length is 0*.
    if ((src == null) || (dest == null)) {
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/NullPointerException;'), 'Cannot copy to/from a null array.');
    }
    // Can't do this on non-array types. Need to check before I check bounds below, or else I'll get an exception.
    if (!(src.cls instanceof ClassData.ArrayClassData) || !(dest.cls instanceof ClassData.ArrayClassData)) {
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArrayStoreException;'), 'src and dest arguments must be of array type.');
    }
    // Also needs to be checked *even if length is 0*.
    if (src_pos < 0 || (src_pos + length) > src.array.length || dest_pos < 0 || (dest_pos + length) > dest.array.length || length < 0) {
      // System.arraycopy requires IndexOutOfBoundsException, but Java throws an array variant of the exception in practice.
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;'), 'Tried to write to an illegal index in an array.');
    }
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
      return java_object.arraycopy_no_check(src, src_pos, dest, dest_pos, length);
    } else {
      // Slow path
      // Absolutely cannot do this when two different primitive types, or a primitive type and a reference type.
      src_comp_cls = src.cls.get_component_class();
      dest_comp_cls = dest.cls.get_component_class();
      if ((src_comp_cls instanceof ClassData.PrimitiveClassData) || (dest_comp_cls instanceof ClassData.PrimitiveClassData)) {
        return rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArrayStoreException;'), 'If calling arraycopy with a primitive array, both src and dest must be of the same primitive type.');
      } else {
        // Must be two reference types.
        return java_object.arraycopy_check(rs, src, src_pos, dest, dest_pos, length);
      }
    }
  }

  public static 'identityHashCode(Ljava/lang/Object;)I'(rs: runtime.RuntimeState, x: java_object.JavaObject): number {
    if (x != null && x.ref != null) {
      return x.ref;
    }
    return 0;
  }

  public static 'initProperties(Ljava/util/Properties;)Ljava/util/Properties;'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): void {
    // return value should not be used
    // @todo WAT
    rs.push(null);
  }

  public static 'getProperty(Ljava/lang/String;)Ljava/lang/String;': (rs: runtime.RuntimeState, arg0: java_object.JavaObject) => java_object.JavaObject = get_property;

  public static 'getProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': (rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: java_object.JavaObject) => java_object.JavaObject = get_property;

  public static 'loadLibrary(Ljava/lang/String;)V'(rs: runtime.RuntimeState, lib_name: java_object.JavaObject): void {
    var lib = lib_name.jvm2js_str();
    if (lib !== 'zip' && lib !== 'net' && lib !== 'nio' && lib !== 'awt' && lib !== 'fontmanager') {
      return rs.java_throw((<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;')), "no " + lib + " in java.library.path");
    }
  }

  public static 'mapLibraryName(Ljava/lang/String;)Ljava/lang/String;'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class java_lang_Terminator {

  public static 'setup()V'(rs: runtime.RuntimeState): void {
    // XXX: We should probably fix this; we support threads now.
    // Historically: NOP'd because we didn't support threads.
  }

}

class java_lang_Thread {

  public static 'currentThread()Ljava/lang/Thread;'(rs: runtime.RuntimeState): java_object.JavaObject {
    return rs.curr_thread;
  }

  public static 'yield()V'(rs: runtime.RuntimeState): void {
    return rs.async_op(function (resume_cb) {
      return rs.choose_next_thread(null, (next_thread) => {
        rs['yield'](next_thread);
        return resume_cb();
      });
    });
  }

  public static 'sleep(J)V'(rs: runtime.RuntimeState, millis: gLong): void {
    // sleep is a yield point, plus some fancy wakeup semantics
    rs.curr_thread.wakeup_time = (new Date).getTime() + millis.toNumber();
    return rs.async_op(function (resume_cb) {
      return rs.choose_next_thread(null, function (next_thread) {
        rs["yield"](next_thread);
        return resume_cb();
      });
    });
  }

  public static 'start0()V'(rs: runtime.RuntimeState, javaThis: threading.JavaThreadObject): void {
    var new_thread_sf, old_thread_sf, run_method, thread_runner_sf;

    javaThis.$isAlive = true;
    javaThis.$meta_stack = new threading.CallStack();
    rs.thread_pool.push(javaThis);
    old_thread_sf = rs.curr_frame();
    logging.debug("TE(start0): starting " + javaThis.name(rs) + " from " + rs.curr_thread.name(rs));
    rs.curr_thread = javaThis;
    new_thread_sf = rs.curr_frame();
    rs.push(javaThis);
    run_method = javaThis.cls.method_lookup(rs, 'run()V');
    thread_runner_sf = run_method.setup_stack(rs);
    new_thread_sf.runner = function () {
      // new_thread_sf is the fake SF at index 0
      new_thread_sf.runner = null;
      javaThis.$isAlive = false;
      logging.debug("TE(start0): thread died: " + javaThis.name(rs));
    };
    old_thread_sf.runner = function () {
      logging.debug("TE(start0): thread resumed: " + rs.curr_thread.name(rs));
      return rs.meta_stack().pop();
    };
    throw exceptions.ReturnException;
  }

  public static 'isInterrupted(Z)Z'(rs: runtime.RuntimeState, javaThis: threading.JavaThreadObject, clear_flag: number): boolean {
    var tmp = javaThis.$isInterrupted;
    if (tmp == null) {
      tmp = false;
    }

    if (clear_flag) {
      javaThis.$isInterrupted = false;
    }
    return tmp;
  }

  public static 'isAlive()Z'(rs: runtime.RuntimeState, javaThis: threading.JavaThreadObject): boolean {
    var tmp = javaThis.$isAlive;
    return tmp == null ? false : tmp;
  }

  public static 'countStackFrames()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'holdsLock(Ljava/lang/Object;)Z'(rs: runtime.RuntimeState, obj: java_object.JavaObject): boolean {
    return rs.curr_thread === rs.lock_refs[obj.ref];
  }

  public static 'dumpThreads([Ljava/lang/Thread;)[[Ljava/lang/StackTraceElement;'(rs: runtime.RuntimeState, arg0: java_object.JavaArray): java_object.JavaArray {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getThreads()[Ljava/lang/Thread;'(rs: runtime.RuntimeState): java_object.JavaArray {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'setPriority0(I)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number): void {
    // NOP
  }

  public static 'stop0(Ljava/lang/Object;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'suspend0()V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'resume0()V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'interrupt0()V'(rs: runtime.RuntimeState, javaThis: threading.JavaThreadObject): void {
    javaThis.$isInterrupted = true;
    if (javaThis === rs.curr_thread) {
      return;
    }
    // Parked threads do not raise an interrupt
    // exception, but do get yielded to
    if (rs.parked(javaThis)) {
      rs["yield"](javaThis);
      return;
    }
    logging.debug("TE(interrupt0): interrupting " + javaThis.name(rs));
    var new_thread_sf = util.last(javaThis.$meta_stack._cs);
    new_thread_sf.runner = function () {
      return rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/InterruptedException;'), 'interrupt0 called');
    };
    javaThis.$meta_stack.push(<any> {}); // dummy
    rs["yield"](javaThis);
    throw exceptions.ReturnException;
  }

}

class java_lang_Throwable {

  public static 'fillInStackTrace()Ljava/lang/Throwable;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): java_object.JavaObject {
    var strace = new java_object.JavaArray(rs, <ClassData.ArrayClassData> rs.get_bs_class('[Ljava/lang/StackTraceElement;'), create_stack_trace(rs, javaThis));
    javaThis.set_field(rs, 'Ljava/lang/Throwable;stackTrace', strace);
    return javaThis;
  }

  public static 'getStackTraceDepth()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): number {
    return create_stack_trace(rs, javaThis).length;
  }

  public static 'getStackTraceElement(I)Ljava/lang/StackTraceElement;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, depth: number): java_object.JavaObject {
    return create_stack_trace(rs, javaThis)[depth];
  }

}

class java_lang_UNIXProcess {

  public static 'waitForProcessExit(I)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'forkAndExec([B[BI[BI[BZLjava/io/FileDescriptor;Ljava/io/FileDescriptor;Ljava/io/FileDescriptor;)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, prog: java_object.JavaArray, argBlock: java_object.JavaArray, arg2: number, arg3: java_object.JavaArray, arg4: number, arg5: java_object.JavaArray, arg6: number, arg7: java_object.JavaObject, arg8: java_object.JavaObject, arg9: java_object.JavaObject): void {
    var progname = util.chars2js_str(prog, 0, prog.array.length),
      args = util.chars2js_str(argBlock, 0, argBlock.array.length);
    return rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/Error;'), "Doppio doesn't support forking processes. Command was: `" + progname + " " + args + "`");
  }

  public static 'destroyProcess(I)V'(rs: runtime.RuntimeState, arg0: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'initIDs()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

// Export line. This is what DoppioJVM sees.
({
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
  'java/lang/ref/Reference': java_lang_ref_Reference,
  'java/lang/reflect/Array': java_lang_reflect_Array,
  'java/lang/reflect/Proxy': java_lang_reflect_Proxy,
  'java/lang/Runtime': java_lang_Runtime,
  'java/lang/SecurityManager': java_lang_SecurityManager,
  'java/lang/Shutdown': java_lang_Shutdown,
  'java/lang/StrictMath': java_lang_StrictMath,
  'java/lang/String': java_lang_String,
  'java/lang/System': java_lang_System,
  'java/lang/Terminator': java_lang_Terminator,
  'java/lang/Thread': java_lang_Thread,
  'java/lang/Throwable': java_lang_Throwable,
  'java/lang/UNIXProcess': java_lang_UNIXProcess
})
