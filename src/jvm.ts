///<reference path='../vendor/DefinitelyTyped/node/node.d.ts' />
"use strict";
import util = require('./util');
import logging = require('./logging');
import runtime = require('./runtime');
import methods = require('./methods');
import ClassData = require('./ClassData');
import ClassLoader = require('./ClassLoader');
import fs = require('fs');
import path = require('path');

var trace = logging.trace;
var error = logging.error;

// XXX: poor man's static attribute
export var show_NYI_natives: boolean = false;

/**
 * Doppio's main API. Encapsulates a single JVM.
 */
export class JVM {
  /**
   * If `true`, the JVM will serialize and dump its internal state to the file
   * system if it terminates irregularly (e.g. through an uncaught Exception).
   */
  public should_dump_state: boolean = false;
  public system_properties: {[prop: string]: any};
  public bs_cl: ClassLoader.BootstrapClassLoader;
  // HACK: only used in run_class, but we need it when dumping state on exit
  private _rs: runtime.RuntimeState;

  /**
   * (Async) Construct a new instance of the Java Virtual Machine.
   * @param {string} [jcl_path=/sys/vendor/classes] - Path to the Java Class Library in the file system.
   * @param {string} [java_home_path=/sys/vendor/java_home] - Path to `java_home` in the file system.
   */
  constructor(done_cb: (err: any, jvm?: JVM) => void,
              jcl_path: string = '/sys/vendor/classes',
              java_home_path: string = '/sys/vendor/java_home') {
    var _this = this;
    this.reset_classloader_cache();
    this.reset_system_properties(jcl_path, java_home_path);
    // Need to check jcl_path and java_home_path.
    fs.exists(java_home_path, function(exists: boolean): void {
      if (!exists) {
        done_cb(new Error("Java home path '" + java_home_path + "' does not exist!"));
      } else {
        _this.add_classpath_item(jcl_path, 0, function(added: boolean): void {
          if (!added) {
            done_cb(new Error("Java class library path '" + jcl_path + "' does not exist!"));
          } else {
            // No error. All good.
            done_cb(null, _this);
          }
        });
      }
    });
  }

  /**
   * Resets the JVM's system properties to their default values. Java programs
   * can retrieve these values.
   */
  private reset_system_properties(jcl_path: string, java_home_path: string): void {
    this.system_properties = {
      'java.class.path': <string[]> [],
      'java.home': java_home_path,
      'sun.boot.class.path': jcl_path,
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

  public dump_state(): void {
    if (this.should_dump_state) {
      this._rs.curr_thread.dump_state(this._rs);
    }
  }

  public reset_classloader_cache(): void {
    this.bs_cl = new ClassLoader.BootstrapClassLoader(this);
  }

  /**
   * Removes all items from the classpath *except* for the JCL path.
   */
  public reset_classpath(): void {
    this.system_properties['java.class.path'] = this.system_properties['java.class.path'].slice(0, 1);
  }

  /**
   * Read in a binary classfile asynchronously. Pass a buffer with the contents
   * to the callback.
   * @todo This should really be in the bootstrap class loader.
   */
  public read_classfile(cls: any, cb: (data: NodeBuffer)=>void, failure_cb: (exp_cb: ()=>void)=>void) {
    var cpath = this.system_properties['java.class.path'],
        try_next = function(i: number): void {
          fs.readFile(cpath[i] + cls + '.class', function(err, data) {
            if (err) {
              if (++i == cpath.length) {
                failure_cb(function(){
                  throw new Error("Error: No file found for class " + cls);
                });
              } else {
                // Note: Yup, we're relying on the ++i side effect.
                try_next(i);
              }
            } else {
              cb(data);
            }
          });
        };
    cls = cls.slice(1, -1);  // Convert Lfoo/bar/Baz; -> foo/bar/Baz.
    // We could launch them all at once, but we would need to ensure that we use
    // the working version that occurs first in the classpath.
    try_next(0);
  }

  /**
   * Add an item to the classpath. Verifies that the path exists prior to
   * adding.
   * @param {string} p - The path to add.
   * @param {number} idx - The index at which to splice in the item.
   * @param {function} done_cb - Called with a boolean that indicates if the
   *   path was added or not.
   */
  public add_classpath_item(p: string, idx: number, done_cb: (added: boolean) => void) {
    var i: number, classpath = this.system_properties['java.class.path'];
    // All paths must:
    // * Exist.
    // * Be a the fully-qualified path.
    // * Have a trailing /.
    p = path.normalize(p);
    if (p.charAt(p.length - 1) !== '/') {
      p += '/';
    }
    // Check that this standardized classpath does not already exist.
    for (i = 0; i < classpath.length; i++) {
      if (classpath[i] === p) {
        process.stderr.write("WARNING: Ignoring duplicate classpath item " + p + ".");
        // If this insertion is at a smaller index than the existing item, splice
        // out the old one and insert this one.
        if (i > idx) {
          classpath.splice(idx, 0, classpath.splice(i, 1));
        }
        // Well, technically it *has* been added...
        return done_cb(true);
      }
    }

    fs.exists(p, function(exists: boolean): void {
      if (!exists) {
        process.stderr.write("WARNING: Classpath path " + p + " does not exist. Ignoring.\n");
      } else {
        // Splice in the new classpath item.
        classpath.splice(idx, 0, p);
      }
      done_cb(exists);
    });
  }

  /**
   * Add an path to the end of the classpath.
   * @param {string} p - The path to add.
   * @param {function} done_cb - Called with a boolean that indicates if the
   *   path was added or not.
   */
  public push_classpath_item(p: string, done_cb: (added: boolean) => void) {
    this.add_classpath_item(p, this.system_properties['java.class.path'].length, done_cb);
  }

  /**
   * Add a path to the start of the classpath, *after* the JCL.
   */
  public unshift_classpath_item(p: string, done_cb: (added: boolean) => void) {
    // @todo Add assert function.
    // assert(this.system_properties['java.class.path'].length > 0);
    this.add_classpath_item(p, 1, done_cb);
  }

  /**
   * Pushes multiple paths onto the end of the classpath.
   */
  public push_classpath_items(items: string[], done_cb: (added: boolean[]) => void): void {
    var i: number = 0, added: boolean[] = [], _this = this,
        new_done_cb = function(_added: boolean): void {
          added.push(_added);
          if (++i === items.length) {
            done_cb(added);
          } else {
            _this.push_classpath_item(items[i], new_done_cb);
          }
        };
    // Need to do this serially to preserve semantics.
    if (items.length > 0) {
      this.push_classpath_item(items[i], new_done_cb);
    } else {
      done_cb(added);
    }
  }

  /**
   * Proxies abort request to runtime state to halt the JVM.
   */
  public abort(cb: Function): void {
    this._rs.abort(cb);
  }

  /**
   * Main function for running a JAR file.
   */
  public run_jar(jar_path: string, cmdline_args: string[], done_cb: (arg: boolean) => void): void {
  }

  /**
   * Main function for running a class.
   */
  public run_class(class_name: string,
                   cmdline_args: string[],
                   done_cb: (arg: boolean)=>void) {
    var class_descriptor = "L" + class_name + ";";
    var main_sig = 'main([Ljava/lang/String;)V';
    var main_method: methods.Method = null;
    var rs = this._rs = new runtime.RuntimeState(this);
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

  /**
   * Returns a list of absolute file paths to each loaded class in the
   * ClassLoader backed by a class file on the file system.
   */
  public list_class_cache(done_cb: (class_cache: string[]) => void): void {
    var classes: string[] = this.bs_cl.get_loaded_class_list(true),
        cpaths: string[] = this.system_properties['java.class.path'].slice(0),
        i: number, filesLeft: number = classes.length, filePaths: string[] = [],
        // Called whenever another file is processed.
        fileDone = function() {
          if (--filesLeft === 0) {
            // We have finished examining all files.
            done_cb(filePaths);
          }
        },
        // Searches for fileName in the given classpaths.
        searchForFile = function(fileName: string, cpaths: string[]) {
          var fpath: string;
          if (cpaths.length === 0) {
            // Base case. Nothing left to search for; the file wasn't found.
            fileDone();
          } else {
            // Note: Shift is destructive. :)
            fpath = path.resolve(cpaths.shift(), fileName);
            fs.stat(fpath, function(err: any, stats?: fs.Stats) {
              if (err) {
                // Iterate on cpaths.
                return searchForFile(fileName, cpaths);
              } else {
                // We found it, and can stop iterating.
                filePaths.push(fpath);
                fileDone();
              }
            });
          }
        };
    for (i = 0; i < classes.length; i++) {
      // Our ClassLoader currently does not store the provenance of each class
      // file, unfortunately.
      // Capture the filename, and asynchronously figure out where each
      // was loaded from.
      // Parallelism!!
      searchForFile(classes[i] + ".class", cpaths.slice(0));
    }
  }
}
