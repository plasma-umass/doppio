"use strict";
/// <amd-dependency path="./ClassData" />
import ClassData = require('./ClassData');
var ReferenceClassData = ClassData.ReferenceClassData, PrimitiveClassData = ClassData.PrimitiveClassData, ArrayClassData = ClassData.ArrayClassData;
/// <amd-dependency path="./util" />
import util = require('./util');
/// <amd-dependency path="./logging" />
import logging = require('./logging');
var trace = logging.trace;
import runtime = require('./runtime');
/// <amd-dependency path="./exceptions" />
import exceptions = require('./exceptions');
var JavaException = exceptions.JavaException;
/// <amd-dependency path="./java_object" />
import java_object = require('./java_object');
var JavaObject = java_object.JavaObject;

declare var UNSAFE: boolean;

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

  public get_package_names(): string[] {
    var classes = this.get_loaded_class_list(true);
    var pkg_names: {[key:string]:boolean} = {};
    for (var _i = 0, _len = classes.length; _i < _len; _i++) {
      var cls = classes[_i];
      pkg_names[cls.substring(0, (cls.lastIndexOf('/')) + 1)] = true;
    }
    return Object.keys(pkg_names);
  }

  public get_loaded_class_list(ref_class_only?: boolean): string[] {
    if (ref_class_only == null) {
      ref_class_only = false;
    }
    if (ref_class_only) {
      var _ref1 = this.loaded_classes;
      var _results: string[] = [];
      for (var k in _ref1) {
        var cdata = _ref1[k];
        if ('major_version' in cdata) {
          _results.push(k.slice(1, -1));
        }
      }
      return _results;
    } else {
      return Object.keys(this.loaded_classes);
    }
  }

  public remove_class(type_str: string): void {
    var cdata, k, _ref1;

    this._rem_class(type_str);
    if (util.is_primitive_type(type_str)) {
      return;
    }
    _ref1 = this.loaded_classes;
    for (k in _ref1) {
      cdata = _ref1[k];
      if (type_str === (typeof cdata.get_component_type === "function" ? cdata.get_component_type() : void 0) || type_str === cdata.get_super_class_type()) {
        this.remove_class(k);
      }
    }
  }

  private _rem_class(type_str: string): void {
    delete this.loaded_classes[type_str];
  }

  public _add_class(type_str: string, cdata: ClassData.ClassData): void {
    this.loaded_classes[type_str] = cdata;
  }

  public _get_class(type_str: string): ClassData.ClassData {
    var cdata = this.loaded_classes[type_str];
    if (cdata != null && cdata.reset_bit === 1) {
      cdata.reset();
    }
    if (cdata != null) {
      return cdata;
    } else {
      return null;
    }
  }

  private _try_define_array_class(type_str: string): ClassData.ClassData {
    var component_type = util.get_component_type(type_str);
    var component_cdata = this.get_resolved_class(component_type, true);
    if (component_cdata == null) {
      return null;
    }
    return this._define_array_class(type_str, component_cdata);
  }

  private _define_array_class(type_str: string, component_cdata: ClassData.ClassData): ClassData.ClassData {
    if (component_cdata.get_class_loader() !== this) {
      return component_cdata.get_class_loader()._define_array_class(type_str, component_cdata);
    } else {
      var cdata = new ArrayClassData(component_cdata.get_type(), this);
      this._add_class(type_str, cdata);
      cdata.set_resolved(this.bootstrap.get_resolved_class('Ljava/lang/Object;'), component_cdata);
      return cdata;
    }
  }

  private _parallel_class_resolve(rs: runtime.RuntimeState, types: string[], success_fn: (cds: ClassData.ClassData[])=>void, failure_fn: (e_cb:()=>void)=>void, explicit?:boolean): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    var pending_requests = types.length;
    var failure = null;
    var resolved: ClassData.ClassData[] = [];
    var request_finished = function () {
      pending_requests--;
      if (pending_requests === 0) {
        if (failure == null) {
          return success_fn(resolved);
        } else {
          return failure_fn(failure);
        }
      }
    };
    var fetch_data = function (type: string) {
      return _this.resolve_class(rs, type, (function (cdata) {
        resolved.push(cdata);
        return request_finished();
      }), (function (f_fn) {
          failure = f_fn;
          return request_finished();
        }), explicit);
    };
    for (var _i = 0, _len = types.length; _i < _len; _i++) {
      fetch_data(types[_i]);
    }
  }

  private _regular_class_resolve(rs: runtime.RuntimeState, types: string[], success_fn: (cds: ClassData.ClassData[])=>void, failure_fn: (e_cb:()=>void)=>void, explicit?:boolean): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    if (!(types.length > 0)) {
      return success_fn(null);
    }
    var resolved: ClassData.ClassData[] = [];
    var fetch_class = function (type: string) {
      return _this.resolve_class(rs, type, (function (cdata) {
        resolved.push(cdata);
        if (types.length > 0) {
          return fetch_class(types.shift());
        } else {
          return success_fn(resolved);
        }
      }), failure_fn, explicit);
    };
    return fetch_class(types.shift());
  }

  public define_class(rs: runtime.RuntimeState, type_str: string, data: NodeBuffer, success_fn: (cd:ClassData.ClassData)=>void, failure_fn: (e_cb:()=>void)=>void, parallel?: boolean, explicit?:boolean): void {
    var _this = this;

    if (parallel == null) {
      parallel = false;
    }
    if (explicit == null) {
      explicit = false;
    }
    trace("Defining class " + type_str + "...");
    var cdata = new ReferenceClassData(data, this);
    var type = cdata.get_type();
    if (type !== type_str) {
      var msg = util.descriptor2typestr(type_str) + " (wrong name: " + util.descriptor2typestr(type) + ")";
      return failure_fn((function () {
        var err_cls = <ClassData.ReferenceClassData> _this.get_initialized_class('Ljava/lang/NoClassDefFoundError;');
        rs.java_throw(err_cls, msg);
      }));
    }
    this._add_class(type_str, cdata);
    var types = cdata.get_interface_types();
    types.push(cdata.get_super_class_type());
    var to_resolve: string[] = [];
    var resolved_already: ClassData.ReferenceClassData[] = [];
    for (var _i = 0, _len = types.length; _i < _len; _i++) {
      type = types[_i];
      if (type == null) {
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
      for (var _j = 0, _len1 = cdatas.length; _j < _len1; _j++) {
        var a_cdata = cdatas[_j];
        type = a_cdata.get_type();
        if (type === super_type) {
          super_cdata = a_cdata;
        } else {
          interface_cdatas.push(a_cdata);
        }
      }
      cdata.set_resolved(super_cdata, interface_cdatas);
      return success_fn(cdata);
    }
    if (to_resolve.length > 0) {
      if (false) {
        return this._parallel_class_resolve(rs, to_resolve, process_resolved_classes, failure_fn, explicit);
      } else {
        return this._regular_class_resolve(rs, to_resolve, process_resolved_classes, failure_fn, explicit);
      }
    } else {
      return process_resolved_classes([]);
    }
  }

  public get_loaded_class(type_str: string, null_handled?:boolean): ClassData.ClassData {
    if (null_handled == null) {
      null_handled = false;
    }
    var cdata = this._get_class(type_str);
    if (cdata != null) {
      return cdata;
    }
    if (util.is_array_type(type_str)) {
      cdata = this._try_define_array_class(type_str);
      if (cdata != null) {
        return cdata;
      }
    }
    if (util.is_primitive_type(type_str)) {
      return this.bootstrap.get_primitive_class(type_str);
    }
    if (null_handled) {
      return null;
    }
    throw new Error("Error in get_loaded_class: Class " + type_str + " is not loaded.");
  }

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

  public _initialize_class(rs: runtime.RuntimeState, cdata: ClassData.ClassData, success_fn: (cd:ClassData.ClassData)=>void, failure_fn:(e_fn:()=>void, discardStackFrame?:boolean)=>void): void {
    var _this = this;

    trace("Actually initializing class " + (cdata.get_type()) + "...");
    if (!(cdata instanceof ReferenceClassData)) {
      if (typeof UNSAFE !== "undefined" && UNSAFE !== null) {
        throw new Error("Tried to initialize a non-reference type: " + cdata.get_type());
      }
    }
    var first_clinit = true;
    var first_native_frame = rs.construct_nativeframe("$clinit", (function () {
      if (rs.curr_frame() !== first_native_frame) {
        throw new Error("The top of the meta stack should be this native frame, but it is not: " + (rs.curr_frame().name) + " at " + (rs.meta_stack().length()));
      }
      rs.meta_stack().pop();
      return rs.async_op(function () {
        return success_fn(cdata);
      });
    }), (function (e) {
        rs.curr_frame().cdata.reset();
        if (e instanceof JavaException) {
          if (e.exception.cls.get_type() === 'Ljava/lang/NoClassDefFoundError;') {
            rs.meta_stack().pop();
            throw e;
          }
          var nf = rs.curr_frame();
          nf.runner = function () {
            var rv = rs.pop();
            rs.meta_stack().pop();
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
          rs.meta_stack().pop();
          throw e;
        }
      }));
    first_native_frame.cdata = cdata;
    var class_file = cdata;
    while ((class_file != null) && !class_file.is_initialized()) {
      trace("initializing class: " + (class_file.get_type()));
      class_file.initialized = true;
      var clinit = class_file.get_method('<clinit>()V');
      if (clinit != null) {
        trace("\tFound <clinit>. Pushing stack frame.");
        if (first_clinit) {
          trace("\tFirst <clinit> in the loop.");
          first_clinit = false;
          rs.meta_stack().push(first_native_frame);
        } else {
          var next_nf = rs.construct_nativeframe("$clinit_secondary", (function () {
            return rs.meta_stack().pop();
          }), (function (e) {
              rs.curr_frame().cdata.reset();
              rs.meta_stack().pop();
              while (!rs.curr_frame()["native"]) {
                rs.meta_stack().pop();
              }
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
      rs.run_until_finished((function () { }), false, rs.stashed_done_cb);
      return;
    }
    success_fn(cdata);
  }

  public initialize_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd:ClassData.ClassData)=>void, failure_fn:(e_fn:()=>void)=>void, explicit?:boolean): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    trace("Initializing class " + type_str + "...");
    var cdata = this.get_initialized_class(type_str, true);
    if (cdata != null) {
      return success_fn(cdata);
    }
    if (util.is_array_type(type_str)) {
      var component_type = util.get_component_type(type_str);
      this.resolve_class(rs, component_type, (function (cdata) {
        return success_fn(_this._define_array_class(type_str, cdata));
      }), failure_fn, explicit);
      return;
    }
    cdata = this.get_resolved_class(type_str, true);
    if (cdata != null) {
      return this._initialize_class(rs, cdata, success_fn, failure_fn);
    }
    return this.resolve_class(rs, type_str, (function (cdata) {
      if (cdata.is_initialized(rs)) {
        return success_fn(cdata);
      } else {
        return _this._initialize_class(rs, cdata, success_fn, failure_fn);
      }
    }), failure_fn, explicit);
  }

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
    if (util.is_array_type(type_str)) {
      var component_type = util.get_component_type(type_str);
      this.resolve_class(rs, component_type, (function (cdata) {
        return success_fn(_this._define_array_class(type_str, cdata));
      }), failure_fn, explicit);
      return;
    }
    return this._resolve_class(rs, type_str, success_fn, failure_fn, explicit);
  }

  public _resolve_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd: ClassData.ClassData) => void , failure_fn: (e_fn: () => void ) => void , explicit?: boolean): void {
    throw new Error("Unimplemented.");
  }
}

export class BootstrapClassLoader extends ClassLoader {
  private read_classfile: (typestr: string, success_cb: (data: NodeBuffer) => void, failure_cb: (exp_cb: ()=>void) => void) => void;
  constructor(read_classfile: (typestr: string, success_cb: (data: NodeBuffer)=>void, failure_cb: ()=>void)=>void) {
    super(this);
    this.read_classfile = read_classfile;
  }

  public serialize(visited: {[n:string]:boolean}): any {
    if ('bootstrapLoader' in visited) {
      return '<*bootstrapLoader>';
    }
    visited['bootstrapLoader'] = true;
    var loaded = {};
    var _ref1 = this.loaded_classes;
    for (var type in _ref1) {
      var cls = _ref1[type];
      if (type !== "__proto__") {
        loaded["" + type + "(" + (cls.getLoadState()) + ")"] = cls.loader.serialize(visited);
      }
    }
    return {
      ref: 'bootstrapLoader',
      loaded: loaded
    };
  }

  public reset(): void {
    var _ref1 = this.loaded_classes;
    for (var cname in _ref1) {
      var cls = _ref1[cname];
      if (cname !== "__proto__") {
        cls.reset_bit = 1;
      }
    }
  }

  public get_primitive_class(type_str: string): ClassData.PrimitiveClassData {
    var cdata = <ClassData.PrimitiveClassData>this._get_class(type_str);
    if (cdata != null) {
      return cdata;
    }
    cdata = new PrimitiveClassData(type_str, this);
    this._add_class(type_str, cdata);
    return cdata;
  }

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
    this.read_classfile(type_str, (function (data) {
      _this.define_class(rs, type_str, data, success_fn, failure_fn, true, explicit);
    }), (function (e) {
        try {
          e();
        } catch (exp) {
          trace("Failed to read class " + type_str + ": " + exp + "\n" + exp.stack);
        }
        return failure_fn(function () {
          rs.meta_stack().push(rs.construct_nativeframe('$class_not_found', (function () {
            rs.curr_frame().runner = function () {
              var rv = rs.pop();
              rs.meta_stack().pop();
              throw new JavaException(rv);
            };
            if (!explicit) {
              var rv = rs.pop();
              var cls = <ClassData.ReferenceClassData>_this.bootstrap.get_initialized_class('Ljava/lang/NoClassDefFoundError;');
              var v = new JavaObject(rs, cls);
              rs.push_array([v, v, rv]);
              return cls.method_lookup(rs, '<init>(Ljava/lang/Throwable;)V').setup_stack(rs);
            }
          }), (function () {
              rs.meta_stack().pop();
              return failure_fn((function () {
                throw new Error('Failed to throw a ' + (explicit ? 'ClassNotFoundException' : 'NoClassDefFoundError') + '.');
              }));
            })));
          var cls = <ClassData.ReferenceClassData>_this.bootstrap.get_initialized_class('Ljava/lang/ClassNotFoundException;');
          var v = new JavaObject(rs, cls);
          var msg = rs.init_string(util.ext_classname(type_str));
          rs.push_array([v, v, msg]);
          return cls.method_lookup(rs, '<init>(Ljava/lang/String;)V').setup_stack(rs);
        });
      }));
  }
}

export class CustomClassLoader extends ClassLoader {
  private loader_obj: java_object.JavaClassLoaderObject;
  constructor(bootstrap: BootstrapClassLoader, loader_obj: java_object.JavaClassLoaderObject) {
    super(bootstrap);
    this.loader_obj = loader_obj;
  }

  public serialize(visited: {[name:string]:boolean}): any {
    return this.loader_obj.serialize(visited);
  }

  public _resolve_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd:ClassData.ClassData)=>void, failure_fn: (e_fn:()=>void)=>void, explicit?:boolean): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    trace("ASYNCHRONOUS: resolve_class " + type_str + " [custom]");
    rs.meta_stack().push(rs.construct_nativeframe("$" + (this.loader_obj.cls.get_type()), (function () {
      var jclo = rs.pop();
      rs.meta_stack().pop();
      var cls = jclo.$cls;
      if (_this.get_resolved_class(type_str, true) == null) {
        _this._add_class(type_str, cls);
      }
      return rs.async_op(function () {
        return success_fn(cls);
      });
    }), (function (e) {
        rs.meta_stack().pop();
        return rs.async_op(function () {
          return failure_fn(function () {
            throw e;
          });
        });
      })));
    rs.push2(this.loader_obj, rs.init_string(util.ext_classname(type_str)));
    this.loader_obj.cls.method_lookup(rs, 'loadClass(Ljava/lang/String;)Ljava/lang/Class;').setup_stack(rs);
    rs.run_until_finished((function () { }), false, rs.stashed_done_cb);
  }
}
