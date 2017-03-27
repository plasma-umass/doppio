import {are_in_browser, initCarr, merge, asyncForEach, asyncSeries, ext_classname, initString, int_classname, descriptor2typestr} from './util';
import SafeMap from './SafeMap';
import {dumpStats} from './methods';
import {ClassData, ReferenceClassData, ArrayClassData} from './ClassData';
import {BootstrapClassLoader, ClassLoader} from './ClassLoader';
import * as fs from 'fs';
import * as path from 'path';
import * as buffer from 'buffer';
import {JVMThread} from './threading';
import {ThreadStatus, JVMStatus} from './enums';
import Heap from './heap';
import assert from './assert';
import {JVMOptions} from './interfaces';
import * as JVMTypes from '../includes/JVMTypes';
import Parker from './parker';
import ThreadPool from './threadpool';
import * as JDKInfo from '../vendor/java_home/jdk.json';
import global from './global';
import getGlobalRequire from './global_require';
import * as BrowserFS from 'browserfs';
import * as DoppioJVM from './doppiojvm';
import {setImmediate} from 'browserfs';

declare var RELEASE: boolean;
if (typeof RELEASE === 'undefined') global.RELEASE = false;

// For version information.
let pkg: any;
if (are_in_browser()) {
  pkg = require('../package.json');
} else {
  pkg = require('../../../package.json');
}


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
  '[Lsun/management/MemoryPoolImpl;',
  // Contains important FS constants used by natives. These constants are
  // inlined into JCL class files, so it typically never gets initialized
  // implicitly by the JVM.
  'Lsun/nio/fs/UnixConstants;'
];

/**
 * Encapsulates a single JVM instance.
 */
class JVM {
  private systemProperties: {[prop: string]: string} = null;
  private internedStrings: SafeMap<JVMTypes.java_lang_String> = new SafeMap<JVMTypes.java_lang_String>();
  private bsCl: BootstrapClassLoader = null;
  private threadPool: ThreadPool<JVMThread> = null;
  private natives: { [clsName: string]: { [methSig: string]: Function } } = {};
  // 20MB heap
  // @todo Make heap resizeable.
  private heap: Heap = new Heap(20 * 1024 * 1024);
  private nativeClasspath: string[] = null;
  private startupTime: Date = new Date();
  private terminationCb: (code: number) => void = null;
  // The initial JVM thread used to kick off execution.
  private firstThread: JVMThread = null;
  private responsiveness: number | (() => number) = null;
  private enableSystemAssertions: boolean = false;
  private enabledAssertions: boolean | string[] = false;
  private disabledAssertions: string[] = [];
  private printJITCompilation: boolean = false;
  private systemClassLoader: ClassLoader = null;
  private nextRef: number = 0;
  // Set of all of the methods we want vtrace to be enabled on.
  // DEBUG builds only.
  private vtraceMethods: {[fullSig: string]: boolean} = {};
  // [DEBUG] directory to dump compiled code to.
  private dumpCompiledCodeDir: string = null;
  // Handles parking/unparking threads.
  private parker = new Parker();
  // The current status of the JVM.
  private status: JVMStatus = JVMStatus.BOOTING;
  // The JVM's planned exit code.
  private exitCode: number = 0;

  // is JIT disabled?
  private jitDisabled: boolean = false;
  private dumpJITStats: boolean = false;

  // Get the environment's require variable, indirectly.
  // Hidden from webpack and other builders, as it confuses them.
  private globalRequire: Function = null;

  public static isReleaseBuild(): boolean {
    return typeof(RELEASE) !== 'undefined' && RELEASE;
  }
  private static getNativeMethodModules(): (() => any)[] {
    if (!this._haveAddedBuiltinNativeModules) {
      // NOTE: Replace with an ES6 import when we switch to a supporting bundler like Rollup.
      // Currently cannot import these above to avoid circular imports, which Webpack does not
      // support.
      JVM.registerNativeModule(require('./natives/doppio').default);
      JVM.registerNativeModule(require('./natives/java_io').default);
      JVM.registerNativeModule(require('./natives/java_lang').default);
      JVM.registerNativeModule(require('./natives/java_net').default);
      JVM.registerNativeModule(require('./natives/java_nio').default);
      JVM.registerNativeModule(require('./natives/java_security').default);
      JVM.registerNativeModule(require('./natives/java_util').default);
      JVM.registerNativeModule(require('./natives/sun_font').default);
      JVM.registerNativeModule(require('./natives/sun_management').default);
      JVM.registerNativeModule(require('./natives/sun_misc').default);
      JVM.registerNativeModule(require('./natives/sun_net').default);
      JVM.registerNativeModule(require('./natives/sun_nio').default);
      JVM.registerNativeModule(require('./natives/sun_reflect').default);
      this._haveAddedBuiltinNativeModules = true;
    }
    return this._nativeMethodModules;
  }

  private static _nativeMethodModules: (() => any)[] = [];
  private static _haveAddedBuiltinNativeModules = false;
  /**
   * Registers a JavaScript module that provides particular native methods with Doppio.
   * All new JVMs constructed will auto-run this module to add its natives.
   */
  public static registerNativeModule(mod: () => any): void {
    this._nativeMethodModules.push(mod);
  }

  /**
   * (Async) Construct a new instance of the Java Virtual Machine.
   */
  constructor(opts: JVMOptions, cb: (e: any, jvm?: JVM) => void) {
    if (typeof(opts.doppioHomePath) !== 'string') {
      throw new TypeError("opts.doppioHomePath *must* be specified.");
    }
    opts = <JVMOptions> merge(JVM.getDefaultOptions(opts.doppioHomePath), opts);

    this.jitDisabled = opts.intMode;
    this.dumpJITStats = opts.dumpJITStats;

    var bootstrapClasspath: string[] = opts.bootstrapClasspath.map((p: string): string => path.resolve(p)),
      // JVM bootup tasks, from first to last task.
      bootupTasks: {(next: (err?: any) => void): void}[] = [],
      firstThread: JVMThread,
      firstThreadObj: JVMTypes.java_lang_Thread;

    // Sanity checks.
    if (!Array.isArray(opts.bootstrapClasspath) || opts.bootstrapClasspath.length === 0) {
      throw new TypeError("opts.bootstrapClasspath must be specified as an array of file paths.");
    }
    if (!Array.isArray(opts.classpath)) {
      throw new TypeError("opts.classpath must be specified as an array of file paths.");
    }
    if (typeof(opts.javaHomePath) !== 'string') {
      throw new TypeError("opts.javaHomePath must be specified.");
    }
    if (!opts.nativeClasspath) {
      opts.nativeClasspath = [];
    }
    if (!Array.isArray(opts.nativeClasspath)) {
      throw new TypeError("opts.nativeClasspath must be specified as an array of file paths.");
    }

    this.nativeClasspath = opts.nativeClasspath;
    if (opts.enableSystemAssertions) {
      this.enableSystemAssertions = opts.enableSystemAssertions;
    }
    if (opts.enableAssertions) {
      this.enabledAssertions = opts.enableAssertions;
    }
    if (opts.disableAssertions) {
      this.disabledAssertions = opts.disableAssertions;
    }

    this.responsiveness = opts.responsiveness;

    this._initSystemProperties(bootstrapClasspath,
      opts.classpath.map((p: string): string => path.resolve(p)),
      path.resolve(opts.javaHomePath),
      path.resolve(opts.tmpDir),
      opts.properties);

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
        new BootstrapClassLoader(this.systemProperties['java.home'], bootstrapClasspath, next);
    });

    /**
     * Task #3: Construct the thread pool, resolve thread class, and construct
     * the first thread.
     */
    bootupTasks.push((next: (err?: any) => void): void => {
      this.threadPool = new ThreadPool<JVMThread>((): boolean => { return this.threadPoolIsEmpty(); });
      // Resolve Ljava/lang/Thread so we can fake a thread.
      // NOTE: This should never actually use the Thread object unless
      // there's an error loading java/lang/Thread and associated classes.
      this.bsCl.resolveClass(null, 'Ljava/lang/Thread;', (threadCdata: ReferenceClassData<JVMTypes.java_lang_Thread>) => {
        if (threadCdata == null) {
          // Failed.
          next("Failed to resolve java/lang/Thread.");
        } else {
          // Construct a thread.
          firstThreadObj = new (threadCdata.getConstructor(null))(null);
          firstThreadObj.$thread = firstThread = this.firstThread = new JVMThread(this, this.threadPool, firstThreadObj);
          firstThreadObj.ref = 1;
          firstThreadObj['java/lang/Thread/priority'] = 5;
          firstThreadObj['java/lang/Thread/name'] = initCarr(this.bsCl, 'main');
          firstThreadObj['java/lang/Thread/blockerLock'] = new ((<ReferenceClassData<JVMTypes.java_lang_Object>> this.bsCl.getResolvedClass('Ljava/lang/Object;')).getConstructor(firstThread))(firstThread);
          next();
        }
      });
    });

    /**
     * Task #4: Preinitialize some essential JVM classes, and initializes the
     * JVM's ThreadGroup once that class is initialized.
     */
    bootupTasks.push((next: (err?: any) => void): void => {
      asyncForEach<string>(coreClasses, (coreClass: string, nextItem: (err?: any) => void) => {
        this.bsCl.initializeClass(firstThread, coreClass, (cdata: ClassData) => {
          if (cdata == null) {
            nextItem(`Failed to initialize ${coreClass}`);
          } else {
            // One of the later preinitialized classes references Thread.group.
            // Initialize the system's ThreadGroup now.
            if (coreClass === 'Ljava/lang/ThreadGroup;') {
              // Construct a ThreadGroup object for the first thread.
              var threadGroupCons = (<ReferenceClassData<JVMTypes.java_lang_ThreadGroup>> cdata).getConstructor(firstThread),
                groupObj = new threadGroupCons(firstThread);
              groupObj['<init>()V'](firstThread, null, (e?: JVMTypes.java_lang_Throwable) => {
                // Tell the initial thread to use this group.
                firstThreadObj['java/lang/Thread/group'] = groupObj;
                nextItem(e);
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
      var sysInit = <typeof JVMTypes.java_lang_System> (<ReferenceClassData<JVMTypes.java_lang_System>> this.bsCl.getInitializedClass(firstThread, 'Ljava/lang/System;')).getConstructor(firstThread);
      sysInit['java/lang/System/initializeSystemClass()V'](firstThread, null, next);;
    });

    /**
     * Task #6: Initialize the application's
     */
    bootupTasks.push((next: (err?: any) => void) => {
      var clCons = <typeof JVMTypes.java_lang_ClassLoader> (<ReferenceClassData<JVMTypes.java_lang_ClassLoader>> this.bsCl.getInitializedClass(firstThread, 'Ljava/lang/ClassLoader;')).getConstructor(firstThread);
      clCons['java/lang/ClassLoader/getSystemClassLoader()Ljava/lang/ClassLoader;'](firstThread, null, (e?: JVMTypes.java_lang_Throwable, rv?: JVMTypes.java_lang_ClassLoader) => {
        if (e) {
          next(e);
        } else {
          this.systemClassLoader = rv.$loader;
          firstThreadObj['java/lang/Thread/contextClassLoader'] = rv;

          // Initialize assertion data.
          // TODO: Is there a better way to force this? :|
          let defaultAssertionStatus = this.enabledAssertions === true ? 1 : 0;
          rv['java/lang/ClassLoader/setDefaultAssertionStatus(Z)V'](firstThread, [defaultAssertionStatus], next);
        }
      });
    });

    /**
     * Task #7: Initialize DoppioJVM's security provider for things like cryptographically strong RNG.
     */
    bootupTasks.push((next: (err?: any) => void) => {
      this.bsCl.initializeClass(firstThread, 'Ldoppio/security/DoppioProvider;', (cdata) => {
        next(cdata ? null : new Error(`Failed to initialize DoppioProvider.`));
      });
    });

    // Perform bootup tasks, and then trigger the callback function.
    asyncSeries(bootupTasks, (err?: any): void => {
      // XXX: Without setImmediate, the firstThread won't clear out the stack
      // frame that triggered us, and the firstThread won't transition to a
      // 'terminated' status.
      setImmediate(() => {
        if (err) {
          this.status = JVMStatus.TERMINATED;
          cb(err);
        } else {
          this.status = JVMStatus.BOOTED;
          cb(null, this);
        }
      });
    });
  }

  public getResponsiveness():number {
    const resp = this.responsiveness;
    if (typeof resp === 'number') {
      return resp;
    } else if (typeof resp === 'function') {
      return resp();
    }
  }

  public static getDefaultOptions(doppioHome: string): JVMOptions {
    let javaHome = path.join(doppioHome, 'vendor', 'java_home');
    return {
      doppioHomePath: doppioHome,
      classpath: ['.'],
      bootstrapClasspath: JDKInfo.classpath.map((item) => path.join(javaHome, item)),
      javaHomePath: javaHome,
      nativeClasspath: [],
      enableSystemAssertions: false,
      enableAssertions: false,
      disableAssertions: null,
      properties: {},
      tmpDir: '/tmp',
      responsiveness: 1000,
      intMode: false,
      dumpJITStats: false
    };
  }

  /**
   * Get the URL to the version of the JDK that DoppioJVM was compiled with.
   */
  public static getCompiledJDKURL(): string {
    return JDKInfo.url;
  }

  /**
   * Get the JDK information that DoppioJVM was compiled against.
   */
  public static getJDKInfo(): any {
    return JDKInfo;
  }

  public getSystemClassLoader(): ClassLoader {
    return this.systemClassLoader;
  }

  /**
   * Get the next "ref" number for JVM objects.
   */
  public getNextRef(): number {
    return this.nextRef++;
  }

  /**
   * Retrieve the JVM's parker. Handles parking/unparking threads.
   */
  public getParker(): Parker {
    return this.parker;
  }

  /**
   * Run the specified class on this JVM instance.
   * @param className The name of the class to run. Can be specified in either
   *   foo.bar.Baz or foo/bar/Baz format.
   * @param args Command line arguments passed to the class.
   * @param cb Called when the JVM finishes executing. Called with 'true' if
   *   the JVM exited normally, 'false' if there was an error.
   */
  public runClass(className: string, args: string[], cb: (code: number) => void): void {
    if (this.status !== JVMStatus.BOOTED) {
      switch (this.status) {
        case JVMStatus.BOOTING:
          throw new Error(`JVM is currently booting up. Please wait for it to call the bootup callback, which you passed to the constructor.`);
        case JVMStatus.RUNNING:
          throw new Error(`JVM is already running.`);
        case JVMStatus.TERMINATED:
          throw new Error(`This JVM has already terminated. Please create a new JVM.`);
        case JVMStatus.TERMINATING:
          throw new Error(`This JVM is currently terminating. You should create a new JVM for each class you wish to run.`);
      }
    }
    this.terminationCb = cb;

    var thread = this.firstThread;
    assert(thread != null, `Thread isn't created yet?`);
    // Convert foo.bar.Baz => Lfoo/bar/Baz;
    className = int_classname(className);

    // Initialize the class.
    this.systemClassLoader.initializeClass(thread, className, (cdata: ReferenceClassData<any>) => {
      // If cdata is null, there was an error that ended execution.
      if (cdata != null) {
        // Convert the arguments.
        var strArrCons = (<ArrayClassData<JVMTypes.java_lang_String>> this.bsCl.getInitializedClass(thread, '[Ljava/lang/String;')).getConstructor(thread),
          jvmifiedArgs = new strArrCons(thread, args.length), i: number;

        for (i = 0; i < args.length; i++) {
          jvmifiedArgs.array[i] = initString(this.bsCl, args[i]);
        }

        // Find the main method, and run it.
        this.status = JVMStatus.RUNNING;
        var cdataStatics = <any> cdata.getConstructor(thread);
        if (cdataStatics['main([Ljava/lang/String;)V']) {
          cdataStatics['main([Ljava/lang/String;)V'](thread, [jvmifiedArgs]);
        } else {
          thread.throwNewException("Ljava/lang/NoSuchMethodError;", `Could not find main method in class ${cdata.getExternalName()}.`);
        }
      } else {
        process.stdout.write(`Error: Could not find or load main class ${ext_classname(className)}\n`);
        // Erroneous exit.
        this.terminationCb(1);
      }
    });
  }

  /**
   * Returns 'true' if confined to interpreter mode
   */
  public isJITDisabled(): boolean {
    return this.jitDisabled;
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
  public runJar(args: string[], cb: (code: number) => void): void {
    this.runClass('doppio.JarLauncher', args, cb);
  }

  /**
   * Called when the ThreadPool is empty.
   */
  private threadPoolIsEmpty(): boolean {
    var systemClass: ReferenceClassData<JVMTypes.java_lang_System>,
      systemCons: typeof JVMTypes.java_lang_System;
    switch (this.status) {
      case JVMStatus.BOOTING:
        // Ignore empty thread pools during boot process.
        return false;
      case JVMStatus.BOOTED:
        assert(false, `Thread pool should not become empty after JVM is booted, but before it begins to run.`);
        return false;
      case JVMStatus.RUNNING:
        this.status = JVMStatus.TERMINATING;
        systemClass = <any> this.bsCl.getInitializedClass(this.firstThread, 'Ljava/lang/System;');
        assert(systemClass !== null, `Invariant failure: System class must be initialized when JVM is in RUNNING state.`);
        systemCons = <any> systemClass.getConstructor(this.firstThread);
        // This is a normal, non-erroneous exit. When this function completes, threadPoolIsEmpty() will be invoked again.
        systemCons['java/lang/System/exit(I)V'](this.firstThread, [0]);
        return false;
      case JVMStatus.TERMINATED:
        assert(false, `Invariant failure: Thread pool cannot be emptied post-JVM termination.`);
        return false;
      case JVMStatus.TERMINATING:

        if (!RELEASE && this.dumpJITStats) {
          dumpStats();
        }

        this.status = JVMStatus.TERMINATED;
        if (this.terminationCb) {
          this.terminationCb(this.exitCode);
        }
        this.firstThread.close();
        return true;
    }
  }

  /**
   * Check if the JVM has started running the main class.
   */
  public hasVMBooted(): boolean {
    return !(this.status === JVMStatus.BOOTING || this.status === JVMStatus.BOOTED);
  }

  /**
   * Completely halt the JVM.
   */
  public halt(status: number): void {
    this.exitCode = status;
    this.status = JVMStatus.TERMINATING;
    this.threadPool.getThreads().forEach((t) => {
      t.setStatus(ThreadStatus.TERMINATED);
    });
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
        javaObj = initString(this.bsCl, str);
      }
      this.internedStrings.set(str, javaObj);
      return javaObj;
    }
  }

  /**
   * Evaluate native modules. Emulates CommonJS functionality.
   */
  private evalNativeModule(mod: string): any {
    if (!this.globalRequire) {
      this.globalRequire = getGlobalRequire();
    }
    let rv: any;
    /**
     * Called by the native method file. Registers the package's native
     * methods with the JVM.
     */
    function registerNatives(defs: any): void {
      rv = defs;
    }
    // Provide the natives with the Doppio API, if needed.
    const globalRequire = this.globalRequire;

    /**
     * An emulation of CommonJS require() for the modules.
     */
    function moduleRequire(name: string): any {
      switch(name) {
        case 'doppiojvm':
        case '../doppiojvm':
          return DoppioJVM;
        case 'fs':
          return fs;
        case 'path':
          return path;
        case 'buffer':
          return buffer;
        case 'browserfs':
          return BrowserFS;
        default:
          return globalRequire(name);
      }
    }
    /**
     * Emulate AMD module 'define' function for natives compiled as AMD modules.
     */
    function moduleDefine(resources: string[], module: Function): void {
      let args: any[] = [];
      resources.forEach(function(resource) {
        switch (resource) {
          case 'require':
            args.push(moduleRequire);
            break;
          case 'exports':
            args.push({});
            break;
          default:
            args.push(moduleRequire(resource));
            break;
        }
      });
      module.apply(null, args);
    }

    const modFcn = new Function("require", "define", "registerNatives", "process", "DoppioJVM", "Buffer", mod);
    modFcn(moduleRequire, moduleDefine, registerNatives, process, DoppioJVM, Buffer);
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
    this.registerNatives({ [clsName]: { [methSig]: native } });
  }

  /**
   * Retrieve the native method for the given method of the given class.
   * Returns null if none found.
   */
  public getNative(clsName: string, methSig: string): Function {
    clsName = descriptor2typestr(clsName);
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
   * Currently a hack around our
   * @todo Make neater with async stuff.
   */
  private initializeNatives(doneCb: () => void): void {
    const registeredModules = JVM.getNativeMethodModules();
    for (let i = 0; i < registeredModules.length; i++) {
      this.registerNatives(registeredModules[i]());
    }
    var nextDir = () => {
      if (i === this.nativeClasspath.length) {
        // Next phase: Load up the files.
        let count: number = processFiles.length;
        if (count === 0) {
          return doneCb();
        }
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
  private _initSystemProperties(bootstrapClasspath: string[], javaClassPath: string[], javaHomePath: string, tmpDir: string, opts: {[name: string]: string}): void {
    this.systemProperties = merge({
      'java.class.path': javaClassPath.join(':'),
      'java.home': javaHomePath,
      'java.ext.dirs': path.join(javaHomePath, 'lib', 'ext'),
      'java.io.tmpdir': tmpDir,
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
      'java.vm.name': 'DoppioJVM 32-bit VM',
      'java.vm.version': pkg.version,
      'java.vm.vendor': 'PLASMA@UMass',
      'java.awt.headless': (are_in_browser()).toString(), // true if we're using the console frontend
      'java.awt.graphicsenv': 'classes.awt.CanvasGraphicsEnvironment',
      'jline.terminal': 'jline.UnsupportedTerminal', // we can't shell out to `stty`,
      'sun.arch.data.model': '32', // Identify as 32-bit, because that's how we act.
      'sun.jnu.encoding': "UTF-8" // Determines how Java parses command line options.
    }, opts);
  }

  /**
   * Retrieves the bootstrap class loader.
   */
  public getBootstrapClassLoader(): BootstrapClassLoader {
    return this.bsCl;
  }

  public getStartupTime(): Date {
    return this.startupTime;
  }

  /**
   * Returns `true` if system assertions are enabled, false otherwise.
   */
  public areSystemAssertionsEnabled(): boolean {
    return this.enableSystemAssertions;
  }

  /**
   * Get a listing of classes with assertions enabled. Can also return 'true' or 'false.
   */
  public getEnabledAssertions(): string[] | boolean {
    return this.enabledAssertions;
  }

  /**
   * Get a listing of classes with assertions disabled.
   */
  public getDisabledAssertions(): string[] {
    return this.disabledAssertions;
  }

  public setPrintJITCompilation(enabledOrNot: boolean) {
    this.printJITCompilation = enabledOrNot;
  }

  public shouldPrintJITCompilation(): boolean {
    return this.printJITCompilation;
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

  public dumpObjectDefinition(cls: ClassData, evalText: string): void {
    if (this.shouldDumpCompiledCode()) {
      fs.writeFile(path.resolve(this.dumpCompiledCodeDir, cls.getExternalName() + ".js"), evalText, () => {});
    }
  }

  public dumpBridgeMethod(methodSig: string, evalText: string): void {
    if (this.shouldDumpCompiledCode()) {
      fs.appendFile(path.resolve(this.dumpCompiledCodeDir, "vmtarget_bridge_methods.dump"), `${methodSig}:\n${evalText}\n\n`, () => {});
    }
  }

  public dumpCompiledMethod(methodSig: string, pc: number, code: string): void {
    if (this.shouldDumpCompiledCode()) {
      fs.appendFile(path.resolve(this.dumpCompiledCodeDir, 'JIT_compiled_methods.dump'), `${methodSig}:${pc}:\n${code}\n\n`, () => {});
    }
  }

  /**
   * Asynchronously dumps JVM state to a file. Currently limited to thread
   * state.
   */
  public dumpState(filename: string, cb: (er: any) => void): void {
    fs.appendFile(filename, this.threadPool.getThreads().map((t: JVMThread) => `Thread ${t.getRef()}:\n` + t.getPrintableStackTrace()).join("\n\n"), cb);
  }
}

export default JVM;
