///<reference path='../vendor/DefinitelyTyped/node/node.d.ts' />
"use strict";
import util = require('./util');
import logging = require('./logging')
import runtime = require('./runtime')
import methods = require('./methods')
import ClassData = require('./ClassData')
import ClassLoader = require('./ClassLoader')
import fs = require('fs');
import path = require('path');

var trace = logging.trace;
var error = logging.error;

var vendor_path = util.are_in_browser() ? '/sys/vendor' : path.resolve(__dirname, '../vendor');

// poor man's static attribute
export var show_NYI_natives: boolean = false;

export class JVM {
  public should_dump_state: boolean = false;
  public system_properties: {[prop: string]: any};
  public bs_cl: ClassLoader.BootstrapClassLoader;
  // HACK: only used in run_class, but we need it when dumping state on exit
  private _rs: runtime.RuntimeState;

  constructor(dump_state=false) {
    this.should_dump_state = dump_state;
    this.reset_classloader_cache();
    this.reset_system_properties();
  }

  public dump_state(): void {
    if (this.should_dump_state) {
      this._rs.curr_thread.dump_state(this._rs);
    }
  }

  public reset_classloader_cache(): void {
    this.bs_cl = new ClassLoader.BootstrapClassLoader(this);
  }

  public reset_system_properties(): void {
    this.system_properties = {
      'java.class.path': <string[]> [],
      'java.home': vendor_path + "/java_home",
      'sun.boot.class.path': vendor_path + "/classes",
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
      'java.awt.headless': (util.are_in_browser()).toString(), // true if we're using the console frontend
      'java.awt.graphicsenv': 'classes.awt.CanvasGraphicsEnvironment',
      'useJavaUtilZip': 'true', // hack for sun6javac, avoid ZipFileIndex shenanigans
      'jline.terminal': 'jline.UnsupportedTerminal' // we can't shell out to `stty`
    };
  }

  // Read in a binary classfile asynchronously. Return an array of bytes.
  public read_classfile(cls: any, cb: (data: NodeBuffer)=>void, failure_cb: (exp_cb: ()=>void)=>void) {
    cls = cls.slice(1, -1);  // Convert Lfoo/bar/Baz; -> foo/bar/Baz.
    var cpath = this.system_properties['java.class.path'];
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

  // Sets the classpath to the given value in typical classpath form:
  // path1:path2:... etc.
  // jcl_path is the location of the Java Class Libraries. It is the only path
  // that is implicitly the last item on the classpath.
  // Standardizes the paths for JVM usage.
  // XXX: Should make this asynchronous at some point for checking the existance
  //      of classpaths.
  public set_classpath(jcl_path: string, classpath: string): void {
    var dirs = classpath.split(':');
    dirs.push(jcl_path);
    var tmp_classpath: string[] = [];
    // All paths must:
    // * Exist.
    // * Be a the fully-qualified path.
    // * Have a trailing /.
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

  // Prepends a single path to the JVM classpath.
  // Does not check for the existence of the given path.
  public prepend_classpath(classpath: string): void {
    var p = path.normalize(classpath);
    if (p.charAt(p.length-1) !== '/') {
      p += '/';
    }
    this.system_properties['java.class.path'].unshift(p);
  }

  // main function that gets called from the frontend
  public run_class(print: (p:string) => any,
                   _async_input: (cb: (p:string) => any) => any,
                   class_name: string,
                   cmdline_args: string[],
                   done_cb: (arg: any)=>void) {
    var class_descriptor = "L" + class_name + ";";
    var main_sig = 'main([Ljava/lang/String;)V';
    var main_method: methods.Method = null;
    var rs = this._rs = new runtime.RuntimeState(print, _async_input, this);
    var _this = this;
    function run_main() {
      trace("run_main");
      rs.run_until_finished((function () {
        rs.async_op(function (resume_cb, except_cb) {
          _this.bs_cl.initialize_class(rs, class_descriptor, function (cls: ClassData.ReferenceClassData) {
            rs.init_args(cmdline_args);
            // wrap it in run_until_finished to handle any exceptions correctly
            return rs.run_until_finished(function () {
              main_method = cls.method_lookup(rs, main_sig);
              if (main_method != null) {
                return;
              }
              return rs.async_op(function (resume_cb, except_cb) {
                // we call except_cb on success because it doesn't pop the callstack
                cls.resolve_method(rs, main_sig, function (m) {
                  main_method = m;
                  return except_cb(function () { });
                }, except_cb);
              });
            }, true, function (success) {
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
          }, except_cb);
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
    return rs.run_until_finished(function () {
      return rs.async_op(function (resume_cb, except_cb) {
        return rs.preinitialize_core_classes(run_program, function (e) {
          // Error during preinitialization? Abort abort abort!
          e();
        });
      });
    }, true, function () { });
  }

}
