"use strict";
import path = require('path');
import fs = require('fs');
import gLong = require('./gLong');
import util = require('./util');
import attributes = require('./attributes');
import runtime = require('./runtime');
import java_object = require('./java_object');
var JavaObject = java_object.JavaObject, JavaArray = java_object.JavaArray;
import exceptions = require('./exceptions');
import logging = require('./logging');
import threading = require('./threading');
var debug = logging.debug, error = logging.error, trace = logging.trace;

// For types; shouldn't actually be used.
import methods = require('./methods');
import ClassLoader = require('./ClassLoader');

declare var Websock;
declare var setImmediate;
import ClassData = require('./ClassData');

// XXX: Avoids a tough circular dependency
// ClassData->methods->natives->...
// Dependency occurs due to instanceof checks.
var ReferenceClassData, PrimitiveClassData, ArrayClassData;
export var instantiated: boolean = false;
export function instantiate(rcd, pcd, acd) {
  ReferenceClassData = rcd;
  PrimitiveClassData = pcd;
  ArrayClassData = acd;
  instantiated = true;
}

// convenience function. idea taken from coffeescript's grammar
function o(fn_name: string, fn: Function): { fn_name: string; fn: Function} {
  return {
    fn_name: fn_name,
    fn: fn
  };
}

function doPrivileged(rs: runtime.RuntimeState, action: methods.Method): void {
  var my_sf = rs.curr_frame();
  var m = action.cls.method_lookup(rs, 'run()Ljava/lang/Object;');
  if (m != null) {
    if (!m.access_flags["static"]) {
      rs.push(action);
    }
    m.setup_stack(rs);
    my_sf.runner = function () {
      var rv = rs.pop();
      rs.meta_stack().pop();
      rs.push(rv);
    };
    throw exceptions.ReturnException;
  } else {
    rs.async_op(function (resume_cb, except_cb) {
      action.cls.resolve_method(rs, 'run()Ljava/lang/Object;', (function () {
        rs.meta_stack().push(<any>{}); // dummy
        resume_cb();
      }), except_cb);
    });
  }
}

function get_caller_class(rs: runtime.RuntimeState, frames_to_skip: number): java_object.JavaClassObject {
  var caller, cls;

  caller = rs.meta_stack().get_caller(frames_to_skip);
  // Note: disregard frames associated with
  //   java.lang.reflect.Method.invoke() and its implementation.
  if (caller.name.indexOf('Ljava/lang/reflect/Method;::invoke') === 0) {
    caller = rs.meta_stack().get_caller(frames_to_skip + 1);
  }
  cls = caller.method.cls;
  return cls.get_class_object(rs);
}

export var native_methods = {
  classes: {
    awt: {
      CanvasGraphicsEnvironment: []
      // TODO: implement this
      // o 'createFontConfiguration()Lsun/awt/FontConfiguration;', (rs) ->
    },
    doppio: {
      JavaScript: [
        o('eval(Ljava/lang/String;)Ljava/lang/String;', function (rs: runtime.RuntimeState, to_eval: java_object.JavaObject): java_object.JavaObject {
          var rv = eval(to_eval.jvm2js_str());
          // Coerce to string, if possible.
          if (rv != null) {
            return rs.init_string("" + rv);
          } else {
            return null;
          }
        })
      ],
      Debug: [
        o('SetLogLevel(L!/!/!$LogLevel;)V', function(rs, loglevel) {
          logging.log_level = loglevel.get_field(rs, 'Lclasses/doppio/Debug$LogLevel;level');
        }), o('GetLogLevel()L!/!/!$LogLevel;', function(rs) {
          var ll_cls = rs.get_bs_class('Lclasses/doppio/Debug$LogLevel;');
          switch (logging.log_level) {
            case 10:
              return ll_cls.static_get(rs, 'VTRACE');
            case 9:
              return ll_cls.static_get(rs, 'TRACE');
            case 5:
              return ll_cls.static_get(rs, 'DEBUG');
            default:
              return ll_cls.static_get(rs, 'ERROR');
          }
        })
      ]
    }
  },
  java: {
    security: {
      AccessController: [
        o('doPrivileged(L!/!/PrivilegedAction;)L!/lang/Object;', doPrivileged), o('doPrivileged(L!/!/PrivilegedAction;L!/!/AccessControlContext;)L!/lang/Object;', doPrivileged), o('doPrivileged(L!/!/PrivilegedExceptionAction;)L!/lang/Object;', doPrivileged), o('doPrivileged(L!/!/PrivilegedExceptionAction;L!/!/AccessControlContext;)L!/lang/Object;', doPrivileged), o('getStackAccessControlContext()Ljava/security/AccessControlContext;', function(rs) {
          return null;
        })
      ]
    },
    net: {}
  },
  sun: {
    font: {
      FontManager: [],
        // TODO: this may be a no-op, but may be important
        // o 'getFontConfig(Ljava/lang/String;[Lsun/font/FontManager$FontConfigInfo;)V', ->
      FreetypeFontScaler: [o('initIDs(Ljava/lang/Class;)V', function() {})],
      StrikeCache: [
        o('getGlyphCacheDescription([J)V', function(rs, infoArray) {
          // XXX: these are guesses, see the javadoc for full descriptions of the infoArray
          infoArray.array[0] = gLong.fromInt(8);        // size of a pointer
          return infoArray.array[1] = gLong.fromInt(8); // size of a glyphInfo
        })
      ]
    },
    management: {
      VMManagementImpl: [
        o('getStartupTime()J', function(rs) {
          return rs.startup_time;
        }), o('getVersion0()Ljava/lang/String;', function(rs) {
          return rs.init_string("1.2", true);
        }), o('initOptionalSupportFields()V', function(rs) {
          var field_names, name, vm_management_impl, _i, _len, _results;
          // set everything to false
          field_names = ['compTimeMonitoringSupport', 'threadContentionMonitoringSupport', 'currentThreadCpuTimeSupport', 'otherThreadCpuTimeSupport', 'bootClassPathSupport', 'objectMonitorUsageSupport', 'synchronizerUsageSupport'];
          vm_management_impl = rs.get_bs_class('Lsun/management/VMManagementImpl;');
          _results = [];
          for (_i = 0, _len = field_names.length; _i < _len; _i++) {
            name = field_names[_i];
            _results.push(vm_management_impl.static_put(rs, name, 0));
          }
          return _results;
        }), o('isThreadContentionMonitoringEnabled()Z', function() {
          return false;
        }), o('isThreadCpuTimeEnabled()Z', function() {
          return false;
        }), o('getAvailableProcessors()I', function() {
          return 1;
        }), o('getProcessId()I', function() {
          return 1;
        })
      ],
      MemoryImpl: [
        o('getMemoryManagers0()[Ljava/lang/management/MemoryManagerMXBean;', function(rs) {
          // XXX may want to revisit this 'NOP'
          return new JavaArray(rs, rs.get_bs_class('[Lsun/management/MemoryManagerImpl;'), []);
        }), o('getMemoryPools0()[Ljava/lang/management/MemoryPoolMXBean;', function(rs) {
          // XXX may want to revisit this 'NOP'
          return new JavaArray(rs, rs.get_bs_class('[Lsun/management/MemoryPoolImpl;'), []);
        })
      ]
    },
    net: {
      spi: {}
    }
  }
};



native_methods['sun']['net']['spi']['DefaultProxySelector'] = [
  o('init()Z', function(rs) {
    return true;
  }), o('getSystemProxy(Ljava/lang/String;Ljava/lang/String;)Ljava/net/Proxy;', function(rs) {
    return null;
  })
];

// Used by invoke0 to handle manually setting up the caller's stack frame
function setup_caller_stack(rs, method, obj, params) {
  var i, p, p_type, primitive_value, _i, _len, _ref5;

  if (!method.access_flags["static"]) {
    rs.push(obj);
  }
  // we don't get unboxing for free anymore, so we have to do it ourselves
  i = 0;
  _ref5 = method.param_types;
  for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
    p_type = _ref5[_i];
    p = params.array[i++];
    // cat 2 primitives
    if (p_type === 'J' || p_type === 'D') {
      if ((p != null ? p.ref : void 0) != null) {
        primitive_value = p.get_field(rs, p.cls.get_type() + 'value');
        rs.push2(primitive_value, null);
      } else {
        rs.push2(p, null);
        i++; // skip past the null spacer
      }
    } else if (util.is_primitive_type(p_type)) { // any other primitive
      if ((p != null ? p.ref : void 0) != null) {
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

native_methods['sun']['reflect'] = {
  ConstantPool: [
    o('getLongAt0(Ljava/lang/Object;I)J', function(rs, _this, cp, idx) {
      return cp.get(idx).value;
    }), o('getUTF8At0(Ljava/lang/Object;I)Ljava/lang/String;', function(rs, _this, cp, idx) {
      return rs.init_string(cp.get(idx).value);
    })
  ],
  NativeMethodAccessorImpl: [
    o('invoke0(Ljava/lang/reflect/Method;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;', function(rs, m, obj, params) {
      var caller_sf, cleanup_runner, cls, cls_obj, m_sig, method, name, p_desc, p_types, pt, ret_descriptor, ret_type, slot;

      cls = m.get_field(rs, 'Ljava/lang/reflect/Method;clazz');
      // make the cleanup runner, before we branch too much
      ret_type = m.get_field(rs, 'Ljava/lang/reflect/Method;returnType');
      ret_descriptor = ret_type.$cls.get_type();
      if (util.is_primitive_type(ret_descriptor) && ret_descriptor !== 'V') {
        cleanup_runner = function() {
          var rv;

          rv = ret_descriptor === 'J' || ret_descriptor === 'D' ? rs.pop2() : rs.pop();
          rs.meta_stack().pop();
          // wrap up primitives in their Object box
          return rs.push(ret_type.$cls.create_wrapper_object(rs, rv));
        };
      } else {
        cleanup_runner = function() {
          var rv;

          rv = rs.pop();
          rs.meta_stack().pop();
          return rs.push(rv);
        };
      }
      // dispatch this sucka
      if (cls.$cls.access_byte & 0x200) { // cls is an interface, so we need to virtual dispatch
        cls_obj = rs.check_null(obj).cls;
        name = m.get_field(rs, 'Ljava/lang/reflect/Method;name').jvm2js_str(rs);
        p_types = m.get_field(rs, 'Ljava/lang/reflect/Method;parameterTypes');
        p_desc = ((function() {
          var _i, _len, _ref5, _results;

          _ref5 = p_types.array;
          _results = [];
          for (_i = 0, _len = _ref5.length; _i < _len; _i++) {
            pt = _ref5[_i];
            _results.push(pt.$cls.get_type());
          }
          return _results;
        })()).join('');
        m_sig = "" + name + "(" + p_desc + ")" + ret_descriptor;
        method = cls_obj.method_lookup(rs, m_sig);
        caller_sf = setup_caller_stack(rs, method, obj, params);
        method.setup_stack(rs);
        caller_sf.runner = cleanup_runner;
        throw exceptions.ReturnException;
      } else {
        slot = m.get_field(rs, 'Ljava/lang/reflect/Method;slot');
        return rs.async_op(function(resume_cb, except_cb) {
          return cls.$cls.loader.initialize_class(rs, cls.$cls.get_type(), (function(cls_obj) {
            var sig;

            method = ((function() {
              var _ref5, _results;

              _ref5 = cls_obj.get_methods();
              _results = [];
              for (sig in _ref5) {
                method = _ref5[sig];
                if (method.idx === slot) {
                  _results.push(method);
                }
              }
              return _results;
            })())[0];
            caller_sf = setup_caller_stack(rs, method, obj, params);
            // Reenter the RuntimeState loop, which should run our new StackFrame.
            // XXX: We use except_cb because it just replaces the runner function of the
            // current frame. We need a better story for calling Java threads through
            // native functions.
            return except_cb(function() {
              method.setup_stack(rs);
              return caller_sf.runner = cleanup_runner;
            });
          }), except_cb);
        });
      }
    })
  ],
  NativeConstructorAccessorImpl: [
    o('newInstance0(Ljava/lang/reflect/Constructor;[Ljava/lang/Object;)Ljava/lang/Object;', function(rs, m, params) {
      var cls, slot;

      cls = m.get_field(rs, 'Ljava/lang/reflect/Constructor;clazz');
      slot = m.get_field(rs, 'Ljava/lang/reflect/Constructor;slot');
      return rs.async_op(function(resume_cb, except_cb) {
        return cls.$cls.loader.initialize_class(rs, cls.$cls.get_type(), (function(cls_obj) {
          var method, my_sf, obj, sig;

          method = ((function() {
            var _ref5, _results;

            _ref5 = cls_obj.get_methods();
            _results = [];
            for (sig in _ref5) {
              method = _ref5[sig];
              if (method.idx === slot) {
                _results.push(method);
              }
            }
            return _results;
          })())[0];
          my_sf = rs.curr_frame();
          obj = new JavaObject(rs, cls_obj);
          rs.push(obj);
          if (params != null) {
            rs.push_array(params.array);
          }
          // Reenter the RuntimeState loop, which should run our new StackFrame.
          // XXX: We use except_cb because it just replaces the runner function of the
          // current frame. We need a better story for calling Java threads through
          // native functions.
          return except_cb(function() {
            // Push the constructor's frame onto the stack.
            method.setup_stack(rs);
            // Overwrite my runner.
            return my_sf.runner = function() {
              rs.meta_stack().pop();
              return rs.push(obj);
            };
          });
        }), except_cb);
      });
    })
  ],
  Reflection: [
    o('getCallerClass0(I)Ljava/lang/Class;', get_caller_class),
    o('getCallerClass(I)Ljava/lang/Class;', get_caller_class),
    o('getCallerClass()Ljava/lang/Class;', function(rs) {
      // 0th item is Reflection class, 1st item is the class that called us,
      // and 2nd item is the caller of our caller, which is correct.
      return get_caller_class(rs, 2);
    }),
    o('getClassAccessFlags(Ljava/lang/Class;)I', function(rs, class_obj) {
      return class_obj.$cls.access_byte;
    })
  ]
};

function flatten_pkg(pkg) {
  var pkg_name_arr, rec_flatten, result;

  result = {};
  pkg_name_arr = [];
  rec_flatten = function (pkg) {
    var flattened_inner, fn, fn_name, full_name, full_pkg_name, inner_pkg, method, pkg_name, _i, _len;
    for (pkg_name in pkg) {
      inner_pkg = pkg[pkg_name];
      pkg_name_arr.push(pkg_name);
      if (inner_pkg instanceof Array) {
        full_pkg_name = pkg_name_arr.join('/');
        for (_i = 0, _len = inner_pkg.length; _i < _len; _i++) {
          method = inner_pkg[_i];
          fn_name = method.fn_name, fn = method.fn;
          // expand out the '!'s in the method names
          fn_name = fn_name.replace(/!|;/g, (function () {
            var depth;

            depth = 0;
            return function (c) {
              if (c === '!') {
                return pkg_name_arr[depth++];
              } else if (c === ';') {
                depth = 0;
                return c;
              } else {
                return c;
              }
            };
          })());
          full_name = "L" + full_pkg_name + ";::" + fn_name;
          result[full_name] = fn;
        }
      } else {
        flattened_inner = rec_flatten(inner_pkg);
      }
      pkg_name_arr.pop(pkg_name);
    }
  };
  rec_flatten(pkg);
  return result;
}

export var trapped_methods = {}

native_methods = flatten_pkg(native_methods);
