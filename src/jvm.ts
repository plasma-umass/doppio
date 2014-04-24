///<reference path='../vendor/DefinitelyTyped/node/node.d.ts' />
"use strict";
import util = require('./util');
import logging = require('./logging');
import methods = require('./methods');
import ClassData = require('./ClassData');
import ClassLoader = require('./ClassLoader');
import fs = require('fs');
import path = require('path');
import JAR = require('./jar');
import java_object = require('./java_object');
import threading = require('./threading');
import enums = require('./enums');
import Heap = require('./heap');

var trace = logging.trace;
var error = logging.error;

/**
 * Encapsulates a single JVM instance.
 */
class JVM {
  private system_properties: {[prop: string]: any};
  private internedStrings: { [str: string]: java_object.JavaObject } = {};
  private bsCl: ClassLoader.BootstrapClassLoader;
  private threadPool: threading.ThreadPool;
  private natives: { [clsName: string]: { [methSig: string]: Function } } = {};
  // 20MB heap
  // @todo Make heap resizeable.
  private heap = new Heap(20 * 1024 * 1024);

  /**
   * (Async) Construct a new instance of the Java Virtual Machine.
   * @param {string} [jcl_path=/sys/vendor/classes] - Path to the Java Class Library in the file system.
   * @param {string} [java_home_path=/sys/vendor/java_home] - Path to `java_home` in the file system.
   */
  constructor(done_cb: (err: any, jvm?: JVM) => void,
              jcl_path: string = '/sys/vendor/classes',
              java_home_path: string = '/sys/vendor/java_home',
              private jar_file_location: string = '/jars',
              private native_classpath: string[]= ['/sys/src/natives']) {
    jcl_path = path.resolve(jcl_path);
    java_home_path = path.resolve(java_home_path);
    this._initSystemProperties(jcl_path, java_home_path);
    // Construct BSCL.
    // Initialize natives.
    // Bootstrap JVM.
  }

  /**
   * Retrieve the given system property.
   */
  public getSystemProperty(prop: string): any {
    return this.system_properties[prop];
  }

  /**
   * Sets the given system property.
   */
  public setSystemProperty(prop: string, val: any): void {
    this.system_properties[prop] = val;
  }

  /**
   * Retrieve the unmanaged heap.
   */
  public getHeap(): Heap {
    return this.heap;
  }

  /**
   * Interns the given JavaScript string. Returns the interned string.
   */
  public internString(str: string): java_object.JavaObject {
    var internedString = this.internedStrings[str];
    if (internedString == null) {
      internedString = this.internedStrings[str] = java_object.initString(this.bsCl, str);
    }
    return internedString;
  }

  /**
   * XXX: Hack to evaluate native modules in an environment with
   * java_object and ClassData defined.
   */
  private evalNativeModule(mod: string): any {
    "use strict";
    // Terrible hack.
    mod = mod.replace(/require\((\'|\")..\/(.*)(\'|\")\);/g, 'require($1./$2$1);');
    return eval(mod);
  }

  /**
   * Register native methods with the virtual machine.
   */
  public registerNatives(newNatives: { [clsName: string]: { [methSig: string]: Function } }): void {
    var clsName: string, methSig: string;
    for (clsName in newNatives) {
      if (newNatives.hasOwnProperty(clsName)) {
        if (!this.natives.hasOwnProperty(clsName)) {
          this.natives[clsName] = {};
        }
        var clsMethods = newNatives[clsName];
        for (methSig in clsMethods) {
          if (clsMethods.hasOwnProperty(methSig)) {
            // Don't check if it exists already. This allows us to overwrite
            // native methods dynamically at runtime.
            this.natives[clsName][methSig] = clsMethods[methSig];
          }
        }
      }
    }
  }

  /**
   * Convenience function. Register a single native method with the virtual
   * machine. Can be used to update existing native methods based on runtime
   * information.
   */
  public registerNative(clsName: string, methSig: string, native: Function): void {
    this.registerNatives({ clsName: { methSig: native } });
  }

  /**
   * Retrieve the native method for the given method of the given class.
   * Returns null if none found.
   */
  public getNative(clsName: string, methSig: string): Function {
    if (this.natives.hasOwnProperty(clsName)) {
      var clsMethods = this.natives[clsName];
      if (clsMethods.hasOwnProperty(methSig)) {
        return clsMethods[methSig];
      }
    }
    return null;
  }

  /**
   * Loads in all of the native method modules prior to execution.
   * Currently a hack around our classloader.
   */
  private initializeNatives(done_cb: () => void): void {
    var next_dir = () => {
      if (i === this.native_classpath.length) {
        // Next phase: Load up the files.
        var count: number = process_files.length;
        process_files.forEach((file) => {
          fs.readFile(file, (err, data) => {
            if (!err)
              this.registerNatives(this.evalNativeModule(data.toString()));
            if (--count) {
              done_cb();
            }
          });
        });
      } else {
        var dir = this.native_classpath[i++];
        fs.readdir(dir, (err, files) => {
          if (err) return done_cb();

          var j: number, file: string;
          for (j = 0; j < files.length; j++) {
            file = files[j];
            if (file.substring(file.length - 3, file.length) === '.js') {
              process_files.push(path.join(dir, file));
            }
          }
          next_dir();
        });
      }
    }, i: number = 0, process_files: string[] = [];

    next_dir();
  }

  /**
   * Sets the JVM's system properties to their default values. Java programs
   * can retrieve these values.
   */
  public initSystemProperties() {
    // Reset while maintaining jcl_path and java_home_path.
    this._initSystemProperties(this.system_properties['sun.boot.class.path'],
                                  this.system_properties['java.home']);
    // XXX: jcl_path is known-good; synchronously push it onto classpath.
    this.system_properties['java.class.path'] = [this.system_properties['sun.boot.class.path']];
  }

  /**
   * [Private] Same as reset_system_properties, but called by the constructor.
   */
  private _initSystemProperties(jcl_path: string, java_home_path: string): void {
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

  /**
   * Proxies abort request to runtime state to halt the JVM.
   */
  public abort(): void {
    var threads = this.threadPool.getThreads(), i: number;
    for (i = 0; i < threads.length; i++) {
      threads[i].setState(enums.ThreadState.TERMINATED);
    }
  }

  /**
   * Retrieves the bootstrap class loader.
   */
  public getBootstrapClassLoader(): ClassLoader.BootstrapClassLoader {
    return this.bsCl;
  }
}

// Causes `require('jvm')` to be the JVM constructor itself
export = JVM;
