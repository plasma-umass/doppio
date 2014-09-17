"use strict";
import util = require('./util');
import ByteStream = require('./ByteStream');
import opcodes = require('./opcodes');
import attributes = require('./attributes');
import logging = require('./logging');
import JVM = require('./jvm');
import java_object = require('./java_object');
import ConstantPool = require('./ConstantPool');
import ClassData = require('./ClassData');
import threading = require('./threading');
import gLong = require('./gLong');
import ClassLoader = require('./ClassLoader');
import assert = require('./assert');


var vtrace = logging.vtrace, trace = logging.trace, debug_vars = logging.debug_vars;
var JavaArray = java_object.JavaArray;
var JavaObject = java_object.JavaObject;
declare var RELEASE: boolean;

function get_property(thread: threading.JVMThread, jvm_key: java_object.JavaObject, _default: java_object.JavaObject = null): java_object.JavaObject {
  var key = jvm_key.jvm2js_str(), jvm: JVM = thread.getThreadPool().getJVM(),
    val = jvm.getSystemProperty(key);
  // special case
  if (key === 'java.class.path') {
    // Fetch from bootstrap classloader instead.
    // the first path is actually the bootclasspath (vendor/classes/)
    // XXX: Not robust to multiple bootstrap paths.
    return java_object.initString(thread.getBsCl(), thread.getBsCl().getClassPath().slice(1).join(':'));
  }
  if (val != null) {
    return jvm.internString(val);
  } else {
    return _default;
  }
}

var trapped_methods = {
  'java/lang/ref/Reference': {
    // NOP, because we don't do our own GC and also this starts a thread?!?!?!
    '<clinit>()V': function (thread: threading.JVMThread): void { }
  },
  /*'java/lang/String': {
    // trapped here only for speed
    'hashCode()I': function (thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
      var i: number, hash: number = javaThis.get_field(thread, 'Ljava/lang/String;hash');
      if (hash === 0) {
        var offset = javaThis.get_field(thread, 'Ljava/lang/String;offset'),
          chars = javaThis.get_field(thread, 'Ljava/lang/String;value').array,
          count = javaThis.get_field(thread, 'Ljava/lang/String;count');
        for (i = 0; i < count; i++) {
          hash = (hash * 31 + chars[offset++]) | 0;
        }
        javaThis.set_field(thread, 'Ljava/lang/String;hash', hash);
      }
      return hash;
    }
  },*/
  'java/lang/System': {
    'loadLibrary(Ljava/lang/String;)V': function (thread: threading.JVMThread, lib_name: java_object.JavaObject): void {
      var lib = lib_name.jvm2js_str();
      if (lib !== 'zip' && lib !== 'net' && lib !== 'nio' && lib !== 'awt' && lib !== 'fontmanager') {
        thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', "no " + lib + " in java.library.path");
      }
    },
    'getProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;': get_property,
    'getProperty(Ljava/lang/String;)Ljava/lang/String;': get_property
  },
  'java/lang/Terminator': {
    'setup()V': function (thread: threading.JVMThread): void {
      // XXX: We should probably fix this; we support threads now.
      // Historically: NOP'd because we didn't support threads.
    }
  },
  'java/util/concurrent/atomic/AtomicInteger': {
    '<clinit>()V': function (thread: threading.JVMThread): void {
      // NOP
    },
    'compareAndSet(II)Z': function (thread: threading.JVMThread, javaThis: java_object.JavaObject, expect: number, update: number): boolean {
      javaThis.set_field(thread, 'Ljava/util/concurrent/atomic/AtomicInteger;value', update);
      // always true, because we only have one thread of execution
      // @todo Fix: Actually check expected value!
      return true;
    }
  },
  'java/nio/Bits': {
    'byteOrder()Ljava/nio/ByteOrder;': function (thread: threading.JVMThread): java_object.JavaObject {
      var cls = <ClassData.ReferenceClassData> thread.getBsCl().getInitializedClass(thread, 'Ljava/nio/ByteOrder;');
      return cls.static_get(thread, 'LITTLE_ENDIAN');
    },
    'copyToByteArray(JLjava/lang/Object;JJ)V': function (thread: threading.JVMThread, srcAddr: gLong, dst: java_object.JavaArray, dstPos: gLong, length: gLong): void {
      var heap = thread.getThreadPool().getJVM().getHeap(),
        srcStart = srcAddr.toNumber(),
        dstStart: number = dstPos.toNumber(),
        len: number = length.toNumber(),
        i: number,
        arr = dst.array;
      for (i = 0; i < len; i++) {
        arr[dstStart + i] = heap.get_byte(srcStart + i);
      }
    }
  },
  'java/nio/charset/Charset$3': {
    // this is trapped and NOP'ed for speed
    'run()Ljava/lang/Object;': function (thread: threading.JVMThread, javaThis: java_object.JavaObject): java_object.JavaObject {
      return null;
    }
  }
};

function getTrappedMethod(clsName: string, methSig: string): Function {
  clsName = util.descriptor2typestr(clsName);
  if (trapped_methods.hasOwnProperty(clsName) && trapped_methods[clsName].hasOwnProperty(methSig)) {
    return trapped_methods[clsName][methSig];
  }
  return null;
}

export class AbstractMethodField {
  public cls: ClassData.ReferenceClassData;
  public idx: number;
  public access_byte: number;
  public access_flags: util.Flags;
  public name: string;
  public raw_descriptor: string;
  public attrs: attributes.Attribute[];

  constructor(cls: ClassData.ReferenceClassData) {
    this.cls = cls;
  }

  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool, idx: number): void {
    this.idx = idx;
    this.access_byte = bytes_array.getUint16();
    this.access_flags = util.parse_flags(this.access_byte);
    this.name = constant_pool.get(bytes_array.getUint16()).value;
    this.raw_descriptor = constant_pool.get(bytes_array.getUint16()).value;
    this.parse_descriptor(this.raw_descriptor);
    this.attrs = attributes.make_attributes(bytes_array, constant_pool);
  }

  public get_attribute(name: string): attributes.Attribute {
    for (var i = 0; i < this.attrs.length; i++) {
      var attr = this.attrs[i];
      if (attr.name === name) {
        return attr;
      }
    }
    return null;
  }

  public get_attributes(name: string): attributes.Attribute[] {
    return this.attrs.filter((attr) => attr.name === name);
  }

  // To satiate TypeScript. Consider it an 'abstract' method.
  public parse_descriptor(raw_descriptor: string): void {
    throw new Error("Unimplemented error.");
  }
}

export class Field extends AbstractMethodField {
  public type: string;

  public parse_descriptor(raw_descriptor: string): void {
    this.type = raw_descriptor;
  }

  /**
   * Calls cb with the reflectedField if it succeeds. Calls cb with null if it
   * fails.
   */
  public reflector(thread: threading.JVMThread, cb: (reflectedField: java_object.JavaObject)=>void): void {
    var found = <attributes.Signature> this.get_attribute("Signature");
    // note: sig is the generic type parameter (if one exists), not the full
    // field type.
    var sig = (found != null) ? found.sig : null;
    var jvm = thread.getThreadPool().getJVM();
    var bsCl = thread.getBsCl();
    var create_obj = (clazz_obj: java_object.JavaClassObject, type_obj: java_object.JavaObject) => {
      var field_cls = <ClassData.ReferenceClassData> bsCl.getInitializedClass(thread, 'Ljava/lang/reflect/Field;');
      return new java_object.JavaObject(field_cls, {
        // XXX this leaves out 'annotations'
        'Ljava/lang/reflect/Field;clazz': clazz_obj,
        'Ljava/lang/reflect/Field;name': jvm.internString(this.name),
        'Ljava/lang/reflect/Field;type': type_obj,
        'Ljava/lang/reflect/Field;modifiers': this.access_byte,
        'Ljava/lang/reflect/Field;slot': this.idx,
        'Ljava/lang/reflect/Field;signature': sig != null ? java_object.initString(bsCl, sig) : null
      });
    };
    var clazz_obj = this.cls.get_class_object(thread);
    // type_obj may not be loaded, so we asynchronously load it here.
    // In the future, we can speed up reflection by having a synchronous_reflector
    // method that we can try first, and which may fail.
    this.cls.loader.resolveClass(thread, this.type, (cdata: ClassData.ClassData) => {
      if (cdata != null) {
        var type_obj = cdata.get_class_object(thread),
          rv = create_obj(clazz_obj, type_obj);
        cb(rv);
      } else {
        cb(null);
      }
    });
  }
}

export class Method extends AbstractMethodField {
  private reset_caches: boolean;
  public param_types: string[];
  private param_bytes: number;
  private num_args: number;
  public return_type: string;
  // Code is either a function, or a CodeAttribute. We should have a factory method
  // that constructs NativeMethod objects and BytecodeMethod objects.
  private code: any;

  public parse_descriptor(raw_descriptor: string): void {
    this.reset_caches = false;  // Switched to 'true' in web frontend between JVM invocations.
    var match = /\(([^)]*)\)(.*)/.exec(raw_descriptor);
    var param_str = match[1];
    var return_str = match[2];
    var param_carr = param_str.split('');
    this.param_types = [];
    var field;
    while (field = util.carr2descriptor(param_carr)) {
      this.param_types.push(field);
    }
    this.param_bytes = 0;
    for (var i = 0; i < this.param_types.length; i++) {
      var p = this.param_types[i];
      this.param_bytes += (p === 'D' || p === 'J') ? 2 : 1;
    }
    if (!this.access_flags["static"]) {
      this.param_bytes++;
    }
    this.num_args = this.param_types.length;
    if (!this.access_flags["static"]) {
      // nonstatic methods get 'this'
      this.num_args++;
    }
    this.return_type = return_str;
  }

  public full_signature(): string {
    return this.cls.get_type() + "::" + this.name + this.raw_descriptor;
  }

  public getCode(): opcodes.Opcode[] {
    assert(!this.access_flags.native && !this.access_flags.abstract);
    return (<attributes.Code> this.code).getCode();
  }

  public getCodeAttribute(): attributes.Code {
    assert(!this.access_flags.native && !this.access_flags.abstract);
    return this.code;
  }

  public getNativeFunction(): Function {
    assert(this.access_flags.native && typeof (this.code) === 'function');
    return this.code;
  }

  public parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool, idx: number): void {
    super.parse(bytes_array, constant_pool, idx);
    var sig = this.full_signature(),
      clsName = this.cls.get_type(),
      methSig = this.name + this.raw_descriptor,
      c: Function;

    if (getTrappedMethod(clsName, methSig) != null) {
      this.code = getTrappedMethod(clsName, methSig);
      this.access_flags["native"] = true;
    } else if (this.access_flags["native"]) {
      if (sig.indexOf('::registerNatives()V', 1) < 0 && sig.indexOf('::initIDs()V', 1) < 0) {
        this.code = (thread: threading.JVMThread) => {
          // Try to fetch the native method.
          var jvm = thread.getThreadPool().getJVM(),
            c = jvm.getNative(clsName, methSig);
          if (c == null) {
            thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', "Native method '" + sig + "' not implemented.\nPlease fix or file a bug at https://github.com/plasma-umass/doppio/issues");
          } else {
            this.code = c;
            return c.apply(this, arguments);
          }
        };
      } else {
        // NOP.
        this.code = () => { };
      }
    } else if (!this.access_flags.abstract) {
      this.code = this.get_attribute('Code');
    }
  }

  public reflector(thread: threading.JVMThread, is_constructor: boolean, cb: (reflectedMethod: java_object.JavaObject)=>void): void {
    if (is_constructor == null) {
      is_constructor = false;
    }

    var typestr = is_constructor ? 'Ljava/lang/reflect/Constructor;' : 'Ljava/lang/reflect/Method;',
      exceptionAttr = <attributes.Exceptions> this.get_attribute("Exceptions"),
      annAttr = <attributes.RuntimeVisibleAnnotations> this.get_attribute("RuntimeVisibleAnnotations"),
      annDefaultAttr = <attributes.AnnotationDefault> this.get_attribute("AnnotationDefault"),
      sigAttr = <attributes.Signature> this.get_attribute("Signature"),
      obj = {},
      clazz_obj = this.cls.get_class_object(thread),
      toResolve: string[] = [],
      bsCl: ClassLoader.BootstrapClassLoader = thread.getBsCl(),
      jvm = thread.getThreadPool().getJVM(),
      loader = this.cls.loader,
      hasCode = (!this.access_flags.native && !this.access_flags.abstract);

    // Resolve the return type.
    toResolve.push(this.return_type);
    // Resolve exception handler types.
    if (hasCode && this.code.exception_handlers.length > 0) {
      toResolve.push('Ljava/lang/Throwable;');  // Mimic native java.
      var eh = this.code.exception_handlers;
      for (var i=0; i<eh.length; i++) {
        if (eh[i].catch_type !== '<any>') {
          toResolve.push(eh[i].catch_type);
        }
      }
    }
    // Resolve parameter types.
    toResolve.push.apply(toResolve, this.param_types);
    // Resolve checked exception types.
    if (exceptionAttr != null) {
      toResolve.push.apply(toResolve, exceptionAttr.exceptions);
    }

    loader.resolveClasses(thread, toResolve, (classes) => {
      if (classes === null) {
        // FAILED. An exception has been thrown.
        cb(null);
      } else {
        // XXX: missing parameterAnnotations
        var jco_arr_cls = <ClassData.ArrayClassData> bsCl.getInitializedClass(thread, '[Ljava/lang/Class;');
        var byte_arr_cls = <ClassData.ArrayClassData> bsCl.getInitializedClass(thread, '[B');
        var cls = <ClassData.ReferenceClassData> bsCl.getInitializedClass(thread, typestr);
        var param_type_objs: java_object.JavaClassObject[] = [];
        var i;
        for (i = 0; i < this.param_types.length; i++) {
          param_type_objs.push(classes[this.param_types[i]].get_class_object(thread));
        }
        var etype_objs: java_object.JavaClassObject[] = [];
        if (exceptionAttr != null) {
          for (i = 0; i < exceptionAttr.exceptions.length; i++) {
            etype_objs.push(classes[<string> exceptionAttr.exceptions[i]].get_class_object(thread));
          }
        }
        obj[typestr + 'clazz'] = clazz_obj;
        obj[typestr + 'name'] = jvm.internString(this.name);
        obj[typestr + 'parameterTypes'] = new JavaArray(jco_arr_cls, param_type_objs);
        obj[typestr + 'returnType'] = classes[this.return_type].get_class_object(thread);
        obj[typestr + 'exceptionTypes'] = new JavaArray(jco_arr_cls, etype_objs);
        obj[typestr + 'modifiers'] = this.access_byte;
        obj[typestr + 'slot'] = this.idx;
        obj[typestr + 'signature'] = sigAttr != null ? jvm.internString(sigAttr.sig) : null;
        obj[typestr + 'annotations'] = annAttr != null ? new JavaArray(byte_arr_cls, annAttr.raw_bytes) : null;
        obj[typestr + 'annotationDefault'] = annDefaultAttr != null ? new JavaArray(byte_arr_cls, annDefaultAttr.raw_bytes) : null;
        cb(new JavaObject(cls, obj));
      }
    });
  }

  /**
   * Convert the arguments to this method into a form suitable for a native
   * implementation.
   *
   * The JVM uses two parameter slots for double and long values, since they
   * consist of two JVM machine words (32-bits). Doppio stores the entire value
   * in one slot, and stores a NULL in the second.
   *
   * This function strips out these NULLs so the arguments are in a more
   * consistent form. The return value is the arguments to this function without
   * these NULL values. It also adds the 'thread' object to the start of the
   * arguments array.
   */
  public convertArgs(thread: threading.JVMThread, params: any[]): any[] {
    var convertedArgs = [thread], argIdx = 0, i: number;
    if (!this.access_flags["static"]) {
      convertedArgs.push(params[0]);
      argIdx = 1;
    }
    for (i = 0; i < this.param_types.length; i++) {
      var p = this.param_types[i];
      convertedArgs.push(params[argIdx]);
      argIdx += (p === 'J' || p === 'D') ? 2 : 1;
    }
    return convertedArgs;
  }

  /**
   * Takes the arguments to this function from the top of the input stack,
   * and returns them as a new array.
   */
  public takeArgs(caller_stack: any[]): any[] {
    var start = caller_stack.length - this.param_bytes;
    var params = caller_stack.slice(start);
    // this is faster than splice()
    caller_stack.length -= this.param_bytes;
    return params;
  }

  // Reinitializes the method by removing all cached information from the method.
  // We amortize the cost by doing it lazily the first time that we call run_bytecode.
  public initialize(): void {
    this.reset_caches = true;
  }

  public method_lock(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): java_object.Monitor {
    if (this.access_flags["static"]) {
      // Static methods lock the class.
      return this.cls.get_class_object(thread).getMonitor();
    } else {
      // Non-static methods lock the instance.
      return (<java_object.JavaObject> frame.locals[0]).getMonitor();
    }
  }
}
