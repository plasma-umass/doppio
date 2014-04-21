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
    }
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
