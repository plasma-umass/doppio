///<reference path='./node.d.ts' />

import util = module('./util');
import logging = module('./logging')

declare var node
var _ref;
var fs = typeof node !== "undefined" ? node.fs : require('fs');
var path = typeof node !== "undefined" ? node.path : require('path');
var trace = logging.trace;
var error = logging.error;

export var show_NYI_natives: bool = false;
export var dump_state: bool = false;

var vendor_path = typeof node !== "undefined" ? '/home/doppio/vendor' : path.resolve(__dirname, '../vendor');
var system_properties: any

export function reset_system_properties() {
  system_properties = {
    'java.class.path': [],
    'java.home': "" + vendor_path + "/java_home",
    'sun.boot.class.path': "" + vendor_path + "/classes",
    'file.encoding': 'UTF-8',
    'java.vendor': 'Doppio',
    'java.version': '1.6',
    'java.vendor.url': 'https://github.com/int3/doppio',
    'java.class.version': '50.0',
    'java.specification.version': '1.6',
    'line.separator': '\n',
    'file.separator': '/',
    'path.separator': ':',
    'user.dir': path.resolve('.'),
    'user.home': '.',
    'user.name': 'DoppioUser',
    'os.name': 'doppio',
    'os.arch': 'js',
    'os.version': '0',
    'java.vm.name': 'Doppio 64-bit VM',
    'java.vm.vendor': 'Doppio Inc.',
    'java.awt.headless': (typeof node === "undefined" || node === null).toString(),
    'java.awt.graphicsenv': 'classes.awt.CanvasGraphicsEnvironment',
    'useJavaUtilZip': 'true',
    'jline.terminal': 'jline.UnsupportedTerminal'
  };
}

export function read_classfile(cls: any, cb: any, failure_cb: (exp_cb: ()=>void)=>void) {
  var data, e, filename, p, _i, _len, _ref3;

  cls = cls.slice(1, -1);
  _ref3 = this.system_properties['java.class.path'];
  for (_i = 0, _len = _ref3.length; _i < _len; _i++) {
    p = _ref3[_i];
    filename = "" + p + "/" + cls + ".class";
    try {
      if (!fs.existsSync(filename)) {
        continue;
      }
      data = util.bytestr_to_array(fs.readFileSync(filename, 'binary'));
      if (data != null) {
        cb(data);
      }
      return;
    } catch (_error) {
      e = _error;
      failure_cb(function () {
        throw e;
      });
      return;
    }
  }
  failure_cb((function () {
    throw new Error("Error: No file found for class " + cls + ".");
  }));
}

export function set_classpath(jcl_path: string, classpath: string) {
  var class_path, tmp_cp, _i, _len;

  var classpath2 = classpath.split(':');
  classpath2.push(jcl_path);
  this.system_properties['java.class.path'] = tmp_cp = [];
  for (_i = 0, _len = classpath2.length; _i < _len; _i++) {
    class_path = classpath2[_i];
    class_path = path.normalize(class_path);
    if (class_path.charAt(class_path.length - 1) !== '/') {
      class_path += '/';
    }
    if (fs.existsSync(class_path)) {
      tmp_cp.push(class_path);
    }
  }
}

export function run_class(rs: any, class_name: string, cmdline_args: string[], done_cb: (arg: any)=>void) {
  var class_descriptor, main_method, main_sig, run_main, run_program;

  class_descriptor = "L" + class_name + ";";
  main_sig = 'main([Ljava/lang/String;)V';
  main_method = null;
  run_main = function () {
    trace("run_main");
    rs.run_until_finished((function () {
      rs.async_op(function (resume_cb, except_cb) {
        rs.get_bs_cl().initialize_class(rs, class_descriptor, (function (cls) {
          rs.init_args(cmdline_args);
          return rs.run_until_finished((function () {
            main_method = cls.method_lookup(rs, main_sig);
            if (main_method != null) {
              return;
            }
            return rs.async_op(function (resume_cb, except_cb) {
              return cls.resolve_method(rs, main_sig, (function (m) {
                main_method = m;
                return except_cb(function () { });
              }), except_cb);
            });
          }), true, function (success) {
              if (!(success && (main_method != null))) {
                return typeof done_cb === "function" ? done_cb(success) : void 0;
              }
              return rs.run_until_finished((function () {
                return main_method.setup_stack(rs);
              }), false, function (success) {
                  return typeof done_cb === "function" ? done_cb(success && !rs.unusual_termination) : void 0;
                });
            });
        }), except_cb);
      });
    }), true, done_cb);
  };
  run_program = function () {
    trace("run_program");
    return rs.run_until_finished((function () {
      return rs.init_threads();
    }), true, function (success) {
        if (!success) {
          return;
        }
        if (rs.system_initialized != null) {
          return run_main();
        } else {
          return rs.run_until_finished((function () {
            return rs.init_system_class();
          }), true, function (success) {
              if (!success) {
                return;
              }
              return run_main();
            });
        }
      });
  };
  return rs.run_until_finished((function () {
    return rs.async_op(function (resume_cb, except_cb) {
      return rs.preinitialize_core_classes(run_program, (function (e) {
        throw e;
      }));
    });
  }), true, (function () { }));
}

reset_system_properties();
