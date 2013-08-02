///<reference path='../vendor/node.d.ts' />
"use strict";
import util = module('./util');
import logging = module('./logging')
import runtime = module('./runtime')

declare var node
var _ref;
var fs = typeof node !== "undefined" ? node.fs : require('fs');
var path = typeof node !== "undefined" ? node.path : require('path');
var trace = logging.trace;
var error = logging.error;

export var show_NYI_natives: bool = false;
export var dump_state: bool = false;

var vendor_path = typeof node !== "undefined" ? '/sys/vendor' : path.resolve(__dirname, '../vendor');
export var system_properties: any

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

// Read in a binary classfile asynchronously. Return an array of bytes.
export function read_classfile(cls: any, cb: (data: number[])=>void, failure_cb: (exp_cb: ()=>void)=>void) {
  cls = cls.slice(1, -1);  // Convert Lfoo/bar/Baz; -> foo/bar/Baz.
  var cpath = system_properties['java.class.path'];
  function try_get(i: number) {
    fs.readFile(cpath[i] + cls + '.class', function(err, data){
      if (err) {
        if (i + 1 == cpath.length) {
          failure_cb(function(){
            throw new Error("Error: No file found for class " + cls);
          });
        } else {
          try_get(i + 1);
        }
      } else {
        cb(data);
      }
    });
  }
  // We could launch them all at once, but we would need to ensure that we use
  // the working version that occurs first in the classpath.
  try_get(0);
}

export function set_classpath(jcl_path: string, classpath: string) {
  var dirs = classpath.split(':');
  dirs.push(jcl_path);
  var tmp_classpath = [];
  for (var i = 0; i < dirs.length; i++) {
    var cp = path.normalize(dirs[i]);
    if (cp.charAt(cp.length - 1) !== '/') {
      cp += '/';
    }
    // XXX: I'm not checking.
    // if (fs.existsSync(cp))
    tmp_classpath.push(cp);
  }
  this.system_properties['java.class.path'] = tmp_classpath;
}

export function run_class(rs: runtime.RuntimeState, class_name: string, cmdline_args: string[], done_cb: (arg: any)=>void) {
  var class_descriptor = "L" + class_name + ";";
  var main_sig = 'main([Ljava/lang/String;)V';
  var main_method = null;
  function run_main() {
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
                if (typeof done_cb === "function") {
                  done_cb(success);
                }
              }
              return rs.run_until_finished((function () {
                return main_method.setup_stack(rs);
              }), false, function (success) {
                  if (typeof done_cb === "function") {
                    done_cb(success && !rs.unusual_termination);
                  }
                });
            });
        }), except_cb);
      });
    }), true, done_cb);
  };
  function run_program() {
    trace("run_program");
    rs.run_until_finished((function () {
      rs.init_threads();
    }), true, function (success) {
        if (!success) {
          return;
        }
        if (rs.system_initialized != null) {
          run_main();
        } else {
          rs.run_until_finished((function () {
            rs.init_system_class();
          }), true, function (success) {
              if (!success) {
                return;
              }
              run_main();
          });
        }
      });
  };
  return rs.run_until_finished((function () {
    return rs.async_op(function (resume_cb, except_cb) {
      return rs.preinitialize_core_classes(run_program, (function (e) {
        // Error during preinitialization? Abort abort abort!
        e();
      }));
    });
  }), true, (function () { }));
}

reset_system_properties();
