///<reference path='../vendor/DefinitelyTyped/node/node.d.ts' />
"use strict";
import util = require('./util');
import SafeMap = require('./SafeMap');
import methods = require('./methods');
import ClassData = require('./ClassData');
import ClassLoader = require('./ClassLoader');
import fs = require('fs');
import path = require('path');
import threading = require('./threading');
import enums = require('./enums');
import Heap = require('./heap');
import assert = require('./assert');
import interfaces = require('./interfaces');
import JVMTypes = require('../includes/JVMTypes');
declare var requirejs: any;

// XXX: We currently initialize these classes at JVM bootup. This is expensive.
// We should attempt to prune this list as much as possible.
var coreClasses = [
  'Ljava/lang/String;',
  'Ljava/lang/Class;', 'Ljava/lang/ClassLoader;',
  'Ljava/lang/reflect/Constructor;', 'Ljava/lang/reflect/Field;',
  'Ljava/lang/reflect/Method;',
  'Ljava/lang/Error;', 'Ljava/lang/StackTraceElement;',
  'Ljava/lang/System;',
  'Ljava/lang/Thread;',
  'Ljava/lang/ThreadGroup;',
  'Ljava/lang/Throwable;',
  'Ljava/nio/ByteOrder;',
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
  private systemProperties: {[prop: string]: string};
  private internedStrings: SafeMap<JVMTypes.java_lang_String> = new SafeMap<JVMTypes.java_lang_String>();
  private bsCl: ClassLoader.BootstrapClassLoader;
  private threadPool: threading.ThreadPool;
  private natives: { [clsName: string]: { [methSig: string]: Function } } = {};
  // 20MB heap
  // @todo Make heap resizeable.
  private heap: Heap = new Heap(20 * 1024 * 1024);
  private nativeClasspath: string[];
  private startupTime: Date = new Date();
  private terminationCb: (success: boolean) => void = null;
  // The initial JVM thread used to kick off execution.
  private firstThread: threading.JVMThread;
  private assertionsEnabled: boolean;
  private shutdown: boolean;
  private systemClassLoader: ClassLoader.ClassLoader = null;
  private nextRef: number = 0;
  // Set of all of the methods we want vtrace to be enabled on.
  // DEBUG builds only.
  private vtraceMethods: {[fullSig: string]: boolean} = {};
  // [DEBUG] directory to dump compiled code to.
  private dumpCompiledCodeDir: string = null;

  /**
   * (Async) Construct a new instance of the Java Virtual Machine.
   */
  constructor(opts: interfaces.JVMOptions, cb: (e: any, jvm?: JVM) => void) {
    var bootstrapClasspath: string[] = opts.bootstrapClasspath.map((p: string): string => path.resolve(p)),
      javaClassPath: string[] = opts.classpath.map((p: string): string => path.resolve(p)),
      javaHomePath = path.resolve(opts.javaHomePath),
      // JVM bootup tasks, from first to last task.
      bootupTasks: {(next: (err?: any) => void): void}[] = [],
      firstThread: threading.JVMThread,
      firstThreadObj: JVMTypes.java_lang_Thread;
    // @todo Resolve these, and integrate it into the ClassLoader?
    this.nativeClasspath = opts.nativeClasspath;
    this.assertionsEnabled = opts.assertionsEnabled;
    this._initSystemProperties(bootstrapClasspath, javaClassPath, javaHomePath);

    /**
     * Task #1: Initialize native methods.
     */
    bootupTasks.push((next: (err?: any) => void): void => {
      this.initializeNatives(next);
    });

    /**
     * Task #2: Construct the bootstrap class loader.
     */
    bootupTasks.push((next: (err?: any) => void): void => {
      this.bsCl =
        new ClassLoader.BootstrapClassLoader(bootstrapClasspath,
          opts.extractionPath, next);
    });

    /**
     * Task #3: Construct the thread pool, resolve thread class, and construct
     * the first thread.
     */
    bootupTasks.push((next: (err?: any) => void): void => {
      this.threadPool = new threading.ThreadPool(this, this.bsCl, (): void => {
        this.emptyThreadPool();
      });
      // Resolve Ljava/lang/Thread so we can fake a thread.
      // NOTE: This should never actually use the Thread object unless
      // there's an error loading java/lang/Thread and associated classes.
      this.bsCl.resolveClass(null, 'Ljava/lang/Thread;', (cdata: ClassData.ReferenceClassData<JVMTypes.java_lang_Thread>) => {
        if (cdata == null) {
          // Failed.
          next("Failed to resolve java/lang/Thread.");
        } else {
          // Fake a thread.
          firstThread = this.firstThread = this.threadPool.newThread(<any> {
            'java/lang/Thread/threadStatus': 0,
            'ref': 1
          });
          firstThread.immortal = true;
          next();
        }
      });
    });

    /**
     * Task #4: Preinitialize some essential JVM classes, and initializes the
     * JVM's ThreadGroup once that class is initialized.
     */
    bootupTasks.push((next: (err?: any) => void): void => {
      util.asyncForEach<string>(coreClasses, (coreClass: string, nextItem: (err?: any) => void) => {
        this.bsCl.initializeClass(firstThread, coreClass, (cdata: ClassData.ClassData) => {
          if (cdata == null) {
            nextItem(`Failed to initialize ${coreClass}`);
          } else {
            // One of the later preinitialized classes references Thread.group.
            // Initialize the system's ThreadGroup now.
            if (coreClass === 'Ljava/lang/ThreadGroup;') {
              // Construct a ThreadGroup object for the first thread.
              var threadGroupCons = (<ClassData.ReferenceClassData<JVMTypes.java_lang_ThreadGroup>> cdata).getConstructor(firstThread),
                groupObj = new threadGroupCons(firstThread);
              groupObj['<init>()V'](firstThread, (e?: JVMTypes.java_lang_Throwable) => {
                // Initialize the fields of our firstThread to make it real.
                firstThreadObj['java/lang/Thread/name'] = util.initCarr(this.bsCl, 'main');
                firstThreadObj['java/lang/Thread/priority'] = 1;
                firstThreadObj['java/lang/Thread/group'] = groupObj;
                firstThreadObj['java/lang/Thread/threadLocals'] = null;
                firstThreadObj['java/lang/Thread/blockerLock'] = new ((<ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> this.bsCl.getInitializedClass(firstThread, 'Ljava/lang/Object;')).getConstructor(firstThread))(firstThread);
                nextItem();
              });
            } else if (coreClass === 'Ljava/lang/Thread;') {
              // Make firstThread a *real* thread.
              var threadCons = (<ClassData.ReferenceClassData<JVMTypes.java_lang_Thread>> cdata).getConstructor(firstThread);
              firstThreadObj = new threadCons(firstThread);
              // Destroy the incorrectly created new thread, replace with
              // our bootup thread.
              firstThreadObj.$thread.setStatus(enums.ThreadStatus.TERMINATED);
              firstThreadObj.$thread = firstThread;
              firstThread.setJVMObject(firstThreadObj);
              firstThreadObj['<init>()V'](firstThread, (e?: JVMTypes.java_lang_Throwable) => {
                nextItem();
              });
            } else {
              nextItem();
            }
          }
        });
      }, next);
    });

    /**
     * Task #5: Initialize the system class.
     */
    bootupTasks.push((next: (err?: any) => void): void => {
      // Initialize the system class (initializes things like println/etc).
      var sysInit = <typeof JVMTypes.java_lang_System> (<ClassData.ReferenceClassData<JVMTypes.java_lang_System>> this.bsCl.getInitializedClass(firstThread, 'Ljava/lang/System;')).getConstructor(firstThread);
      sysInit['java/lang/System/initializeSystemClass()V'](firstThread, next);;
    });

    /**
     * Task #6: Initialize the application's classloader.
     */
    bootupTasks.push((next: (err?: any) => void) => {
      var clCons = <typeof JVMTypes.java_lang_ClassLoader> (<ClassData.ReferenceClassData<JVMTypes.java_lang_ClassLoader>> this.bsCl.getInitializedClass(firstThread, 'Ljava/lang/ClassLoader;')).getConstructor(firstThread);
      clCons['java/lang/ClassLoader/getSystemClassLoader()Ljava/lang/ClassLoader;'](firstThread, (e?: JVMTypes.java_lang_Throwable, rv?: JVMTypes.java_lang_ClassLoader) => {
        if (e) {
          next(e);
        } else {
          this.systemClassLoader = rv.$loader;
          firstThreadObj['java/lang/Thread/contextClassLoader'] = rv;
          next();
        }
      });
    });

    // Perform bootup tasks, and then trigger the callback function.
    util.asyncSeries(bootupTasks, (err?: any): void => {
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

  public getSystemClassLoader(): ClassLoader.ClassLoader {
    return this.systemClassLoader;
  }

  /**
   * Get the next "ref" number for JVM objects.
   */
  public getNextRef(): number {
    return this.nextRef++;
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
    // Disable immortal status from JVM bootup.
    thread.immortal = false;
    assert(thread != null);
    // Convert foo.bar.Baz => Lfoo/bar/Baz;
    className = util.int_classname(className);
    // Initialize the class.
    this.systemClassLoader.initializeClass(thread, className, (cdata: ClassData.ReferenceClassData<any>) => {
      if (cdata != null) {
        // Convert the arguments.
        var strArrCons = (<ClassData.ArrayClassData<JVMTypes.java_lang_String>> this.bsCl.getInitializedClass(thread, '[Ljava/lang/String;')).getConstructor(thread),
          jvmifiedArgs = new strArrCons(thread, args.length), i: number;

        for (i = 0; i < args.length; i++) {
          jvmifiedArgs.array[i] = util.initString(this.bsCl, args[i]);
        }

        // Set the terminationCb here. The JVM will now terminate once all
        // threads have finished executing.
        this.terminationCb = cb;

        // Find the main method, and run it.
        // TODO: Error checking!
        var cdataStatics = <any> cdata.getConstructor(thread);
        if (cdataStatics['main([Ljava/lang/String;)V']) {
          cdataStatics['main([Ljava/lang/String;)V'](thread, [jvmifiedArgs]);
        } else {
          thread.throwNewException("Ljava/lang/NoSuchMethodError;", `Could not find main method in class ${cdata.getExternalName()}.`);
        }
      } else {
        // There was an error.
        this.terminationCb = cb;
      }
    });
  }

  /**
   * [DEBUG] Returns 'true' if the specified method should be vtraced.
   */
  public shouldVtrace(sig: string): boolean {
    return this.vtraceMethods[sig] === true;
  }

  /**
   * [DEBUG] Specify a method to vtrace.
   */
  public vtraceMethod(sig: string): void {
    this.vtraceMethods[sig] = true;
  }

  /**
   * Run the specified JAR file on this JVM instance.
   * @param args Command line arguments passed to the class.
   * @param cb Called when the JVM finishes executing. Called with 'true' if
   *   the JVM exited normally, 'false' if there was an error.
   */
  public runJar(args: string[], cb: (result: boolean) => void): void {
    this.runClass('doppio.JarLauncher', args, cb);
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
  public getSystemProperty(prop: string): string {
    return this.systemProperties[prop];
  }

  /**
   * Retrieve an array of all of the system property names.
   */
  public getSystemPropertyNames(): string[] {
    return Object.keys(this.systemProperties);
  }

  /**
   * Sets the given system property.
   */
  public setSystemProperty(prop: string, val: string): void {
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
  public internString(str: string, javaObj?: JVMTypes.java_lang_String): JVMTypes.java_lang_String {
    if (this.internedStrings.has(str)) {
      return this.internedStrings.get(str);
    } else {
      if (!javaObj) {
        javaObj = util.initString(this.bsCl, str);
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
    var rv: any, savedRequire = typeof require !== 'undefined' ? require : function(moduleName: string): any {
      // require isn't defined in the browser for some reason? but requirejs works; it just
      // requires an absolute module name.
      if (moduleName.charAt(0) === '.') {
        moduleName = './src' + moduleName.slice(1);
      }
      return requirejs(moduleName);
    };
    (() => {
      /* tslint:disable:no-unused-variable */
      /**
       * Called by the native method file. Registers the package's native
       * methods with the JVM.
       */
      function registerNatives(defs: any): void {
        rv = defs;
      }
      /**
       * Emulate the CommonJS 'require' function for natives compiled as CommonJS
       * modules.
       *
       * Redirects module requests for "../<module>.js" to "./<module>.js", as
       * the JVM lives in a separate directory from natives.
       *
       * @todo This is not robust to arbitrary native definition locations!
       */
      function require(moduleName: string): any {
        return savedRequire(moduleName.replace(/..\/([a-zA-Z_0-9]*)/g, './$1'));
      }
      /**
       * Emulate AMD module 'define' function for natives compiled as AMD modules.
       */
      function define(resources: string[], module: Function) {
        var args: any[] = [];
        resources.forEach((resource: string) => {
          switch (resource) {
            case 'require':
              args.push(require);
              break;
            case 'exports':
              args.push({});
              break;
            default:
              args.push(require(resource));
              break;
          }
        });
        module.apply(null, args);
      }
      eval(mod);
      /* tslint:enable:no-unused-variable */
    })();
    return rv;
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
   * !!DO NOT MUTATE THE RETURNED VALUE!!
   * Used by the find_invalid_natives tool.
   */
  public getNatives(): { [clsName: string]: { [methSig: string]: Function } } {
    return this.natives;
  }

  /**
   * Loads in all of the native method modules prior to execution.
   * Currently a hack around our classloader.
   * @todo Make neater with util.async stuff.
   */
  private initializeNatives(doneCb: () => void): void {
    var nextDir = () => {
      if (i === this.nativeClasspath.length) {
        // Next phase: Load up the files.
        var count: number = processFiles.length;
        processFiles.forEach((file: string) => {
          fs.readFile(file, (err: any, data: NodeBuffer) => {
            if (!err) {
              this.registerNatives(this.evalNativeModule(data.toString()));
            }
            if (--count === 0) {
              doneCb();
            }
          });
        });
      } else {
        var dir = this.nativeClasspath[i++];
        fs.readdir(dir, (err: any, files: string[]) => {
          if (err) {
            return doneCb();
          }

          var j: number, file: string;
          for (j = 0; j < files.length; j++) {
            file = files[j];
            if (file.substring(file.length - 3, file.length) === '.js') {
              processFiles.push(path.join(dir, file));
            }
          }
          nextDir();
        });
      }
    }, i: number = 0, processFiles: string[] = [];

    nextDir();
  }

  /**
   * [Private] Same as reset_system_properties, but called by the constructor.
   */
  private _initSystemProperties(bootstrapClasspath: string[], javaClassPath: string[], javaHomePath: string): void {
    this.systemProperties = {
      'java.class.path': javaClassPath.join(':'),
      'java.home': javaHomePath,
      'sun.boot.class.path': bootstrapClasspath.join(':'),
      'file.encoding': 'UTF-8',
      'java.vendor': 'Doppio',
      'java.version': '1.8',
      'java.vendor.url': 'https://github.com/plasma-umass/doppio',
      'java.class.version': '52.0',
      'java.specification.version': '1.8',
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
    this.shutdown = true;
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

  /**
   * Returns `true` if assertions are enabled, false otherwise.
   */
  public areAssertionsEnabled(): boolean {
    return this.assertionsEnabled;
  }

  public isShutdown(): boolean {
    return this.shutdown;
  }

  /**
   * Specifies a directory to dump compiled code to.
   */
  public dumpCompiledCode(dir: string): void {
    this.dumpCompiledCodeDir = dir;
  }

  public shouldDumpCompiledCode(): boolean {
    return this.dumpCompiledCodeDir !== null;
  }

  public dumpObjectDefinition(cls: ClassData.ClassData, evalText: string): void {
    if (this.shouldDumpCompiledCode()) {
      fs.writeFile(path.resolve(this.dumpCompiledCodeDir, cls.getExternalName() + "_object.dump"), evalText, () => {});
    }
  }

  public dumpBridgeMethod(methodSig: string, evalText: string): void {
    if (this.shouldDumpCompiledCode()) {
      fs.appendFile(path.resolve(this.dumpCompiledCodeDir, "vmtarget_bridge_methods.dump"), `${methodSig}:\n${evalText}\n\n`, () => {});
    }
  }

  /**
   * Asynchronously dumps JVM state to a file. Currently limited to thread
   * state.
   */
  public dumpState(filename: string, cb: (er: any) => void): void {
    fs.appendFile(filename, this.threadPool.getThreads().map((t: threading.JVMThread) => `Thread ${t.getRef()}:\n` + t.getPrintableStackTrace()).join("\n\n"), cb);
  }
}

// Causes `require('jvm')` to be the JVM constructor itself
export = JVM;
