import {ClassData, ReferenceClassData, ArrayClassData, PrimitiveClassData} from './ClassData';
import threading = require('./threading');
import ClassLock = require('./ClassLock');
import {IClasspathItem, ClasspathFactory} from './classpath';
import {TriState} from './enums';
import util = require('./util');
import methods = require('./methods');
import logging = require('./logging');
import assert = require('./assert');
import JAR = require('./jar');
import path = require('path');
import fs = require('fs');
import JVMTypes = require('../includes/JVMTypes');
var debug = logging.debug;

/**
 * Used to lock classes for loading.
 */
class ClassLocks {
  /**
   * typrStr => array of callbacks to trigger when operation completes.
   */
  private locks: { [typeStr: string]: ClassLock } = {};

  constructor() {}

  /**
   * Checks if the lock for the given class is already taken. If not, it takes
   * the lock. If it is taken, we enqueue the callback.
   * NOTE: For convenience, will handle triggering the owner's callback as well.
   */
  public tryLock(typeStr: string, thread: threading.JVMThread, cb: (cdata: ClassData) => void): boolean {
    if (typeof this.locks[typeStr] === 'undefined') {
      this.locks[typeStr] = new ClassLock();
    }
    return this.locks[typeStr].tryLock(thread, cb);
  }

  /**
   * Releases the lock on the given string.
   */
  public unlock(typeStr: string, cdata: ClassData): void {
    this.locks[typeStr].unlock(cdata);
    // No need for this lock to remain.
    delete this.locks[typeStr];
  }

  /**
   * Returns the owning thread of a given lock. Returns null if the specified
   * type string is not locked.
   */
  public getOwner(typeStr: string): threading.JVMThread {
    if (this.locks[typeStr]) {
      return this.locks[typeStr].getOwner();
    }
    return null;
  }
}

/**
 * Base classloader class. Contains common class resolution and instantiation
 * logic.
 */
export abstract class ClassLoader {
  /**
   * Stores loaded *reference* and *array* classes.
   */
  private loadedClasses: { [typeStr: string]: ClassData } = {};
  /**
   * Stores callbacks that are waiting for another thread to finish loading
   * the specified class.
   */
  private loadClassLocks: ClassLocks = new ClassLocks();

  /**
   * @param bootstrap The JVM's bootstrap classloader. ClassLoaders use it
   *   to retrieve primitive types.
   */
  constructor(public bootstrap: BootstrapClassLoader) { }

  /**
   * Retrieve a listing of classes that are loaded in this class loader.
   */
  public getLoadedClassNames(): string[] {
    return Object.keys(this.loadedClasses);
  }

  /**
   * Adds the specified class to the classloader. As opposed to defineClass,
   * which defines a new class from bytes with the classloader.
   *
   * What's the difference?
   * * Classes created with defineClass are defined by this classloader.
   * * Classes added with addClass may have been defined by a different
   *   classloader. This happens when a custom class loader's loadClass
   *   function proxies classloading to a different classloader.
   *
   * @param typeStr The type string of the class.
   * @param classData The class data object representing the class.
   */
  public addClass(typeStr: string, classData: ClassData): void {
    // If the class is already added, ensure it is the same class we are adding again.
    assert(this.loadedClasses[typeStr] != null ? this.loadedClasses[typeStr] === classData : true);
    this.loadedClasses[typeStr] = classData;
  }

  /**
   * No-frills. Get the class if it's defined in the class loader, no matter
   * what shape it is in.
   *
   * Should only be used internally by ClassLoader subclasses.
   */
  protected getClass(typeStr: string): ClassData {
    return this.loadedClasses[typeStr];
  }

  /**
   * Defines a new class with the class loader from an array of bytes.
   * @param thread The thread that is currently in control when this class is
   *   being defined. An exception may be thrown if there is an issue parsing
   *   the class file.
   * @param typeStr The type string of the class (e.g. "Ljava/lang/Object;")
   * @param data The data associated with the class as a binary blob.
   * @param protectionDomain The protection domain for the class (can be NULL).
   * @return The defined class, or null if there was an issue.
   */
  public defineClass<T extends JVMTypes.java_lang_Object>(thread: threading.JVMThread, typeStr: string, data: Buffer, protectionDomain: JVMTypes.java_security_ProtectionDomain): ReferenceClassData<T> {
    try {
      var classData = new ReferenceClassData<T>(data, protectionDomain, this);
      this.addClass(typeStr, classData);
      if (this instanceof BootstrapClassLoader) {
        debug(`[BOOTSTRAP] Defining class ${typeStr}`);
      } else {
        debug(`[CUSTOM] Defining class ${typeStr}`);
      }
      return classData;
    } catch (e) {
      if (thread === null) {
        // This will only happen when we're loading java/lang/Thread for
        // the very first time.
        logging.error(`JVM initialization failed: ${e}`);
        logging.error(e.stack);
      } else {
        thread.throwNewException('Ljava/lang/ClassFormatError;', e);
      }
      return null;
    }
  }

  /**
   * Defines a new array class with this loader.
   */
  protected defineArrayClass<T>(typeStr: string): ArrayClassData<T> {
    assert(this.getLoadedClass(util.get_component_type(typeStr)) != null);
    var arrayClass = new ArrayClassData<T>(util.get_component_type(typeStr), this);
    this.addClass(typeStr, arrayClass);
    return arrayClass;
  }

  /**
   * Attempts to retrieve the given loaded class.
   * @param typeStr The name of the class.
   * @return Returns the loaded class, or null if no such class is currently
   *   loaded.
   */
  public getLoadedClass(typeStr: string): ClassData {
    var cls = this.loadedClasses[typeStr];
    if (cls != null) {
      return cls;
    } else {
      if (util.is_primitive_type(typeStr)) {
        // Primitive classes must be fetched from the bootstrap classloader.
        return this.bootstrap.getPrimitiveClass(typeStr);
      } else if (util.is_array_type(typeStr)) {
        // We might be able to load this array class synchronously.
        // Component class must be loaded. And we must define the array class
        // with the component class's loader.
        var component = this.getLoadedClass(util.get_component_type(typeStr));
        if (component != null) {
          var componentCl = component.getLoader();
          if (componentCl === this) {
            // We're responsible for defining the array class.
            return this.defineArrayClass(typeStr);
          } else {
            // Delegate to the other loader, then add the class to our loaded
            // roster.
            cls = componentCl.getLoadedClass(typeStr);
            this.addClass(typeStr, cls);
            return cls;
          }
        }
      }
      return null;
    }
  }

  /**
   * Attempts to retrieve the given resolved class.
   * @param typeStr The name of the class.
   * @return Returns the class if it is both loaded and resolved. Returns null
   *   if this is not the case.
   */
  public getResolvedClass(typeStr: string): ClassData {
    var cls = this.getLoadedClass(typeStr);
    if (cls !== null) {
      if (cls.isResolved() || cls.tryToResolve()) {
        return cls;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  /**
   * Attempts to retrieve the given initialized class.
   * @param typeStr The name of the class.
   * @return Returns the class if it is initialized. Returns null if this is
   *   not the case.
   */
  public getInitializedClass(thread: threading.JVMThread, typeStr: string): ClassData {
    var cls = this.getLoadedClass(typeStr);
    if (cls !== null) {
      if (cls.isInitialized(thread) || cls.tryToInitialize()) {
        return cls;
      } else {
        return null;
      }
    } else {
      return cls;
    }
  }

  /**
   * Asynchronously loads the given class.
   */
  public loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    // See if we can grab this synchronously first.
    var cdata = this.getLoadedClass(typeStr);
    if (cdata) {
      setImmediate(() => {
        cb(cdata);
      });
    } else {
      // Check the loadClass lock for this class.
      if (this.loadClassLocks.tryLock(typeStr, thread, cb)) {
        // Async it is!
        if (util.is_reference_type(typeStr)) {
          this._loadClass(thread, typeStr, (cdata) => {
            this.loadClassLocks.unlock(typeStr, cdata);
          }, explicit);
        } else {
          // Array
          this.loadClass(thread, util.get_component_type(typeStr), (cdata) => {
            if (cdata != null) {
              // Synchronously will work now.
              this.loadClassLocks.unlock(typeStr, this.getLoadedClass(typeStr));
            }
          }, explicit);
        }
      }
    }
  }

  /**
   * Asynchronously loads the given class. Works differently for bootstrap and
   * custom class loaders.
   *
   * Should never be invoked directly! Use loadClass.
   */
  protected abstract _loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData) => void, explicit?: boolean): void;

  /**
   * Convenience function: Resolve many classes. Calls cb with null should
   * an error occur.
   */
  public resolveClasses(thread: threading.JVMThread, typeStrs: string[], cb: (classes: { [typeStr: string]: ClassData }) => void) {
    var classes: { [typeStr: string]: ClassData } = {};
    util.asyncForEach<string>(typeStrs, (typeStr: string, next_item: (err?: any) => void) => {
      this.resolveClass(thread, typeStr, (cdata) => {
        if (cdata === null) {
          next_item(`Error resolving class: ${typeStr}`);
        } else {
          classes[typeStr] = cdata;
          next_item();
        }
      });
    }, (err?: any): void => {
      if (err) {
        cb(null);
      } else {
        cb(classes);
      }
    });
  }

  /**
   * Asynchronously *resolves* the given class by loading the class and
   * resolving its super class, interfaces, and/or component classes.
   */
  public resolveClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    this.loadClass(thread, typeStr, (cdata: ClassData) => {
      if (cdata === null || cdata.isResolved()) {
        // Nothing to do! Either cdata is null, an exception triggered, and we
        // failed, or cdata is already resolved.
        setImmediate(() => { cb(cdata); });
      } else {
        cdata.resolve(thread, cb, explicit);
      }
    }, explicit);
  }

  /**
   * Asynchronously *initializes* the given class and its super classes.
   */
  public initializeClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    // Get the resolved class.
    this.resolveClass(thread, typeStr, (cdata: ClassData) => {
      if (cdata === null || cdata.isInitialized(thread)) {
        // Nothing to do! Either resolution failed and an exception has already
        // been thrown, cdata is already initialized, or the current thread is
        // initializing the class.
        setImmediate(() => {
          cb(cdata);
        });
      } else {
        assert(util.is_reference_type(typeStr));
        (<ReferenceClassData<JVMTypes.java_lang_Object>> cdata).initialize(thread, cb, explicit);
      }
    }, explicit);
  }

  /**
   * Throws the appropriate exception/error for a class not being found.
   * If loading was implicitly triggered by the JVM, we call NoClassDefFoundError.
   * If the program explicitly called loadClass, then we throw the ClassNotFoundException.
   */
  protected throwClassNotFoundException(thread: threading.JVMThread, typeStr: string, explicit: boolean): void {
    thread.throwNewException(explicit ? 'Ljava/lang/ClassNotFoundException;' : 'Ljava/lang/NoClassDefFoundError;', `Cannot load class: ${util.ext_classname(typeStr)}`);
  }

  /**
   * Returns the JVM object corresponding to this ClassLoader.
   */
  public abstract getLoaderObject(): JVMTypes.java_lang_ClassLoader;
}

/**
 * The JVM's bootstrap class loader. Loads classes directly from files on the
 * file system.
 */
export class BootstrapClassLoader extends ClassLoader {
  /**
   * The classpath. The first path in the array is the first searched.
   * Meaning: The *end* of this array is the bootstrap class loader, and the
   *   *beginning* of the array is the classpath item added last.
   */
  private classpath: IClasspathItem[];
  /**
   * Keeps track of all loaded packages, and the classpath item(s) from
   * whence their packages came.
   *
   * Note: Package separators are specified with slashes ('/'), not periods ('.').
   */
  private loadedPackages: {[pkgString: string]: IClasspathItem[]};

  /**
   * Constructs the bootstrap classloader with the given classpath.
   * @param classPath The classpath, where the *first* item is the *last*
   *   classpath searched. Meaning, the classPath[0] should be the bootstrap
   *   class path.
   * @param extractionPath The path where jar files should be extracted.
   * @param cb Called once all of the classpath items have been checked.
   *   Passes an error if one occurs.
   */
  constructor(javaHome: string, classpath: string[], cb: (e?: any) => void) {
    super(this);
    this.classpath = null;
    this.loadedPackages = {};

    ClasspathFactory(javaHome, classpath, (items) => {
      this.classpath = items.reverse();
      cb();
    });
  }

  /**
   * Registers that a given class has successfully been loaded from the specified
   * classpath item.
   */
  private _registerLoadedClass(clsType: string, cpItem: IClasspathItem): void {
    let pkgName = clsType.slice(0, clsType.lastIndexOf('/')),
      itemLoader = this.loadedPackages[pkgName];
    if (!itemLoader) {
      this.loadedPackages[pkgName] = [cpItem];
    } else if (itemLoader[0] !== cpItem && itemLoader.indexOf(cpItem) === -1) {
      // Common case optimization: Simply check the first array element.
      itemLoader.push(cpItem);
    }
  }

  /**
   * Returns a listing of tuples containing:
   * * The package name (e.g. java/lang)
   * * Classpath locations where classes in the package were loaded.
   */
  public getPackages(): [string, string[]][] {
    return Object.keys(this.loadedPackages).map((pkgName: string): [string, string[]] => {
      return [pkgName, this.loadedPackages[pkgName].map((item) => item.getPath())];
    });
  }

  /**
   * Retrieves or defines the specified primitive class.
   */
  public getPrimitiveClass(typeStr: string): PrimitiveClassData {
    var cdata = <PrimitiveClassData> this.getClass(typeStr);
    if (cdata == null) {
      cdata = new PrimitiveClassData(typeStr, this);
      this.addClass(typeStr, cdata);
    }
    return cdata;
  }

  /**
   * Asynchronously load the given class from the classpath.
   *
   * SHOULD ONLY BE INVOKED INTERNALLY BY THE CLASSLOADER.
   */
  protected _loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    debug(`[BOOTSTRAP] Loading class ${typeStr}`);
    // This method is only valid for reference types!
    assert(util.is_reference_type(typeStr));
    // Search the class path for the class.
    let clsFilePath = util.descriptor2typestr(typeStr),
      cPathLen = this.classpath.length,
      toSearch: IClasspathItem[] = [],
      clsData: Buffer;

    searchLoop:
    for (let i = 0; i < cPathLen; i++) {
      let item = this.classpath[i];
      switch (item.hasClass(clsFilePath)) {
        case TriState.INDETERMINATE:
          toSearch.push(item);
          break;
        case TriState.TRUE:
          // Break out of the loop; TRUE paths are guaranteed to have the class.
          toSearch.push(item);
          break searchLoop;
      }
    }

    util.asyncFind<IClasspathItem>(toSearch, (pItem: IClasspathItem, callback: (success: boolean) => void): void => {
      pItem.loadClass(clsFilePath, (err: Error, data?: Buffer) => {
        if (err) {
          callback(false);
        } else {
          clsData = data;
          callback(true);
        }
      });
    }, (pItem?: IClasspathItem) => {
      if (pItem) {
        let cls = this.defineClass(thread, typeStr, clsData, null);
        if (cls !== null) {
          this._registerLoadedClass(clsFilePath, pItem);
        }
        cb(cls);
      } else {
        // No such class.
        debug(`Could not find class ${typeStr}`);
        this.throwClassNotFoundException(thread, typeStr, explicit);
        cb(null);
      }
    });
  }

  /**
   * Returns a listing of reference classes loaded in the bootstrap loader.
   */
  public getLoadedClassFiles(): string[] {
    var loadedClasses = this.getLoadedClassNames();
    return loadedClasses.filter((clsName: string) => util.is_reference_type(clsName));
  }

  /**
   * Returns the JVM object corresponding to this ClassLoader.
   * @todo Represent the bootstrap by something other than 'null'.
   * @todo These should be one-in-the-same.
   */
  public getLoaderObject(): JVMTypes.java_lang_ClassLoader {
    return null;
  }

  /**
   * Returns the current classpath.
   */
  public getClassPath(): string[] {
    let cpLen = this.classpath.length,
      cpStrings: string[] = new Array<string>(cpLen);
    for (let i = 0; i < cpLen; i++) {
      // Reverse it so it is the expected order (last item is first search target)
      cpStrings[i] = this.classpath[cpLen - i - 1].getPath();
    }
    return cpStrings;
  }

  /**
   * Returns the classpath item objects in the classpath.
   */
  public getClassPathItems(): IClasspathItem[] {
    return this.classpath.slice(0);
  }
}

/**
 * A Custom ClassLoader. Loads classes by calling loadClass on the user-defined
 * loader.
 */
export class CustomClassLoader extends ClassLoader {
  constructor(bootstrap: BootstrapClassLoader,
    private loaderObj: JVMTypes.java_lang_ClassLoader) {
    super(bootstrap);
  }

  /**
   * Asynchronously load the given class from the classpath. Calls the
   * classloader's loadClass method.
   *
   * SHOULD ONLY BE INVOKED BY THE CLASS LOADER.
   *
   * @param thread The thread that triggered the loading.
   * @param typeStr The type string of the class.
   * @param cb The callback that will be called with the loaded class. It will
   *   be passed a null if there is an error -- which also indicates that it
   *   threw an exception on the JVM thread.
   * @param explicit 'True' if loadClass was explicitly invoked by the program,
   *   false otherwise. This changes the exception/error that we throw.
   */
  protected _loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    debug(`[CUSTOM] Loading class ${typeStr}`);
    // This method is only valid for reference types!
    assert(util.is_reference_type(typeStr));
    // Invoke the custom class loader.
    this.loaderObj['loadClass(Ljava/lang/String;)Ljava/lang/Class;'](thread, [util.initString(this.bootstrap, util.ext_classname(typeStr))], (e?: JVMTypes.java_lang_Throwable, jco?: JVMTypes.java_lang_Class) => {
      if (e) {
        // Exception! There was an issue defining the class.
        this.throwClassNotFoundException(thread, typeStr, explicit);
        cb(null);
      } else {
        // Add the class returned by loadClass, in case the classloader
        // proxied loading to another classloader.
        var cls = jco.$cls;
        this.addClass(typeStr, cls);
        cb(cls);
      }
    });
  }

  /**
   * Returns the JVM object corresponding to this ClassLoader.
   * @todo These should be one-in-the-same.
   */
  public getLoaderObject(): JVMTypes.java_lang_ClassLoader {
    return this.loaderObj;
  }
}
