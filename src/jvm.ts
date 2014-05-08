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
import assert = require('./assert');

var trace = logging.trace;
var error = logging.error;
// XXX: We currently initialize these classes at JVM bootup. This is expensive.
// We should attempt to prune this list as much as possible.
var coreClasses = [
  'Ljava/lang/String;',
  'Ljava/lang/Class;', 'Ljava/lang/ClassLoader;',
  'Ljava/lang/reflect/Constructor;', 'Ljava/lang/reflect/Field;',
  'Ljava/lang/reflect/Method;',
  'Ljava/lang/Error;', 'Ljava/lang/StackTraceElement;',
  'Ljava/io/FileNotFoundException;', 'Ljava/io/IOException;',
  'Ljava/io/Serializable;',
  'Ljava/lang/ArithmeticException;',
  'Ljava/lang/ArrayIndexOutOfBoundsException;',
  'Ljava/lang/ArrayStoreException;', 'Ljava/lang/ClassCastException;',
  'Ljava/lang/ClassNotFoundException;', 'Ljava/lang/NoClassDefFoundError;',
  'Ljava/lang/Cloneable;', 'Ljava/lang/ExceptionInInitializerError;',
  'Ljava/lang/IllegalMonitorStateException;',
  'Ljava/lang/InterruptedException;',
  'Ljava/lang/NegativeArraySizeException;', 'Ljava/lang/NoSuchFieldError;',
  'Ljava/lang/NoSuchMethodError;', 'Ljava/lang/NullPointerException;',
  'Ljava/lang/System;', 'Ljava/lang/Thread;',
  'Ljava/lang/ThreadGroup;', 'Ljava/lang/Throwable;',
  'Ljava/lang/UnsatisfiedLinkError;', 'Ljava/nio/ByteOrder;',
  'Lsun/misc/VM;', 'Lsun/reflect/ConstantPool;', 'Ljava/lang/Byte;',
  'Ljava/lang/Character;', 'Ljava/lang/Double;', 'Ljava/lang/Float;',
  'Ljava/lang/Integer;', 'Ljava/lang/Long;', 'Ljava/lang/Short;',
  'Ljava/lang/Void;', 'Ljava/io/FileDescriptor;',
  'Ljava/lang/Boolean;', '[Lsun/management/MemoryManagerImpl;',
  '[Lsun/management/MemoryPoolImpl;'
];


/**
 * Encapsulates a single JVM instance.
 */
class JVM {
  private systemProperties: {[prop: string]: any};
  private internedStrings: util.SafeMap<java_object.JavaObject> = new util.SafeMap<java_object.JavaObject>();
  private bsCl: ClassLoader.BootstrapClassLoader;
  private threadPool: threading.ThreadPool;
  private natives: { [clsName: string]: { [methSig: string]: Function } } = {};
  // 20MB heap
  // @todo Make heap resizeable.
  private heap = new Heap(20 * 1024 * 1024);
  private nativeClasspath: string[];
  private startupTime = new Date();
  private terminationCb: (success: boolean) => void = null;
  // The initial JVM thread used to kick off execution.
  private firstThread: threading.JVMThread;

  /**
   * (Async) Construct a new instance of the Java Virtual Machine.
   */
  constructor(opts: {
    // Path to the Java Class Library (JCL).
    jclPath: string;
    // Non-JCL paths on the class path.
    classpath: string[];
    // Path to JAVA_HOME.
    javaHomePath: string;
    // Path where we can extract JAR files.
    extractionPath: string;
    // XXX: Path where native methods are located.
    nativeClasspath: string[];
  }, cb: (e: any, jvm?: JVM) => void) {
    var jclPath = path.resolve(opts.jclPath),
      javaHomePath = path.resolve(opts.javaHomePath),
      // JVM bootup tasks, from first to last task.
      bootupTasks: {(next: (err?: any) => void): void}[] = [],
      firstThread: threading.JVMThread;
    // @todo Resolve these, and integrate it into the ClassLoader?
    this.nativeClasspath = opts.nativeClasspath;
    this._initSystemProperties(jclPath, javaHomePath);

    /**
     * Task #1: Initialize native methods.
     */
    bootupTasks.push((next: (err?: any) => void) => {
      this.initializeNatives(next);
    });

    /**
     * Task #2: Construct the bootstrap class loader.
     */
    bootupTasks.push((next: (err?: any) => void) => {
      this.bsCl =
        new ClassLoader.BootstrapClassLoader([jclPath].concat(opts.classpath),
          opts.extractionPath, next);
    });

    /**
     * Task #3: Construct the thread pool, resolve thread class, and construct
     * the first thread.
     */
    bootupTasks.push((next: (err?: any) => void) => {
      this.threadPool = new threading.ThreadPool(this, this.bsCl, () => {
        this.emptyThreadPool();
      });
      // Resolve Ljava/lang/Thread so we can fake a thread.
      // NOTE: This should never actually use the Thread object unless
      // there's an error loading java/lang/Thread and associated classes.
      this.bsCl.resolveClass(null, 'Ljava/lang/Thread;', (cdata: ClassData.ReferenceClassData) => {
        if (cdata == null) {
          // Failed.
          next("Failed to resolve java/lang/Thread.");
        } else {
          //Fake a thread.
          firstThread = this.firstThread = this.threadPool.newThread(cdata);
          next();
        }
      });
    });

    /**
     * Task #4: Preinitialize some essential JVM classes, and initializes the
     * JVM's ThreadGroup once that class is initialized.
     */
    bootupTasks.push((next: (err?: any) => void) => {
      util.async_foreach<string>(coreClasses, (coreClass: string, next_item: (err?: any) => void) => {
        this.bsCl.initializeClass(firstThread, coreClass, (cdata: ClassData.ClassData) => {
          if (cdata == null) {
            next_item("Failed to initialize " + coreClass);
          } else {
            // One of the later preinitialized classes references Thread.group.
            // Initialize the system's ThreadGroup now.
            if (coreClass === 'Ljava/lang/ThreadGroup;') {
              // Construct a ThreadGroup object for the first thread.
              var threadGroupCls = <ClassData.ReferenceClassData> this.bsCl.getInitializedClass('Ljava/lang/ThreadGroup;'),
                groupObj = new java_object.JavaObject(threadGroupCls),
                cnstrctr = threadGroupCls.method_lookup(firstThread, '<init>()V');
              firstThread.runMethod(cnstrctr, [groupObj], (e?, rv?) => {
                // Initialize the fields of our firstThread to make it real.
                firstThread.set_field(firstThread, 'Ljava/lang/Thread;name', java_object.initCarr(this.bsCl, 'main'));
                firstThread.set_field(firstThread, 'Ljava/lang/Thread;priority', 1);
                firstThread.set_field(firstThread, 'Ljava/lang/Thread;group', groupObj);
                firstThread.set_field(firstThread, 'Ljava/lang/Thread;threadLocals', null);
                firstThread.set_field(firstThread, 'Ljava/lang/Thread;blockerLock', new java_object.JavaObject(<ClassData.ReferenceClassData> this.bsCl.getInitializedClass('Ljava/lang/Object;')));
                next_item();
              });
            } else {
              next_item();
            }
          }
        });
      }, next);
    });

    /**
     * Task #5: Initialize the system class.
     */
    bootupTasks.push((next: (err?: any) => void) => {
      // Initialize the system class (initializes things like println/etc).
      var sysInit = this.bsCl.getInitializedClass('Ljava/lang/System;').get_method('initializeSystemClass()V');
      firstThread.runMethod(sysInit, [], next);
    });

    // Perform bootup tasks, and then trigger the callback function.
    util.asyncSeries(bootupTasks, (err?: any) => {
      if (err) {
        cb(err);
      } else {
        // XXX: Without setImmediate, the firstThread won't clear out the stack
        // frame that triggered us, and the firstThread won't transition to a
        // 'terminated' status.
        setImmediate(() => {
          cb(null, this);
        });
      }
    });
  }

  /**
   * Run the specified class on this JVM instance.
   * @param className The name of the class to run. Can be specified in either
   *   foo.bar.Baz or foo/bar/Baz format.
   * @param args Command line arguments passed to the class.
   * @param cb Called when the JVM finishes executing. Called with 'true' if
   *   the JVM exited normally, 'false' if there was an error.
   */
  public runClass(className: string, args: string[], cb: (result: boolean) => void): void {
    var thread = this.firstThread;
    assert(thread != null && thread.getStatus() === enums.ThreadStatus.TERMINATED);
    // Convert foo.bar.Baz => Lfoo/bar/Baz;
    className = "L" + className.replace(/\./g, '/') + ";";
    // Initialize the class.
    this.bsCl.initializeClass(thread, className, (cdata: ClassData.ReferenceClassData) => {
      if (cdata != null) {
        // Convert the arguments.
        var strArrCls = <ClassData.ArrayClassData> this.bsCl.getInitializedClass('[Ljava/lang/String;'),
          jvmifiedArgs = new java_object.JavaArray(strArrCls, args.map((a: string): java_object.JavaObject => java_object.initString(this.bsCl, a)));

        // Find the main method, and run it.
        var method = cdata.method_lookup(thread, 'main([Ljava/lang/String;)V');

        // Set the terminationCb here. The JVM will now terminate once all
        // threads have finished executing.
        this.terminationCb = cb;
        thread.runMethod(method, [jvmifiedArgs]);
      } else {
        // There was an error.
        cb(false);
      }
    });
  }

  /**
   * Run the specified JAR file on this JVM instance.
   * @param jarFilePath Path to the JAR file.
   * @param args Command line arguments passed to the class.
   * @param cb Called when the JVM finishes executing. Called with 'true' if
   *   the JVM exited normally, 'false' if there was an error.
   */
  public runJar(jarFilePath: string, args: string[], cb: (result: boolean) => void): void {
    this.bsCl.addClassPathItem(jarFilePath, (success) => {
      if (!success) {
        cb(success);
      } else {
        // Find the jar file's main class in its manifest.
        var jarFile = this.bsCl.getJar(jarFilePath);
        this.runClass(jarFile.getAttribute('Main-Class'), args, cb);
      }
    });
  }

  /**
   * Called when the ThreadPool is empty.
   */
  private emptyThreadPool() {
    if (this.terminationCb != null) {
      this.terminationCb(true);
    }
  }

  /**
   * Retrieve the given system property.
   */
  public getSystemProperty(prop: string): any {
    return this.systemProperties[prop];
  }

  /**
   * Sets the given system property.
   */
  public setSystemProperty(prop: string, val: any): void {
    this.systemProperties[prop] = val;
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
  public internString(str: string, javaObj?: java_object.JavaObject): java_object.JavaObject {
    if (this.internedStrings.has(str)) {
      return this.internedStrings.get(str);
    } else {
      if (!javaObj) {
        javaObj = java_object.initString(this.bsCl, str);
      }
      this.internedStrings.set(str, javaObj);
      return javaObj;
    }
  }

  /**
   * XXX: Hack to evaluate native modules in an environment with
   * java_object and ClassData defined.
   */
  private evalNativeModule(mod: string): any {
    "use strict"; // Prevent eval from being terrible.
    // Terrible hack.
    mod = mod.replace(/require\((\'|\")..\/([a-zA-Z_0-9]*)(\'|\")\)/g, 'require($1./$2$1)');
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
    clsName = util.descriptor2typestr(clsName);
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
   * @todo Make neater with util.async stuff.
   */
  private initializeNatives(done_cb: () => void): void {
    var next_dir = () => {
      if (i === this.nativeClasspath.length) {
        // Next phase: Load up the files.
        var count: number = process_files.length;
        process_files.forEach((file) => {
          fs.readFile(file, (err, data) => {
            if (!err)
              this.registerNatives(this.evalNativeModule(data.toString()));
            if (--count === 0) {
              done_cb();
            }
          });
        });
      } else {
        var dir = this.nativeClasspath[i++];
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
    this._initSystemProperties(this.systemProperties['sun.boot.class.path'],
                                  this.systemProperties['java.home']);
    // XXX: jcl_path is known-good; synchronously push it onto classpath.
    this.systemProperties['java.class.path'] = [this.systemProperties['sun.boot.class.path']];
  }

  /**
   * [Private] Same as reset_system_properties, but called by the constructor.
   */
  private _initSystemProperties(jcl_path: string, java_home_path: string): void {
    this.systemProperties = {
      'java.class.path': <string[]> [],
      'java.home': java_home_path,
      'sun.boot.class.path': jcl_path,
      'file.encoding': 'UTF-8',
      'java.vendor': 'Doppio',
      'java.version': '1.6',
      'java.vendor.url': 'https://github.com/plasma-umass/doppio',
      'java.class.version': '50.0',
      'java.specification.version': '1.6',
      'line.separator': '\n',
      'file.separator': path.sep,
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
      threads[i].setStatus(enums.ThreadStatus.TERMINATED);
    }
  }

  /**
   * Retrieves the bootstrap class loader.
   */
  public getBootstrapClassLoader(): ClassLoader.BootstrapClassLoader {
    return this.bsCl;
  }

  public getStartupTime(): Date {
    return this.startupTime;
  }
}

// Causes `require('jvm')` to be the JVM constructor itself
export = JVM;
