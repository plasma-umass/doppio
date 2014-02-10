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
import JAR = require('./jar');
declare var BrowserFS;

var trace = logging.trace;
var error = logging.error;

/**
 * Encapsulates a single JVM instance.
 */
class JVM {
  /**
   * If `true`, the JVM will serialize and dump its internal state to the file
   * system if it terminates irregularly (e.g. through an uncaught Exception).
   */
  public should_dump_state: boolean = false;
  public system_properties: {[prop: string]: any};
  public bs_cl: ClassLoader.BootstrapClassLoader;
  // HACK: only used in run_class, but we need it when dumping state on exit
  private _rs: runtime.RuntimeState;
  // XXX: Static attribute.
  public static show_NYI_natives: boolean = false;
  // Maps JAR files to their extraction directory.
  private jar_map: {[jar_path: string]: string} = {};

  /**
   * (Async) Construct a new instance of the Java Virtual Machine.
   * @param {string} [jcl_path=/sys/vendor/classes] - Path to the Java Class Library in the file system.
   * @param {string} [java_home_path=/sys/vendor/java_home] - Path to `java_home` in the file system.
   */
  constructor(done_cb: (err: any, jvm?: JVM) => void,
              jcl_path: string = '/sys/vendor/classes',
              java_home_path: string = '/sys/vendor/java_home',
              private jar_file_location: string = '/jars') {
    var _this = this;
    this.reset_classloader_cache();
    this._reset_system_properties(jcl_path, java_home_path);
    // Need to check jcl_path and java_home_path.
    fs.exists(java_home_path, function(exists: boolean): void {
      if (!exists) {
        done_cb(new Error("Java home path '" + java_home_path + "' does not exist!"));
      } else {
        // Check if jar_file_location exists and, if not, create it.
        fs.exists(_this.jar_file_location, function(exists: boolean): void {
          var next_step = next_step = function() {
            _this.add_classpath_item(jcl_path, 0, function(added: boolean): void {
              if (!added) {
                done_cb(new Error("Java class library path '" + jcl_path + "' does not exist!"));
              } else {
                // No error. All good.
                done_cb(null, _this);
              }
            });
          };

          if (!exists) {
            fs.mkdir(_this.jar_file_location, function(err?: any): void {
              if (err) {
                done_cb(new Error("Unable to create JAR file directory " + _this.jar_file_location + ": " + err));
              } else {
                next_step();
              }
            });
          } else {
            next_step();
          }
        });
      }
    });
  }

  /**
   * Uses BrowserFS to mount the jar file in the file system, allowing us to
   * lazily extract only the files we care about.
   */
  private unzip_jar_browser(jar_path: string, cb: (err: any, unzip_path?: string) => void): void {
    var dest_folder: string = path.resolve(this.jar_file_location, path.basename(jar_path, '.jar')),
        mfs = (<any>fs).getRootFS();
    // In case we have mounted this before, unmount.
    try {
      mfs.umount(dest_folder);
    } catch(e) {
      // We didn't mount it before. Ignore.
    }

    // Grab the file.
    fs.readFile(jar_path, function(err: any, data: NodeBuffer) {
      var jar_fs;
      if (err) {
        // File might not have existed, or there was an error reading it.
        return cb(err);
      }
      // Try to mount.
      try {
        jar_fs = new BrowserFS.FileSystem.ZipFS(data, path.basename(jar_path));
        mfs.mount(dest_folder, jar_fs);
        // Success!
        cb(null, dest_folder);
      } catch(e) {
        cb(e);
      }
    });
  }

  /**
   * Helper function for unzip_jar_node.
   */
  private _extract_all_to(files: any[], dest_dir: string): void {
    for (var filepath in files) {
      var file = files[filepath];
      filepath = path.join(dest_dir, filepath);
      if (file.options.dir || filepath.slice(-1) === '/') {
        if (!fs.existsSync(filepath)) {
          fs.mkdirSync(filepath);
        }
      } else {
        fs.writeFileSync(filepath, file.data, 'binary');
      }
    }
  }

  /**
   * Uses JSZip to eagerly extract the entire JAR file into a temporary folder.
   */
  private unzip_jar_node(jar_path: string, cb: (err: any, unzip_path?: string) => void): void {
    var JSZip = require('node-zip'),
        unzipper = new JSZip(fs.readFileSync(jar_path, 'binary'), {
          base64: false,
          checkCRC32: true
        }),
        dest_folder = path.resolve(this.jar_file_location, path.basename(jar_path, '.jar'));

    try {
      if (!fs.existsSync(dest_folder)) {
        fs.mkdirSync(dest_folder);
      }
      this._extract_all_to(unzipper.files, dest_folder);
      // Reset stack depth.
      setImmediate(function() { return cb(null, dest_folder); });
    } catch(e) {
      setImmediate(function() { return cb(e); });
    }
  }

  /**
   * Given a path to a JAR file, returns a path in the file system where the
   * extracted contents can be read.
   */
  private unzip_jar: (jar_path: string, cb: (err: any, unzip_path?: string) => void) => void = util.are_in_browser() ? this.unzip_jar_browser : this.unzip_jar_node;

  /**
   * Resets the JVM's system properties to their default values. Java programs
   * can retrieve these values.
   */
  public reset_system_properties() {
    // Reset while maintaining jcl_path and java_home_path.
    this._reset_system_properties(this.system_properties['sun.boot.class.path'],
                                  this.system_properties['java.home']);
    // XXX: jcl_path is known-good; synchronously push it onto classpath.
    this.system_properties['java.class.path'] = [this.system_properties['sun.boot.class.path']];
  }

  /**
   * [Private] Same as reset_system_properties, but called by the constructor.
   */
  private _reset_system_properties(jcl_path: string, java_home_path: string): void {
    // XXX: Classpath items must end in '/'. :(
    if (jcl_path.charAt(jcl_path.length - 1) !== '/') {
      jcl_path = jcl_path + "/";
    }
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
    var jcl: string = this.system_properties['java.class.path'][0],
        prop: string;
    this.system_properties['java.class.path'] = [jcl];

    // If the JCL was specified as a JAR file, ensure that we don't muck with
    // its entry in the JAR map.
    for (prop in this.jar_map) {
      if (this.jar_map[prop] === jcl) {
        this.jar_map = {prop: jcl};
        return;
      }
    }
    this.jar_map = {};
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
    var i: number, classpath = this.system_properties['java.class.path'], _this = this;
    p = path.resolve(p);

    if (p.indexOf('.jar') !== -1) {
      // JAR file, not a path.
      return this.unzip_jar(p, function(err: any, jar_path?: string): void {
        var manifest: JAR;
        if (err) {
          process.stderr.write("Unable to add JAR file " + p + ": " + err + "\n");
          done_cb(false);
        } else {
          _this.jar_map[p] = jar_path;
          // Add the JAR file's dependencies before the file itself.
          manifest = new JAR(jar_path, function(err?: any) {
            var new_cp_items: string[] = [],
                i: number = 0,
                add_next_item = function() {
                  _this.add_classpath_item(new_cp_items[i], idx + i, function(added: boolean) {
                    if (++i === new_cp_items.length) {
                      done_cb(true);
                    } else {
                      add_next_item();
                    }
                  });
                };
            if (!err) {
              // Successfully parsed the JAR file.
              new_cp_items = manifest.getClassPath();
            }
            new_cp_items.push(jar_path);
            // Add all of the classpath items.
            add_next_item();
          });
        }
      });
    }

    // All paths must:
    // * Exist.
    // * Be a the fully-qualified path.
    // * Have a trailing /.
    if (p.charAt(p.length - 1) !== '/') {
      p += '/';
    }
    // Check that this standardized classpath does not already exist.
    for (i = 0; i < classpath.length; i++) {
      if (classpath[i] === p) {
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
  public abort(cb: Function = function(){}): void {
    if (this._rs != null) {
      this._rs.abort(cb);
    }
  }

  /**
   * Main function for running a JAR file.
   */
  public run_jar(jar_path: string, cmdline_args: string[], done_cb: (arg: boolean) => void): void {
    var _this = this;
    jar_path = path.resolve(jar_path);
    this.push_classpath_item(jar_path, function(added: boolean): void {
      var manifest: JAR, jar_dir: string;
      if (!added) {
        process.stderr.write("Unable to process JAR file " + jar_path + "\n");
        done_cb(false);
      } else {
        jar_dir = _this.jar_map[jar_path];
        // Parse the manifest.
        manifest = new JAR(jar_dir, function(err?: any): void {
          var main_class: string;
          if (err) {
            process.stderr.write("Unable to parse manifest file for jar file " + jar_path + ".\n");
            done_cb(false);
          } else {
            // Run the main class.
            main_class = manifest.getAttribute('Main-Class');
            // XXX: Convert foo.bar.Baz => foo/bar/Baz
            main_class = util.descriptor2typestr(util.int_classname(main_class));
            _this.run_class(main_class, cmdline_args, done_cb);
          }
        });
      }
    });
  }

  /**
   * Main function for running a class.
   */
  public run_class(class_name: string,
                   cmdline_args: string[],
                   done_cb: (arg: boolean)=>void) {
    // Reset the state of cached classloader items.
    this.bs_cl.reset();
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
            return done_cb(false);
          }
          if (rs.system_initialized != null) {
            run_main();
          } else {
            rs.run_until_finished((function () {
              rs.init_system_class();
            }), true, function (success) {
                if (!success) {
                  return done_cb(false);
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
    }, true, function(success) {
      if (!success) {
        return done_cb(false);
      }
      // Otherwise, do nothing.
    });
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

// Causes `require('jvm')` to be the JVM constructor itself
export = JVM;
