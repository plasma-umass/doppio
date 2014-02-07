"use strict";
import ClassData = require('./ClassData');
import util = require('./util');
import JVM = require('./jvm');
import logging = require('./logging');
var trace = logging.trace;
import runtime = require('./runtime');
import exceptions = require('./exceptions');
var JavaException = exceptions.JavaException;
import threading = require('./threading');
import java_object = require('./java_object');
var JavaObject = java_object.JavaObject;
import enums = require('./enums');
var ClassState = enums.ClassState;

declare var UNSAFE: boolean;

// Base ClassLoader class. Handles interacting with the raw data structure used
// to store the classes.
// Requires a reference to the bootstrap classloader for primitive class
// references.
export class ClassLoader {
  public bootstrap: BootstrapClassLoader;
  public loaded_classes: { [typestr: string]: ClassData.ClassData };

  constructor(bootstrap: BootstrapClassLoader) {
    this.bootstrap = bootstrap;
    this.loaded_classes = Object.create(null);
  }

  public serialize(visited: {[n:string]:boolean}): any {
    throw new Error('Abstract method!');
  }

  // Don't prune reference classes; if you do, we'll be iterating over
  // each class twice.
  public get_package_names(): string[] {
    var classes = this.get_loaded_class_list(true);
    var pkg_names: {[key:string]:boolean} = {};
    for (var i = 0; i < classes.length; i++) {
      var cls = classes[i];
      pkg_names[cls.substring(0, (cls.lastIndexOf('/')) + 1)] = true;
    }
    return Object.keys(pkg_names);
  }

  public get_loaded_class_list(ref_class_only?: boolean): string[] {
    if (ref_class_only == null) {
      ref_class_only = false;
    }
    if (ref_class_only) {
      var loaded_classes = this.loaded_classes;
      var results: string[] = [];
      for (var k in loaded_classes) {
        var cdata = loaded_classes[k];
        if ('major_version' in cdata) {
          // Remove L and ; from Lname/of/Class;
          results.push(k.slice(1, -1));
        }
      }
      return results;
    } else {
      return Object.keys(this.loaded_classes);
    }
  }

  // remove a class the Right Way, by also removing any subclasses
  public remove_class(type_str: string): void {
    this._rem_class(type_str);
    if (util.is_primitive_type(type_str)) {
      return;
    }
    var loaded_classes = this.loaded_classes;
    for (var k in loaded_classes) {
      var cdata = loaded_classes[k];
      if ((type_str === cdata.get_super_class_type()) || (cdata instanceof ClassData.ArrayClassData && type_str === (<ClassData.ArrayClassData>cdata).get_component_type())) {
        this.remove_class(k);
      }
    }
  }

  // Remove a class. Should only be used in the event of a class loading failure.
  private _rem_class(type_str: string): void {
    delete this.loaded_classes[type_str];
  }

  // Adds a class to this ClassLoader.
  public _add_class(type_str: string, cdata: ClassData.ClassData): void {
    // XXX: JVM appears to allow define_class to be called twice on same class.
    // Does it actually replace the old class???
    // UNSAFE? || throw new Error "ClassLoader tried to overwrite class #{type_str} with a new version." if @loaded_classes[type_str]?
    this.loaded_classes[type_str] = cdata;
  }

  // Retrieves a class in this ClassLoader. Returns null if it does not exist.
  public _get_class(type_str: string): ClassData.ClassData {
    var cdata = this.loaded_classes[type_str];
    if (cdata != null && cdata.reset_bit === 1) {
      cdata.reset();
    }
    return cdata != null ? cdata : null;
  }

  // Defines a new array class with the specified component type.
  // Returns null if the component type is not loaded.
  // Returns the ClassData object for this class (array classes do not have
  // JavaClassObjects).
  private _try_define_array_class(type_str: string): ClassData.ClassData {
    var component_type = util.get_component_type(type_str);
    var component_cdata = this.get_resolved_class(component_type, true);
    if (component_cdata == null) {
      return null;
    }
    return this._define_array_class(type_str, component_cdata);
  }

  // Defines a new array class with the specified component ClassData.
  // If the component ClassData object comes from another ClassLoader, invoke
  // this method on that ClassLoader.
  private _define_array_class(type_str: string, component_cdata: ClassData.ClassData): ClassData.ClassData {
    if (component_cdata.get_class_loader() !== this) {
      return component_cdata.get_class_loader()._define_array_class(type_str, component_cdata);
    } else {
      var cdata = new ClassData.ArrayClassData(component_cdata.get_type(), this);
      this._add_class(type_str, cdata);
      cdata.set_resolved(this.bootstrap.get_resolved_class('Ljava/lang/Object;'), component_cdata);
      return cdata;
    }
  }

  // Called by define_class to fetch all interfaces and superclasses in parallel.
  private _parallel_class_resolve(rs: runtime.RuntimeState, types: string[], success_fn: (cds: ClassData.ClassData[])=>void, failure_fn: (e_cb:()=>void)=>void, explicit?:boolean): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    // Number of callbacks waiting to be called.
    var pending_requests = types.length;
    // Set to a callback that throws an exception.
    var failure = null;
    // Array of successfully resolved classes.
    var resolved: ClassData.ClassData[] = [];
    // Called each time a requests finishes, whether in error or in success.
    var request_finished = function () {
      pending_requests--;
      // pending_requests is 0? Then I am the last callback. Call success_fn.
      if (pending_requests === 0) {
        if (failure == null) {
          return success_fn(resolved);
        } else {
          // Throw the exception.
          return failure_fn(failure);
        }
      }
    };
    // Fetches the class data associated with 'type' and adds it to the classloader.
    var fetch_data = function (type: string) {
      _this.resolve_class(rs, type, (function (cdata) {
        resolved.push(cdata);
        request_finished();
      }), (function (f_fn) {
        // resolve_class failure
        failure = f_fn;
        request_finished();
      }), explicit);
    };
    // Kick off all of the requests.
    for (var i = 0; i < types.length; i++) {
      fetch_data(types[i]);
    }
  }

  // Resolves the classes represented by the type strings in types one by one.
  private _regular_class_resolve(rs: runtime.RuntimeState, types: string[], success_fn: (cds: ClassData.ClassData[])=>void, failure_fn: (e_cb:()=>void)=>void, explicit?:boolean): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    if (types.length === 0) {
      return success_fn(null);
    }
    // Array of successfully resolved classes.
    var resolved: ClassData.ClassData[] = [];
    var fetch_class = function (type: string) {
      _this.resolve_class(rs, type, (function (cdata) {
        resolved.push(cdata);
        if (types.length > 0) {
          fetch_class(types.shift());
        } else {
          success_fn(resolved);
        }
      }), failure_fn, explicit);
    };
    fetch_class(types.shift());
  }

  // Only called for reference types.
  // Ensures that the class is resolved by ensuring that its super classes and
  // interfaces are also resolved (hence, it is asynchronous).
  // Calls the success_fn with the ClassData object for this class.
  // Calls the failure_fn with a function that throws the appropriate exception
  // in the event of a failure.
  // If 'parallel' is 'true', then we call resolve_class multiple times in
  // parallel (used by the bootstrap classloader).
  public define_class(rs: runtime.RuntimeState, type_str: string, data: NodeBuffer, success_fn: (cd:ClassData.ClassData)=>void, failure_fn: (e_cb:()=>void)=>void, parallel?: boolean, explicit?:boolean): void {
    var _this = this;

    if (parallel == null) {
      parallel = false;
    }
    if (explicit == null) {
      explicit = false;
    }
    trace("Defining class " + type_str + "...");
    var cdata = new ClassData.ReferenceClassData(data, this);
    var type = cdata.get_type();
    if (type !== type_str) {
      var msg = util.descriptor2typestr(type_str) + " (wrong name: " + util.descriptor2typestr(type) + ")";
      failure_fn((function () {
        var err_cls = <ClassData.ReferenceClassData> _this.get_initialized_class('Ljava/lang/NoClassDefFoundError;');
        rs.java_throw(err_cls, msg);
      }));
    }
    // Add the class before we fetch its super class / interfaces.
    this._add_class(type_str, cdata);
    // What classes are we fetching?
    var types = cdata.get_interface_types();
    types.push(cdata.get_super_class_type());
    var to_resolve: string[] = [];
    var resolved_already: ClassData.ReferenceClassData[] = [];
    // Prune any resolved classes.
    for (var i = 0; i < types.length; i++) {
      type = types[i];
      if (type == null) {
        // super_class could've been null.
        continue;
      }
      var clsdata = <ClassData.ReferenceClassData>this.get_resolved_class(type, true);
      if (clsdata != null) {
        resolved_already.push(clsdata);
      } else {
        to_resolve.push(type);
      }
    }
    function process_resolved_classes(cdatas: ClassData.ReferenceClassData[]) {
      cdatas = resolved_already.concat(cdatas);
      var super_cdata: ClassData.ReferenceClassData = null;
      var interface_cdatas: ClassData.ReferenceClassData[] = [];
      var super_type = cdata.get_super_class_type();
      for (var j = 0; j < cdatas.length; j++) {
        var a_cdata = cdatas[j];
        type = a_cdata.get_type();
        if (type === super_type) {
          super_cdata = a_cdata;
        } else {
          interface_cdatas.push(a_cdata);
        }
      }
      cdata.set_resolved(super_cdata, interface_cdatas);
      success_fn(cdata);
    }
    if (to_resolve.length > 0) {
      // if (parallel) {
      if (false) {
        return this._parallel_class_resolve(rs, to_resolve, process_resolved_classes, failure_fn, explicit);
      } else {
        return this._regular_class_resolve(rs, to_resolve, process_resolved_classes, failure_fn, explicit);
      }
    } else {
      // Everything is already resolved.
      return process_resolved_classes([]);
    }
  }

  // Synchronous method that checks if we have loaded a given method. If so,
  // it returns it. Otherwise, it throws an exception.
  // If null_handled is set, it simply returns null.
  public get_loaded_class(type_str: string, null_handled?:boolean): ClassData.ClassData {
    if (null_handled == null) {
      null_handled = false;
    }
    var cdata = this._get_class(type_str);
    if (cdata != null) {
      return cdata;
    }
    // If it's an array class, we might be able to get it synchronously...
    if (util.is_array_type(type_str)) {
      cdata = this._try_define_array_class(type_str);
      if (cdata != null) {
        return cdata;
      }
    }
    // If it's a primitive class, get it from the bootstrap classloader.
    if (util.is_primitive_type(type_str)) {
      return this.bootstrap.get_primitive_class(type_str);
    }
    if (null_handled) {
      return null;
    }
    throw new Error("Error in get_loaded_class: Class " + type_str + " is not loaded.");
  }

  // Synchronous method that checks if the given class is resolved
  // already, and returns it if so. If it is not, it throws an exception.
  // If null_handled is set, it simply returns null.
  public get_resolved_class(type_str: string, null_handled?:boolean): ClassData.ClassData {
    if (null_handled == null) {
      null_handled = false;
    }
    var cdata = this.get_loaded_class(type_str, null_handled);
    if (cdata != null && cdata.is_resolved()) {
      return cdata;
    }
    if (null_handled) {
      return null;
    }
    throw new Error("Error in get_resolved_class: Class " + type_str + " is not resolved.");
  }

  // Same as get_resolved_class, but for initialized classes.
  public get_initialized_class(type_str: string, null_handled?:boolean): ClassData.ClassData {
    if (null_handled == null) {
      null_handled = false;
    }
    var cdata = this.get_resolved_class(type_str, null_handled);
    if (cdata != null && cdata.is_initialized()) {
      return cdata;
    }
    if (null_handled) {
      return null;
    }
    throw new Error("Error in get_initialized_class: Class " + type_str + " is not initialized.");
  }

  // Asynchronously initializes the given class, and passes the ClassData
  // representation to success_fn.
  // Passes a callback to failure_fn that throws an exception in the event of
  // an error.
  // This function makes the assumption that cdata is a ReferenceClassData
  public _initialize_class(rs: runtime.RuntimeState, cdata: ClassData.ClassData, success_fn: (cd:ClassData.ClassData)=>void, failure_fn:(e_fn:()=>void, discardStackFrame?:boolean)=>void): void {
    var _this = this;

    trace("Actually initializing class " + (cdata.get_type()) + "...");
    if (!(cdata instanceof ClassData.ReferenceClassData)) {
      if (typeof UNSAFE !== "undefined" && UNSAFE !== null) {
        throw new Error("Tried to initialize a non-reference type: " + cdata.get_type());
      }
    }
    // Iterate through the class hierarchy, pushing StackFrames that run
    // <clinit> functions onto the stack. The last StackFrame pushed will be for
    // the <clinit> function of the topmost uninitialized class in the hierarchy.
    var first_clinit = true;
    var first_native_frame = threading.StackFrame.native_frame("$clinit", (function () {
      if (rs.curr_frame() !== first_native_frame) {
        throw new Error("The top of the meta stack should be this native frame, but it is not: " + (rs.curr_frame().name) + " at " + (rs.meta_stack().length()));
      }
      rs.meta_stack().pop();
      // success_fn is responsible for getting us back into the runtime state
      // execution loop.
      return rs.async_op(function () {
        return success_fn(cdata);
      });
    }), (function (e) {
        // This ClassData is not initialized since we failed.
        rs.curr_frame().cdata.reset();
        if (e instanceof JavaException) {
          // Rethrow e if it's a java/lang/NoClassDefFoundError. Why? 'Cuz HotSpot
          // does it.
          if (e.exception.cls.get_type() === 'Ljava/lang/NoClassDefFoundError;') {
            rs.meta_stack().pop();
            throw e;
          }
          // We hijack the current native frame to transform the exception into a
          // ExceptionInInitializerError, then call failure_fn to throw it.
          // failure_fn is responsible for getting us back into the runtime state
          // loop.
          // We don't use the java_throw helper since this Exception object takes
          // a Throwable as an argument.
          var nf = rs.curr_frame();
          nf.runner = function () {
            var rv = rs.pop();
            rs.meta_stack().pop();
            // Throw the exception.
            throw new JavaException(rv);
          };
          nf.error = function () {
            rs.meta_stack().pop();
            return failure_fn((function () {throw e;}));
          };
          var cls = <ClassData.ReferenceClassData> _this.bootstrap.get_resolved_class('Ljava/lang/ExceptionInInitializerError;');
          var v = new JavaObject(rs, cls);
          rs.push_array([v, v, e.exception]);
          return cls.method_lookup(rs, '<init>(Ljava/lang/Throwable;)V').setup_stack(rs);
        } else {
          // Not a Java exception?
          // No idea what this is; let's get outta dodge and rethrow it.
          rs.meta_stack().pop();
          throw e;
        }
      }));
    first_native_frame.cdata = cdata; // TODO: Rename vars.
    var class_file = cdata;
    while ((class_file != null) && !class_file.is_initialized()) {
      trace("initializing class: " + (class_file.get_type()));
      class_file.set_state(ClassState.INITIALIZED);

      // Run class initialization code. Superclasses get init'ed first.  We
      // don't want to call this more than once per class, so don't do dynamic
      // lookup. See spec [2.17.4][1].
      // [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/Concepts.doc.html#19075
      var clinit = class_file.get_method('<clinit>()V');
      if (clinit != null) {
        trace("\tFound <clinit>. Pushing stack frame.");
        // Push a native frame; needed to handle exceptions and the callback.
        if (first_clinit) {
          trace("\tFirst <clinit> in the loop.");
          first_clinit = false;
          // The first frame calls success_fn on success. Subsequent frames
          // are only used to handle exceptions.
          rs.meta_stack().push(first_native_frame);
        } else {
          var next_nf = threading.StackFrame.native_frame("$clinit_secondary", (function () {
            return rs.meta_stack().pop();
          }), (function (e) {
              // This ClassData is not initialized; reset its state.
              rs.curr_frame().cdata.reset();
              // Pop myself off.
              rs.meta_stack().pop();
              // Find the next Native Frame (prevents them from trying to run
              // their static initialization methods)
              while (!rs.curr_frame()["native"]) {
                rs.meta_stack().pop();
              }
              // Rethrow the Exception to pass it on to the next native frame.
              // The boolean value prevents failure_fn from discarding the current
              // stack frame.
              return rs.async_op((function () {
                failure_fn((function () {
                  throw e;
                }), true);
              }));
            }));
          next_nf.cdata = class_file;
          rs.meta_stack().push(next_nf);
        }
        clinit.setup_stack(rs);
      }
      class_file = class_file.get_super_class();
    }
    if (!first_clinit) {
      // Push ourselves back into the execution loop to run the <clinit> methods.
      rs.run_until_finished((function () { }), false, rs.stashed_done_cb);
      return;
    }
    // Classes did not have any clinit functions.
    success_fn(cdata);
  }

  // Asynchronously loads, resolves, and initializes the given class, and passes its
  // ClassData representation to success_fn.
  // Passes a callback to failure_fn that throws an exception in the event
  // of an error.
  // Set 'explicit' to 'true' if this is explicitly invoked by the program and
  // not by an internal JVM mechanism.
  public initialize_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd:ClassData.ClassData)=>void, failure_fn:(e_fn:()=>void)=>void, explicit?:boolean): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    trace("Initializing class " + type_str + "...");
    // Let's see if we can do this synchronously.
    // Note that primitive types are guaranteed to be created synchronously
    // here.
    var cdata = this.get_initialized_class(type_str, true);
    if (cdata != null) {
      return success_fn(cdata);
    }
    // If it's an array type, the asynchronous part only involves its
    // component type. Short circuit here.
    if (util.is_array_type(type_str)) {
      var component_type = util.get_component_type(type_str);
      // Component type doesn't need to be initialized; just resolved.
      this.resolve_class(rs, component_type, (function (cdata) {
        return success_fn(_this._define_array_class(type_str, cdata));
      }), failure_fn, explicit);
      return;
    }

    // Only reference types will make it to this point. :-)

    // Is it at least resolved?
    cdata = this.get_resolved_class(type_str, true);
    if (cdata != null) {
      return this._initialize_class(rs, cdata, success_fn, failure_fn);
    }
    // OK, OK. We'll have to asynchronously load it AND initialize it.
    return this.resolve_class(rs, type_str, (function (cdata) {
      // Check if it's initialized already. If this is a CustomClassLoader, it's
      // possible that the class has been retrieved from another ClassLoader,
      // and has already been initialized.
      if (cdata.is_initialized()) {
        return success_fn(cdata);
      } else {
        return _this._initialize_class(rs, cdata, success_fn, failure_fn);
      }
    }), failure_fn, explicit);
  }

  // Loads the class indicated by the given type_str. Passes the ClassFile
  // object for the class to success_fn.
  // Set 'explicit' to 'true' if this is explicitly invoked by the program and
  // not by an internal JVM mechanism.
  public resolve_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd:ClassData.ClassData)=>void, failure_fn:(e_fn:()=>void)=>void, explicit?:boolean): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    trace("Resolving class " + type_str + "... [general]");
    var rv = this.get_resolved_class(type_str, true);
    if (rv != null) {
      return success_fn(rv);
    }
    // If it's an array type, the asynchronous part only involves its
    // component type. Short circuit here.
    if (util.is_array_type(type_str)) {
      var component_type = util.get_component_type(type_str);
      this.resolve_class(rs, component_type, (function (cdata) {
        return success_fn(_this._define_array_class(type_str, cdata));
      }), failure_fn, explicit);
      return;
    }
    // Unresolved reference class. Let's resolve it.
    return this._resolve_class(rs, type_str, success_fn, failure_fn, explicit);
  }

  public _resolve_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd: ClassData.ClassData) => void , failure_fn: (e_fn: () => void ) => void , explicit?: boolean): void {
    throw new Error("Unimplemented.");
  }
}

// The Bootstrap ClassLoader. This is the only ClassLoader that can create
// primitive types.
export class BootstrapClassLoader extends ClassLoader {
  private jvm_state: JVM;

  constructor(jvm_state: JVM) {
    super(this);
    this.jvm_state = jvm_state;
  }

  public serialize(visited: {[n:string]:boolean}): any {
    if ('bootstrapLoader' in visited) {
      return '<*bootstrapLoader>';
    }
    visited['bootstrapLoader'] = true;
    var loaded = {};
    var loaded_classes = this.loaded_classes;
    for (var type in loaded_classes) {
      var cls = loaded_classes[type];
      if (type !== "__proto__") {
        loaded["" + type + "(" + (ClassState[cls.get_state()]) + ")"] = cls.loader.serialize(visited);
      }
    }
    return {
      ref: 'bootstrapLoader',
      loaded: loaded
    };
  }

  // Sets the reset bit on all of the classes in the CL to 1.
  // Causes the classes to be reset when they are first resolved.
  public reset(): void {
    var loaded_classes = this.loaded_classes;
    for (var cname in loaded_classes) {
      var cls = loaded_classes[cname];
      if (cname !== "__proto__") {
        cls.reset_bit = 1;
      }
    }
  }

  // Returns the given primitive class. Creates it if needed.
  public get_primitive_class(type_str: string): ClassData.PrimitiveClassData {
    var cdata = <ClassData.PrimitiveClassData>this._get_class(type_str);
    if (cdata != null) {
      return cdata;
    }
    cdata = new ClassData.PrimitiveClassData(type_str, this);
    this._add_class(type_str, cdata);
    return cdata;
  }

  // Asynchronously retrieves the given class, and passes its ClassData
  // representation to success_fn.
  // Passes a callback to failure_fn that throws an exception in the event
  // of an error.
  // Called only:
  // * With a type_str referring to a Reference Class.
  // * If the class is not already loaded.
  // Set 'explicit' to 'true' if this is explicitly invoked by the program and
  // not by an internal JVM mechanism.
  public _resolve_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd: ClassData.ClassData)=>void, failure_fn: (e_fn: ()=>void)=>void, explicit?: boolean): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    trace("ASYNCHRONOUS: resolve_class " + type_str + " [bootstrap]");
    var rv = this.get_resolved_class(type_str, true);
    if (rv != null) {
      return success_fn(rv);
    }
    this.jvm_state.read_classfile(type_str, (function (data) {
      // Fetch super class/interfaces in parallel.
      _this.define_class(rs, type_str, data, success_fn, failure_fn, true, explicit);
    }), (function (e) {
        try {
          e();
        } catch (exp) {
          trace("Failed to read class " + type_str + ": " + exp + "\n" + exp.stack);
        }
        return failure_fn(function () {
          // We create a new frame to create a NoClassDefFoundError and a
          // ClassNotFoundException.
          // TODO: Should probably have a better helper for these things
          // (asynchronous object creation)
          rs.meta_stack().push(threading.StackFrame.native_frame('$class_not_found', (function () {
            // Rewrite myself -- I have another method to run.
            rs.curr_frame().runner = function () {
              var rv = rs.pop();
              rs.meta_stack().pop();
              // Throw the exception.
              throw new JavaException(rv);
            };
            // If this was implicitly called by the JVM, we call NoClassDefFoundError.
            // If the program explicitly called this, then we throw the ClassNotFoundException.
            if (!explicit) {
              var rv = rs.pop();
              var cls = <ClassData.ReferenceClassData>_this.bootstrap.get_initialized_class('Ljava/lang/NoClassDefFoundError;');
              var v = new JavaObject(rs, cls);
              rs.push_array([v, v, rv]); // dup, ldc
              return cls.method_lookup(rs, '<init>(Ljava/lang/Throwable;)V').setup_stack(rs); // invokespecial
            }
          }), (function () {
              rs.meta_stack().pop();
              return failure_fn((function () {
                throw new Error('Failed to throw a ' + (explicit ? 'ClassNotFoundException' : 'NoClassDefFoundError') + '.');
              }));
            })));
          var cls = <ClassData.ReferenceClassData>_this.bootstrap.get_initialized_class('Ljava/lang/ClassNotFoundException;');
          var v = new JavaObject(rs, cls); // new
          var msg = rs.init_string(util.ext_classname(type_str));
          rs.push_array([v, v, msg]); // dup, ldc
          return cls.method_lookup(rs, '<init>(Ljava/lang/String;)V').setup_stack(rs); // invokespecial
        });
      }));
  }
}

export class CustomClassLoader extends ClassLoader {
  private loader_obj: java_object.JavaClassLoaderObject;
  // @loader_obj is the JavaObject for the java/lang/ClassLoader instance that
  // represents this ClassLoader.
  // @bootstrap is an instance of the bootstrap class loader.
  constructor(bootstrap: BootstrapClassLoader, loader_obj: java_object.JavaClassLoaderObject) {
    super(bootstrap);
    this.loader_obj = loader_obj;
  }

  public serialize(visited: {[name:string]:boolean}): any {
    return this.loader_obj.serialize(visited);
  }

  // Asynchronously retrieves the given class, and passes its ClassData
  // representation to success_fn.
  // Passes a callback to failure_fn that throws an exception in the event
  // of an error.
  // Called only:
  // * With a type_str referring to a Reference Class.
  // * If the class is not already loaded.
  public _resolve_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd:ClassData.ClassData)=>void, failure_fn: (e_fn:()=>void)=>void, explicit?:boolean): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    trace("ASYNCHRONOUS: resolve_class " + type_str + " [custom]");
    rs.meta_stack().push(threading.StackFrame.native_frame("$" + (this.loader_obj.cls.get_type()), (function () {
      var jclo = rs.pop();
      rs.meta_stack().pop();
      var cls = jclo.$cls;
      if (_this.get_resolved_class(type_str, true) == null) {
        // If loadClass delegated to another ClassLoader, it will not have called
        // defineClass on the result. If so, we will need to stash this class.
        _this._add_class(type_str, cls);
      }
      return rs.async_op(function () {
        return success_fn(cls);
      });
    }), (function (e) {
        rs.meta_stack().pop();
        // XXX: Convert the exception.
        return rs.async_op(function () {
          return failure_fn(function () {
            throw e;
          });
        });
      })));
    rs.push2(this.loader_obj, rs.init_string(util.ext_classname(type_str)));
    // We don't care about the return value of this function, as
    // define_class handles registering the ClassData with the class loader.
    // define_class also handles recalling resolve_class for any needed super
    // classes and interfaces.
    this.loader_obj.cls.method_lookup(rs, 'loadClass(Ljava/lang/String;)Ljava/lang/Class;').setup_stack(rs);
    // Push ourselves back into the execution loop to run the method.
    rs.run_until_finished((function () { }), false, rs.stashed_done_cb);
  }
}
