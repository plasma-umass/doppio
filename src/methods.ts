
var underscore = require('../vendor/_.js');
import util = module('./util');
import opcodes = module('./opcodes');
import attributes = module('./attributes');
import natives = module('./natives');
import runtime = module('./runtime');
import logging = module('./logging');
import JVM = module('./jvm');
import exceptions = module('./exceptions');
import java_object = module('./java_object');
import ConstantPool = module('./ConstantPool');


var ReturnException = exceptions.ReturnException;
var vtrace = logging.vtrace, trace = logging.trace, debug_vars = logging.debug_vars, native_methods = natives.native_methods, trapped_methods = natives.trapped_methods;
var JavaArray = java_object.JavaArray;
var JavaObject = java_object.JavaObject;
var thread_name = java_object.thread_name;
declare var RELEASE;

export class AbstractMethodField {
  public cls: any;
  public idx: number;
  public access_byte: number;
  public access_flags: util.Flags;
  public name: string;
  public raw_descriptor: string;
  public attrs: attributes.Attribute[];

  constructor(cls) {
    this.cls = cls;
  }

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, idx: number): void {
    this.idx = idx;
    this.access_byte = bytes_array.get_uint(2);
    this.access_flags = util.parse_flags(this.access_byte);
    this.name = constant_pool.get(bytes_array.get_uint(2)).value;
    this.raw_descriptor = constant_pool.get(bytes_array.get_uint(2)).value;
    this.parse_descriptor(this.raw_descriptor);
    this.attrs = attributes.make_attributes(bytes_array, constant_pool);
  }

  public get_attribute(name: string): attributes.Attribute {
    var attr, _i, _len, _ref1;

    _ref1 = this.attrs;
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      attr = _ref1[_i];
      if (attr.name === name) {
        return attr;
      }
    }
    return null;
  }

  public get_attributes(name: string): attributes.Attribute[] {
    var attr, _i, _len, _ref1, _results;

    _ref1 = this.attrs;
    _results = [];
    for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
      attr = _ref1[_i];
      if (attr.name === name) {
        _results.push(attr);
      }
    }
    return _results;
  }

  // To satiate TypeScript. Consider it an 'abstract' method.
  public parse_descriptor(raw_descriptor: string) {
    throw new Error("Unimplemented error.");
  }
}

export class Field extends AbstractMethodField {
  private type: string;

  public parse_descriptor(raw_descriptor: string) {
    return this.type = raw_descriptor;
  }

  public reflector(rs: runtime.RuntimeState, success_fn: (reflectedField: java_object.JavaObject)=>void, failure_fn: (e_fn: ()=>void)=>void): void {
    var clazz_obj, create_obj, sig, _ref2,
      _this = this;

    sig = (_ref2 = underscore.find(this.attrs, function (a) {
      return a.name === "Signature";
    })) != null ? _ref2.sig : void 0;
    create_obj = function (clazz_obj: java_object.JavaClassObject, type_obj: java_object.JavaObject) {
      return new JavaObject(rs, rs.get_bs_class('Ljava/lang/reflect/Field;'), {
        'Ljava/lang/reflect/Field;clazz': clazz_obj,
        'Ljava/lang/reflect/Field;name': rs.init_string(_this.name, true),
        'Ljava/lang/reflect/Field;type': type_obj,
        'Ljava/lang/reflect/Field;modifiers': _this.access_byte,
        'Ljava/lang/reflect/Field;slot': _this.idx,
        'Ljava/lang/reflect/Field;signature': sig != null ? rs.init_string(sig) : null
      });
    };
    clazz_obj = this.cls.get_class_object(rs);
    this.cls.loader.resolve_class(rs, this.type, (function (type_cls) {
      var rv, type_obj;

      type_obj = type_cls.get_class_object(rs);
      rv = create_obj(clazz_obj, type_obj);
      success_fn(rv);
    }), failure_fn);
  }
}

export class Method extends AbstractMethodField {
  private reset_caches: bool;
  private param_types: string[];
  private param_bytes: number;
  private num_args: number;
  private return_type: string;
  // Code is either a function, or a CodeAttribute. We should have a factory method
  // that constructs NativeMethod objects and BytecodeMethod objects.
  public code: any;
  public has_bytecode: bool;

  public parse_descriptor(raw_descriptor: string): void {
    var field, p, param_carr, param_str, return_str, __, _i, _len, _ref3, _ref4;

    this.reset_caches = false;
    _ref3 = /\(([^)]*)\)(.*)/.exec(raw_descriptor), __ = _ref3[0], param_str = _ref3[1], return_str = _ref3[2];
    param_carr = param_str.split('');
    this.param_types = ((function () {
      var _results;

      _results = [];
      while ((field = util.carr2descriptor(param_carr))) {
        _results.push(field);
      }
      return _results;
    })());
    this.param_bytes = 0;
    _ref4 = this.param_types;
    for (_i = 0, _len = _ref4.length; _i < _len; _i++) {
      p = _ref4[_i];
      this.param_bytes += p === 'D' || p === 'J' ? 2 : 1;
    }
    if (!this.access_flags["static"]) {
      this.param_bytes++;
    }
    this.num_args = this.param_types.length;
    if (!this.access_flags["static"]) {
      this.num_args++;
    }
    this.return_type = return_str;
  }

  public full_signature(): string {
    return "" + (this.cls.get_type()) + "::" + this.name + this.raw_descriptor;
  }

  public parse(bytes_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, idx: number): void {
    var c, sig;
    super.parse(bytes_array, constant_pool, idx);
    sig = this.full_signature();
    if ((c = trapped_methods[sig]) != null) {
      this.code = c;
      this.access_flags["native"] = true;
    } else if (this.access_flags["native"]) {
      if ((c = native_methods[sig]) != null) {
        return this.code = c;
      } else if (sig.indexOf('::registerNatives()V', 1) < 0 && sig.indexOf('::initIDs()V', 1) < 0) {
        if (JVM.show_NYI_natives) {
          console.log(sig);
        }
        this.code = function (rs) {
          return rs.java_throw(rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), "Native method '" + sig + "' not implemented.\nPlease fix or file a bug at https://github.com/int3/doppio/issues");
        };
      } else {
        return this.code = null;
      }
    } else {
      this.has_bytecode = true;
      this.code = underscore.find(this.attrs, function (a) {
        return a.name === 'Code';
      });
    }
  }

  public reflector(rs: runtime.RuntimeState, is_constructor: bool, success_fn: (reflectedMethod: java_object.JavaObject)=>void, failure_fn: (e_fn: ()=>void)=>void): void {
    var adefs, anns, clazz_obj, exceptions, obj, sig, typestr, _ref3, _ref4, _ref5, _ref6, _ref7,
      _this = this;

    if (is_constructor == null) {
      is_constructor = false;
    }
    typestr = is_constructor ? 'Ljava/lang/reflect/Constructor;' : 'Ljava/lang/reflect/Method;';
    exceptions = (_ref3 = (_ref4 = underscore.find(this.attrs, function (a) {
      return a.name === 'Exceptions';
    })) != null ? _ref4.exceptions : void 0) != null ? _ref3 : [];
    anns = (_ref5 = underscore.find(this.attrs, function (a) {
      return a.name === 'RuntimeVisibleAnnotations';
    })) != null ? _ref5.raw_bytes : void 0;
    adefs = (_ref6 = underscore.find(this.attrs, function (a) {
      return a.name === 'AnnotationDefault';
    })) != null ? _ref6.raw_bytes : void 0;
    sig = (_ref7 = underscore.find(this.attrs, function (a) {
      return a.name === 'Signature';
    })) != null ? _ref7.sig : void 0;
    obj = {};
    clazz_obj = this.cls.get_class_object(rs);
    this.cls.loader.resolve_class(rs, this.return_type, (function (rt_cls) {
      var etype_objs, fetch_catch_type, fetch_etype, fetch_ptype, handlers, i, j, k, param_type_objs, rt_obj, _ref8;

      rt_obj = rt_cls.get_class_object(rs);
      j = -1;
      etype_objs = [];
      i = -1;
      param_type_objs = [];
      k = 0;
      if ((((_ref8 = _this.code) != null ? _ref8.exception_handlers : void 0) != null) && _this.code.exception_handlers.length > 0) {
        handlers = [
          {
            catch_type: 'Ljava/lang/Throwable;'
          }
        ];
        Array.prototype.push.apply(handlers, _this.code.exception_handlers);
      } else {
        handlers = [];
      }
      fetch_catch_type = function () {
        var eh;

        if (k < handlers.length) {
          eh = handlers[k++];
          if (eh.catch_type === '<any>') {
            return fetch_catch_type();
          }
          return _this.cls.loader.resolve_class(rs, eh.catch_type, fetch_catch_type, failure_fn);
        } else {
          return fetch_ptype();
        }
      };
      fetch_etype = function () {
        var e_desc;

        j++;
        if (j < exceptions.length) {
          e_desc = exceptions[j];
          return _this.cls.loader.resolve_class(rs, e_desc, (function (cls) {
            etype_objs[j] = cls.get_class_object(rs);
            return fetch_etype();
          }), failure_fn);
        } else {
          obj[typestr + 'clazz'] = clazz_obj;
          obj[typestr + 'name'] = rs.init_string(_this.name, true);
          obj[typestr + 'parameterTypes'] = new JavaArray(rs, rs.get_bs_class('[Ljava/lang/Class;'), param_type_objs);
          obj[typestr + 'returnType'] = rt_obj;
          obj[typestr + 'exceptionTypes'] = new JavaArray(rs, rs.get_bs_class('[Ljava/lang/Class;'), etype_objs);
          obj[typestr + 'modifiers'] = _this.access_byte;
          obj[typestr + 'slot'] = _this.idx;
          obj[typestr + 'signature'] = sig != null ? rs.init_string(sig) : null;
          obj[typestr + 'annotations'] = anns != null ? new JavaArray(rs, rs.get_bs_class('[B'), anns) : null;
          obj[typestr + 'annotationDefault'] = adefs != null ? new JavaArray(rs, rs.get_bs_class('[B'), adefs) : null;
          return success_fn(new JavaObject(rs, rs.get_bs_class(typestr), obj));
        }
      };
      fetch_ptype = function () {
        i++;
        if (i < _this.param_types.length) {
          return _this.cls.loader.resolve_class(rs, _this.param_types[i], (function (cls) {
            param_type_objs[i] = cls.get_class_object(rs);
            return fetch_ptype();
          }), failure_fn);
        } else {
          return fetch_etype();
        }
      };
      return fetch_catch_type();
    }), failure_fn);
  }

  public take_params(caller_stack: any[]): any[] {
    var params, start;

    start = caller_stack.length - this.param_bytes;
    params = caller_stack.slice(start);
    caller_stack.length -= this.param_bytes;
    return params;
  }

  public convert_params(rs: runtime.RuntimeState, params: any[]): any[] {
    var converted_params, p, param_idx, _i, _len, _ref3;

    converted_params = [rs];
    param_idx = 0;
    if (!this.access_flags["static"]) {
      converted_params.push(params[0]);
      param_idx = 1;
    }
    _ref3 = this.param_types;
    for (_i = 0, _len = _ref3.length; _i < _len; _i++) {
      p = _ref3[_i];
      converted_params.push(params[param_idx]);
      param_idx += (p === 'J' || p === 'D') ? 2 : 1;
    }
    return converted_params;
  }

  public run_manually(func: Function, rs: runtime.RuntimeState, converted_params: any[]): void {
    var e, ret_type, rv;

    trace("entering native method " + (this.full_signature()));
    try {
      rv = func.apply(null, converted_params);
    } catch (_error) {
      e = _error;
      if (e === ReturnException) {
        return;
      }
      throw e;
    }
    rs.meta_stack().pop();
    ret_type = this.return_type;
    if (ret_type !== 'V') {
      if (ret_type === 'Z') {
        rs.push(rv + 0);
      } else {
        rs.push(rv);
      }
      if (ret_type === 'J' || ret_type === 'D') {
        rs.push(null);
      }
    }
  }

  public initialize(): void {
    this.reset_caches = true;
  }

  public method_lock(rs: runtime.RuntimeState): any {
    if (this.access_flags["static"]) {
      return this.cls.get_class_object(rs);
    } else {
      return rs.cl(0);
    }
  }

  public run_bytecode(rs: runtime.RuntimeState): void {
    var annotation, cf, code, depth, instr, op, pc, _i, _len, _ref3, _ref4;

    trace("entering method " + (this.full_signature()));
    if (this.reset_caches && (((_ref3 = this.code) != null ? _ref3.opcodes : void 0) != null)) {
      _ref4 = this.code.opcodes;
      for (_i = 0, _len = _ref4.length; _i < _len; _i++) {
        instr = _ref4[_i];
        if (instr != null) {
          instr.reset_cache();
        }
      }
    }
    code = this.code.opcodes;
    cf = rs.curr_frame();
    if (this.access_flags.synchronized && cf.pc === 0) {
      if (!opcodes.monitorenter(rs, this.method_lock(rs))) {
        cf.pc = 0;
        return;
      }
    }
    op = code[cf.pc];
    while (true) {
      if (!((typeof RELEASE !== "undefined" && RELEASE !== null) || logging.log_level < logging.VTRACE)) {
        pc = cf.pc;
        if (!op) {
          throw "" + this.name + ":" + pc + " => (null)";
        }
        annotation = op.annotate(pc, this.cls.constant_pool);
      }
      if (op.execute(rs) === false) {
        break;
      }
      if (!((typeof RELEASE !== "undefined" && RELEASE !== null) || logging.log_level < logging.VTRACE)) {
        vtrace(("" + (this.cls.get_type()) + "::" + this.name + ":" + pc + " => " + op.name) + annotation);
        depth = rs.meta_stack().length();
        vtrace("D: " + depth + ", S: [" + (debug_vars(cf.stack)) + "], L: [" + (debug_vars(cf.locals)) + "], T: " + (rs.curr_thread.get_field != null ? thread_name(rs, rs.curr_thread) : ""));
      }
      cf.pc += 1 + op.byte_count;
      op = code[cf.pc];
    }
  }

  public setup_stack(runtime_state: runtime.RuntimeState): runtime.StackFrame {
    var c, c_params, caller_stack, i, ms, params, sf: runtime.StackFrame, _ref3,
      _this = this;

    ms = runtime_state.meta_stack();
    caller_stack = runtime_state.curr_frame().stack;
    params = this.take_params(caller_stack);
    if (this.access_flags["native"]) {
      if (this.code != null) {
        ms.push(sf = new runtime.StackFrame(this, [], []));
        c_params = this.convert_params(runtime_state, params);
        sf.runner = function () {
          return _this.run_manually(_this.code, runtime_state, c_params);
        };
        return sf;
      }
      return null;
    }
    if (this.access_flags.abstract) {
      runtime_state.java_throw(runtime_state.get_bs_class('Ljava/lang/Error;'), "called abstract method: " + (this.full_signature()));
    }
    ms.push(sf = new runtime.StackFrame(this, params, []));
    if (this.code.run_stamp < runtime_state.run_stamp) {
      this.code.run_stamp = runtime_state.run_stamp;
      this.code.parse_code();
      if (this.access_flags.synchronized) {
        _ref3 = this.code.opcodes;
        for (i in _ref3) {
          c = _ref3[i];
          if (c.name.match(/^[ildfa]?return$/)) {
            (function (c) {
              return c.execute = function (rs) {
                opcodes.monitorexit(rs, _this.method_lock(rs));
                return c.orig_execute(rs);
              };
            })(c);
          }
        }
      }
    }
    sf.runner = function () {
      return _this.run_bytecode(runtime_state);
    };
    return sf;
  }
}
