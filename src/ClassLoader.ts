import ClassData = module('./ClassData');
var ReferenceClassData = ClassData.ReferenceClassData, PrimitiveClassData = ClassData.PrimitiveClassData, ArrayClassData = ClassData.ArrayClassData;
import util = module('./util');
import logging = module('./logging');
var trace = logging.trace;
import runtime = module('./runtime');
var StackFrame = runtime.StackFrame;
import exceptions = module('./exceptions');
var JavaException = exceptions.JavaException;
import java_object = module('./java_object');
var JavaObject = java_object.JavaObject;

declare var UNSAFE;

export class ClassLoader {
  public bootstrap: BootstrapClassLoader;
  public loaded_classes: { [typestr: string]: ClassData.ClassData };

  constructor(bootstrap: BootstrapClassLoader) {
    this.bootstrap = bootstrap;
    this.loaded_classes = Object.create(null);
  }

  public get_package_names(): string[] {
    var classes, cls, pkg_names, _i, _len;

    classes = this.get_loaded_class_list(true);
    pkg_names = {};
    for (_i = 0, _len = classes.length; _i < _len; _i++) {
      cls = classes[_i];
      pkg_names[cls.substring(0, (cls.lastIndexOf('/')) + 1)] = true;
    }
    return Object.keys(pkg_names);
  }

  public get_loaded_class_list(ref_class_only?: bool): string[] {
    var cdata, k, _ref1, _results;

    if (ref_class_only == null) {
      ref_class_only = false;
    }
    if (ref_class_only) {
      _ref1 = this.loaded_classes;
      _results = [];
      for (k in _ref1) {
        cdata = _ref1[k];
        if (cdata.major_version != null) {
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
    var cdata;

    cdata = this.loaded_classes[type_str];
    if ((cdata != null ? cdata.reset_bit : void 0) === 1) {
      cdata.reset();
    }
    if (cdata != null) {
      return cdata;
    } else {
      return null;
    }
  }

  private _try_define_array_class(type_str: string): ClassData.ClassData {
    var component_cdata, component_type;

    component_type = util.get_component_type(type_str);
    component_cdata = this.get_resolved_class(component_type, true);
    if (component_cdata == null) {
      return null;
    }
    return this._define_array_class(type_str, component_cdata);
  }

  private _define_array_class(type_str: string, component_cdata: ClassData.ClassData): ClassData.ClassData {
    var cdata;

    if (component_cdata.get_class_loader() !== this) {
      return component_cdata.get_class_loader()._define_array_class(type_str, component_cdata);
    } else {
      cdata = new ArrayClassData(component_cdata.get_type(), this);
      this._add_class(type_str, cdata);
      cdata.set_resolved(this.bootstrap.get_resolved_class('Ljava/lang/Object;'), component_cdata);
      return cdata;
    }
  }

  private _parallel_class_resolve(rs: runtime.RuntimeState, types: string[], success_fn: (cds: ClassData.ClassData[])=>void, failure_fn: (e_cb:()=>void)=>void, explicit?:bool): void {
    var failure, fetch_data, pending_requests, request_finished, resolved, type, _i, _len, _results,
      _this = this;

    if (explicit == null) {
      explicit = false;
    }
    pending_requests = types.length;
    failure = null;
    resolved = [];
    request_finished = function () {
      pending_requests--;
      if (pending_requests === 0) {
        if (failure == null) {
          return success_fn(resolved);
        } else {
          return failure_fn(failure);
        }
      }
    };
    fetch_data = function (type) {
      return _this.resolve_class(rs, type, (function (cdata) {
        resolved.push(cdata);
        return request_finished();
      }), (function (f_fn) {
          failure = f_fn;
          return request_finished();
        }), explicit);
    };
    _results = [];
    for (_i = 0, _len = types.length; _i < _len; _i++) {
      type = types[_i];
      _results.push(fetch_data(type));
    }
    return _results;
  }

  private _regular_class_resolve(rs: runtime.RuntimeState, types: string[], success_fn: (cds: ClassData.ClassData[])=>void, failure_fn: (e_cb:()=>void)=>void, explicit?:bool): void {
    var fetch_class, resolved,
      _this = this;

    if (explicit == null) {
      explicit = false;
    }
    if (!(types.length > 0)) {
      return success_fn(null);
    }
    resolved = [];
    fetch_class = function (type) {
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

  public define_class(rs: runtime.RuntimeState, type_str: string, data: number[], success_fn: (cd:ClassData.ClassData)=>void, failure_fn: (e_cb:()=>void)=>void, parallel?: bool, explicit?:bool): void {
    var cdata, clsdata, msg, process_resolved_classes, resolved_already, to_resolve, type, types, _i, _len,
      _this = this;

    if (parallel == null) {
      parallel = false;
    }
    if (explicit == null) {
      explicit = false;
    }
    trace("Defining class " + type_str + "...");
    cdata = new ReferenceClassData(data, this);
    if ((type = cdata.get_type()) !== type_str) {
      msg = "" + (util.descriptor2typestr(type_str)) + " (wrong name: " + (util.descriptor2typestr(type)) + ")";
      return failure_fn((function () {
        rs.java_throw(_this.get_initialized_class('Ljava/lang/NoClassDefFoundError;'), msg);
      }));
    }
    this._add_class(type_str, cdata);
    types = cdata.get_interface_types();
    types.push(cdata.get_super_class_type());
    to_resolve = [];
    resolved_already = [];
    for (_i = 0, _len = types.length; _i < _len; _i++) {
      type = types[_i];
      if (type == null) {
        continue;
      }
      clsdata = this.get_resolved_class(type, true);
      if (clsdata != null) {
        resolved_already.push(clsdata);
      } else {
        to_resolve.push(type);
      }
    }
    process_resolved_classes = function (cdatas) {
      var a_cdata, interface_cdatas, super_cdata, super_type, _j, _len1;

      cdatas = resolved_already.concat(cdatas);
      super_cdata = null;
      interface_cdatas = [];
      super_type = cdata.get_super_class_type();
      for (_j = 0, _len1 = cdatas.length; _j < _len1; _j++) {
        a_cdata = cdatas[_j];
        type = a_cdata.get_type();
        if (type === super_type) {
          super_cdata = a_cdata;
        } else {
          interface_cdatas.push(a_cdata);
        }
      }
      cdata.set_resolved(super_cdata, interface_cdatas);
      return success_fn(cdata);
    };
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

  public get_loaded_class(type_str: string, null_handled?:bool): ClassData.ClassData {
    var cdata;

    if (null_handled == null) {
      null_handled = false;
    }
    cdata = this._get_class(type_str);
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

  public get_resolved_class(type_str: string, null_handled?:bool): ClassData.ClassData {
    if (null_handled == null) {
      null_handled = false;
    }
    var cdata = this.get_loaded_class(type_str, null_handled);
    if (cdata != null ? cdata.is_resolved() : void 0) {
      return cdata;
    }
    if (null_handled) {
      return null;
    }
    throw new Error("Error in get_resolved_class: Class " + type_str + " is not resolved.");
  }

  public get_initialized_class(type_str: string, null_handled?:bool): any {
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

  public _initialize_class(rs: runtime.RuntimeState, cdata: ClassData.ClassData, success_fn: (cd:ClassData.ClassData)=>void, failure_fn:(e_fn:()=>void, discardStackFrame?:bool)=>void): void {
    var class_file, clinit, next_nf,
      _this = this;

    trace("Actually initializing class " + (cdata.get_type()) + "...");
    if (!(cdata instanceof ReferenceClassData)) {
      if (typeof UNSAFE !== "undefined" && UNSAFE !== null) {
        throw new Error("Tried to initialize a non-reference type: " + cdata.get_type();
      }
    }
    var first_clinit = true;
    var first_native_frame = StackFrame.native_frame("$clinit", (function () {
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
          var cls = _this.bootstrap.get_resolved_class('Ljava/lang/ExceptionInInitializerError;');
          var v = new JavaObject(rs, cls);
          rs.push_array([v, v, e.exception]);
          return cls.method_lookup(rs, '<init>(Ljava/lang/Throwable;)V').setup_stack(rs);
        } else {
          rs.meta_stack().pop();
          throw e;
        }
      }));
    first_native_frame.cdata = cdata;
    class_file = cdata;
    while ((class_file != null) && !class_file.is_initialized()) {
      trace("initializing class: " + (class_file.get_type()));
      class_file.initialized = true;
      clinit = class_file.get_method('<clinit>()V');
      if (clinit != null) {
        trace("\tFound <clinit>. Pushing stack frame.");
        if (first_clinit) {
          trace("\tFirst <clinit> in the loop.");
          first_clinit = false;
          rs.meta_stack().push(first_native_frame);
        } else {
          next_nf = StackFrame.native_frame("$clinit_secondary", (function () {
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

  public initialize_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd:ClassData.ClassData)=>void, failure_fn:(e_fn:()=>void)=>void, explicit?:bool): void {
    var cdata, component_type,
      _this = this;

    if (explicit == null) {
      explicit = false;
    }
    trace("Initializing class " + type_str + "...");
    cdata = this.get_initialized_class(type_str, true);
    if (cdata != null) {
      return success_fn(cdata);
    }
    if (util.is_array_type(type_str)) {
      component_type = util.get_component_type(type_str);
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

  public resolve_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd:ClassData.ClassData)=>void, failure_fn:(e_fn:()=>void)=>void, explicit?:bool): void {
    var component_type, rv,
      _this = this;

    if (explicit == null) {
      explicit = false;
    }
    trace("Resolving class " + type_str + "... [general]");
    rv = this.get_resolved_class(type_str, true);
    if (rv != null) {
      return success_fn(rv);
    }
    if (util.is_array_type(type_str)) {
      component_type = util.get_component_type(type_str);
      this.resolve_class(rs, component_type, (function (cdata) {
        return success_fn(_this._define_array_class(type_str, cdata));
      }), failure_fn, explicit);
      return;
    }
    return this._resolve_class(rs, type_str, success_fn, failure_fn, explicit);
  }

  public _resolve_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd: ClassData.ClassData) => void , failure_fn: (e_fn: () => void ) => void , explicit?: bool): void {
    throw new Error("Unimplemented.");
  }
}

export class BootstrapClassLoader extends ClassLoader {
  private read_classfile: (typestr: string, success_cb: (data: number[]) => void, failure_cb: () => void) => void;
  constructor(read_classfile: (typestr: string, success_cb: (data: number[])=>void, failure_cb: ()=>void)=>void) {
    super(this);
    this.read_classfile = read_classfile;
  }

  public serialize(visited: {[n:string]:bool}): any {
    var cls, loaded, type, _ref1;

    if ('bootstrapLoader' in visited) {
      return '<*bootstrapLoader>';
    }
    visited['bootstrapLoader'] = true;
    loaded = {};
    _ref1 = this.loaded_classes;
    for (type in _ref1) {
      cls = _ref1[type];
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
    var cls, cname, _ref1;

    _ref1 = this.loaded_classes;
    for (cname in _ref1) {
      cls = _ref1[cname];
      if (cname !== "__proto__") {
        cls.reset_bit = 1;
      }
    }
  }

  public get_primitive_class(type_str: string): ClassData.PrimitiveClassData {
    var cdata;

    cdata = this._get_class(type_str);
    if (cdata != null) {
      return cdata;
    }
    cdata = new PrimitiveClassData(type_str, this);
    this._add_class(type_str, cdata);
    return cdata;
  }

  public _resolve_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd: ClassData.ClassData)=>void, failure_fn: (e_fn: ()=>void)=>void, explicit?: bool): void {
    var rv,
      _this = this;

    if (explicit == null) {
      explicit = false;
    }
    trace("ASYNCHRONOUS: resolve_class " + type_str + " [bootstrap]");
    rv = this.get_resolved_class(type_str, true);
    if (rv != null) {
      return success_fn(rv);
    }
    this.read_classfile(type_str, (function (data) {
      _this.define_class(rs, type_str, data, success_fn, failure_fn, true, explicit);
    }), (function () {
        return failure_fn(function () {
          var cls, msg, v;

          rs.meta_stack().push(StackFrame.native_frame('$class_not_found', (function () {
            var cls, v;

            rs.curr_frame().runner = function () {
              rv = rs.pop();
              rs.meta_stack().pop();
              throw new JavaException(rv);
            };
            if (!explicit) {
              rv = rs.pop();
              cls = _this.bootstrap.get_initialized_class('Ljava/lang/NoClassDefFoundError;');
              v = new JavaObject(rs, cls);
              rs.push_array([v, v, rv]);
              return cls.method_lookup(rs, '<init>(Ljava/lang/Throwable;)V').setup_stack(rs);
            }
          }), (function () {
              rs.meta_stack().pop();
              return failure_fn((function () {
                throw new Error('Failed to throw a ' + (explicit ? 'ClassNotFoundException' : 'NoClassDefFoundError') + '.');
              }));
            })));
          cls = _this.bootstrap.get_initialized_class('Ljava/lang/ClassNotFoundException;');
          v = new JavaObject(rs, cls);
          msg = rs.init_string(util.ext_classname(type_str));
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

  public serialize(visited: {[name:string]:bool}): any {
    return this.loader_obj.serialize(visited);
  }

  public _resolve_class(rs: runtime.RuntimeState, type_str: string, success_fn: (cd:ClassData.ClassData)=>void, failure_fn: (e_fn:()=>void)=>void, explicit?:bool): void {
    var _this = this;

    if (explicit == null) {
      explicit = false;
    }
    trace("ASYNCHRONOUS: resolve_class " + type_str + " [custom]");
    rs.meta_stack().push(StackFrame.native_frame("$" + (this.loader_obj.cls.get_type()), (function () {
      var cls, jclo;

      jclo = rs.pop();
      rs.meta_stack().pop();
      cls = jclo.$cls;
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
