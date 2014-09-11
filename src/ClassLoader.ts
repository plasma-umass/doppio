///<reference path='../vendor/DefinitelyTyped/node/node.d.ts' />
import ClassData = require('./ClassData');
import threading = require('./threading');
import enums = require('./enums');
import util = require('./util');
import java_object = require('./java_object');
import methods = require('./methods');
import logging = require('./logging');
import assert = require('./assert');
import JAR = require('./jar');
import path = require('path');
import fs = require('fs');
var debug = logging.debug;
declare var BrowserFS;

/**
 * Used to lock classes for loading/initialization.
 */
class ClassLocks {
  /**
   * typrStr => array of callbacks to trigger when operation completes.
   */
  private locks: { [typeStr: string]: { thread: threading.JVMThread; cb: (cdata: ClassData.ClassData) => void }[] } = {};

  constructor() {}

  /**
   * Checks if the lock for the given class is already taken. If not, it takes
   * the lock. If it is taken, we enqueue the callback.
   * NOTE: For convenience, will handle triggering the owner's callback as well.
   */
  public tryLock(typeStr: string, thread: threading.JVMThread, cb: (cdata: ClassData.ClassData) => void): boolean {
    if (typeof this.locks[typeStr] === 'undefined') {
      this.locks[typeStr] = [{cb: cb, thread: thread}];
      return true;
    } else {
      this.locks[typeStr].push({cb: cb, thread: thread});
      return false;
    }
  }

  /**
   * Releases the lock on the given string.
   */
  public unlock(typeStr: string, cdata: ClassData.ClassData): void {
    var cbs = this.locks[typeStr], i: number;
    // Trigger each of the callbacks.
    for (i = 0; i < cbs.length; i++) {
      cbs[i].cb(cdata);
    }
    delete this.locks[typeStr];
  }

  /**
   * Returns the owning thread of a given lock. Returns null if the specified
   * type string is not locked.
   */
  public getOwner(typeStr: string): threading.JVMThread {
    if (this.locks[typeStr]) {
      return this.locks[typeStr][0].thread;
    }
    return null;
  }
}

/**
 * Base classloader class. Contains common class resolution and instantiation
 * logic.
 */
export class ClassLoader {
  /**
   * Stores loaded *reference* and *array* classes.
   */
  private loadedClasses: { [typeStr: string]: ClassData.ClassData } = {};
  /**
   * Stores callbacks that are waiting for another thread to finish loading
   * the specified class.
   */
  private loadClassLocks: ClassLocks = new ClassLocks();
  /**
   * Stores callbacks that are waiting for another thread to finish initializing
   * the specified class.
   */
  private initializeClassLocks: ClassLocks = new ClassLocks();

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
  public addClass(typeStr: string, classData: ClassData.ClassData): void {
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
  public getClass(typeStr: string): ClassData.ClassData {
    return this.loadedClasses[typeStr];
  }

  /**
   * Defines a new class with the class loader from an array of bytes.
   * @param thread The thread that is currently in control when this class is
   *   being defined. An exception may be thrown if there is an issue parsing
   *   the class file.
   * @param typeStr The type string of the class (e.g. "Ljava/lang/Object;")
   * @param data The data associated with the class as a binary blob.
   * @return The defined class, or null if there was an issue.
   */
  public defineClass(thread: threading.JVMThread, typeStr: string, data: NodeBuffer): ClassData.ReferenceClassData {
    try {
      var classData = new ClassData.ReferenceClassData(data, this);
      this.addClass(typeStr, classData);
      if (this instanceof BootstrapClassLoader) {
        debug("[BOOTSTRAP] Defining class " + typeStr);
      } else {
        debug("[CUSTOM] Defining class " + typeStr);
      }
      return classData;
    } catch (e) {
      thread.throwNewException('Ljava/lang/ClassFormatError;', e);
      return null;
    }
  }

  /**
   * Defines a new array class with this loader.
   */
  public defineArrayClass(typeStr: string): ClassData.ArrayClassData {
    assert(this.getLoadedClass(util.get_component_type(typeStr)) != null);
    var arrayClass = new ClassData.ArrayClassData(util.get_component_type(typeStr), this);
    this.addClass(typeStr, arrayClass);
    return arrayClass;
  }

  /**
   * Attempts to retrieve the given loaded class.
   * @param typeStr The name of the class.
   * @return Returns the loaded class, or null if no such class is currently
   *   loaded.
   */
  public getLoadedClass(typeStr: string): ClassData.ClassData {
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
          var componentCl = component.get_class_loader();
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
  public getResolvedClass(typeStr: string): ClassData.ClassData {
    var cls = this.getLoadedClass(typeStr);
    if (cls !== null) {
      var state = cls.get_state();
      switch (state) {
        case enums.ClassState.RESOLVED:
        case enums.ClassState.INITIALIZED:
          // An initialized class is already resolved.
          return cls;
        case enums.ClassState.LOADED:
          // See if we can promote this to resolved.
          if (cls.tryToResolve()) {
            return cls;
          } else {
            return null;
          }
        default:
          // Class is not resolved.
          return null;
      }
    } else {
      return cls;
    }
  }

  /**
   * Attempts to retrieve the given initialized class.
   * @param typeStr The name of the class.
   * @return Returns the class if it is initialized. Returns null if this is
   *   not the case.
   */
  public getInitializedClass(thread: threading.JVMThread, typeStr: string): ClassData.ClassData {
    var cls = this.getLoadedClass(typeStr);
    if (cls !== null) {
      if (cls.get_state() === enums.ClassState.INITIALIZED) {
        return cls;
      } else if (cls.tryToInitialize()) {
        return cls;
      } else {
        // Check if the thread owns the initialized lock. If so, that thread
        // can treat the class as already initialized.
        if (this.initializeClassLocks.getOwner(typeStr) === thread) {
          return cls;
        }
        return null;
      }
    } else {
      return cls;
    }
  }

  /**
   * Asynchronously loads the given class.
   */
  public loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData.ClassData) => void, explicit: boolean = true): void {
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
  public _loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData.ClassData) => void, explicit?: boolean): void {
    throw new Error("Abstract method!");
  }

  /**
   * Convenience function: Resolve many classes. Calls cb with null should
   * an error occur.
   */
  public resolveClasses(thread: threading.JVMThread, typeStrs: string[], cb: (classes: { [typeStr: string]: ClassData.ClassData }) => void) {
    var classes: { [typeStr: string]: ClassData.ClassData } = {};
    util.async_foreach<string>(typeStrs, (typeStr: string, next_item: (err?: any) => void) => {
      this.resolveClass(thread, typeStr, (cdata) => {
        if (cdata === null) {
          next_item("Error resolving class: " + typeStr);
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
  public resolveClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData.ClassData) => void, explicit: boolean = true): void {
    this.loadClass(thread, typeStr, (cdata: ClassData.ClassData) => {
      if (cdata === null || cdata.is_resolved()) {
        // Nothing to do! Either cdata is null, an exception triggered, and we
        // failed, or cdata is already resolved.
        setImmediate(() => { cb(cdata); });
      } else {
        assert(!util.is_primitive_type(typeStr));
        var toResolve: string[] = [cdata.get_super_class_type()];
        if (util.is_array_type(typeStr)) {
          // Array: Super class + component type.
          toResolve.push((<ClassData.ArrayClassData>cdata).get_component_type());
        } else {
          // Reference: interface types + super class.
          toResolve = cdata.get_interface_types().concat(toResolve);
        }
        // Gotta resolve 'em all!
        util.async_foreach<string>(toResolve, (aTypeStr: string, next: (err?: any) => void): void => {
          // SPECIAL CASE: super class was null (java/lang/Object).
          if (aTypeStr == null) {
            return next();
          }
          this.resolveClass(thread, aTypeStr, (aCdata: ClassData.ClassData) => {
            if (aCdata === null) {
              next('Failed to resolve ' + aTypeStr);
            } else {
              next();
            }
          }, explicit);
        }, (err?: any) => {
          if (err) {
            // An exception has already been thrown when one of the classes
            // failed to load.
            cb(null);
          } else {
            // Success! This synchronous resolution should succeed now.
            cdata.tryToResolve();
            assert(cdata.is_resolved());
            cb(cdata);
          }
        });
      }
    }, explicit);
  }

  /**
   * Asynchronously *initializes* the given class and its super classes.
   */
  public initializeClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData.ClassData) => void, explicit: boolean = true): void {
    // Get the resolved class.
    this.resolveClass(thread, typeStr, (cdata: ClassData.ClassData) => {
      if (cdata === null || cdata.is_initialized() || this.initializeClassLocks.getOwner(typeStr) === thread) {
        // Nothing to do! Either resolution failed and an exception has already
        // been thrown, cdata is already initialized, or the current thread is
        // initializing the class.
        setImmediate(() => {
          cb(cdata);
        });
      } else if (this.initializeClassLocks.tryLock(typeStr, thread, cb)) {
        // Initialize the super class, and then this class.
        // Must be a reference type.
        assert(util.is_reference_type(typeStr));
        var superClassType = cdata.get_super_class_type();
        if (superClassType != null) {
          this.initializeClass(thread, superClassType, (superCdata: ClassData.ClassData) => {
            if (superCdata == null) {
              // Nothing to do. Initializing the super class failed.
              this.initializeClassLocks.unlock(typeStr, null);
            } else {
              // Initialize myself.
              this._initializeClass(thread, typeStr, <ClassData.ReferenceClassData> cdata, (cdata) => {
                this.initializeClassLocks.unlock(typeStr, cdata);
              });
            }
          });
        } else {
          // java/lang/Object's parent is NULL.
          // Continue initializing this class.
          this._initializeClass(thread, typeStr, <ClassData.ReferenceClassData> cdata, (cdata) => {
            this.initializeClassLocks.unlock(typeStr, cdata);
          });
        }
      }
    }, explicit);
  }

  /**
   * Helper function. Initializes the specified class alone. Assumes super
   * class is already initialized.
   */
  private _initializeClass(thread: threading.JVMThread, typeStr: string, cdata: ClassData.ReferenceClassData, cb: (cdata: ClassData.ClassData) => void): void {
    var clinit = cdata.get_method('<clinit>()V');
    // We'll reset it if it fails.
    if (clinit != null) {
      debug("T" + thread.ref + " Running static initialization for class " + typeStr + "...");
      thread.runMethod(clinit, [], (e?: java_object.JavaObject, rv?: any) => {
        if (e) {
          debug("Initialization of class " + typeStr + " failed.");
          cdata.set_state(enums.ClassState.RESOLVED);
          /**
           * "The class or interface initialization method must have completed
           *  abruptly by throwing some exception E. If the class of E is not
           *  Error or one of its subclasses, then create a new instance of the
           *  class ExceptionInInitializerError with E as the argument, and use
           *  this object in place of E."
           * @url http://docs.oracle.com/javase/specs/jvms/se7/html/jvms-5.html#jvms-5.5
           */
          if (e.cls.is_castable(this.bootstrap.getResolvedClass('Ljava/lang/Error;'))) {
            // 'e' is 'Error or one of its subclasses'.
            thread.throwException(e);
            cb(null);
          } else {
            // Wrap the error.
            this.initializeClass(thread, 'Ljava/lang/ExceptionInInitializerError;', (cdata: ClassData.ReferenceClassData) => {
              if (cdata == null) {
                // Exceptional failure right here: *We failed to construct ExceptionInInitializerError*!
                // initializeClass will throw an exception on our behalf;
                // nothing to do.
                cb(null);
              } else {
                // Construct the object!
                var e2 = new java_object.JavaObject(cdata),
                  cnstrctr = cdata.get_method('<init>(Ljava/lang/Throwable;)V');
                // Construct the ExceptionInInitializerError!
                thread.runMethod(cnstrctr, [e2, e], (e?: java_object.JavaObject, rv?: any) => {
                  // Throw the newly-constructed error!
                  thread.throwException(e2);
                  cb(null);
                });
              }
            });
          }
        } else {
          cdata.set_state(enums.ClassState.INITIALIZED);
          debug("Initialization of class " + typeStr + " succeeded.");
          // Normal case! Initialization succeeded.
          cb(cdata);
        }
      });
    } else {
      // Class doesn't have a static initializer.
      cdata.set_state(enums.ClassState.INITIALIZED);
      cb(cdata);
    }
  }

  /**
   * Throws the appropriate exception/error for a class not being found.
   * If loading was implicitly triggered by the JVM, we call NoClassDefFoundError.
   * If the program explicitly called loadClass, then we throw the ClassNotFoundException.
   */
  public throwClassNotFoundException(thread: threading.JVMThread, typeStr: string, explicit: boolean): void {
    thread.throwNewException(explicit ? 'Ljava/lang/ClassNotFoundException;' : 'Ljava/lang/NoClassDefFoundError;', 'Cannot load class: ' + util.ext_classname(typeStr));
  }

  /**
   * Returns the JVM object corresponding to this ClassLoader.
   */
  public getLoaderObject(): JavaClassLoaderObject {
    throw new Error('Abstract method');
  }
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
  private classPath: string[];
  /**
   * The path where jar files should be extracted.
   */
  private extractionPath: string;
  /**
   * All of the currently loaded JAR files.
   */
  private jarFiles: { [jarPath: string]: JAR };
  /**
   * Maps the file system path to .jar files to the file system path where it
   * is extracted.
   */
  private jarFilePaths: { [jarPath: string]: string };

  /**
   * Constructs the bootstrap classloader with the given classpath.
   * @param classPath The classpath, where the *first* item is the *last*
   *   classpath searched. Meaning, the classPath[0] should be the bootstrap
   *   class path.
   * @param extractionPath The path where jar files should be extracted.
   * @param cb Called once all of the classpath items have been checked.
   *   Passes an error if one occurs.
   */
  constructor(classPath: string[], extractionPath: string, cb: (e?: any) => void) {
    super(this);
    this.classPath = [];
    this.extractionPath = path.resolve(extractionPath);
    // XXX: Must be initialized here rather than at the property definition
    // because we reference 'this' in the call to 'super'.
    this.unzipJar = util.are_in_browser() ? this.unzipJarBrowser : this.unzipJarNode;
    this.jarFiles = {};
    this.jarFilePaths = {};

    // Checks all of the classpaths. Add only those that exist.
    var checkClasspaths = (cb: (e?: any) => void) => {
      util.async_foreach<string>(classPath, (p: string, next_item: (err?: any) => void) => {
        this.addClassPathItem(p, (success: boolean) => {
          // Ignore the success condition. It's not an error to pass an invalid
          // classpath to the JVM.
          next_item();
        });
      }, cb);
    };

    // Prepare the extraction path.
    fs.exists(this.extractionPath, (exists: boolean) => {
      if (!exists) {
        fs.mkdir(this.extractionPath, (err?) => {
          if (err) {
            cb(new Error("Unable to create JAR file directory " + this.extractionPath + ": " + err));
          } else {
            checkClasspaths(cb);
          }
        });
      } else {
        checkClasspaths(cb);
      }
    });
  }

  /**
   * Returns a listing of loaded packages.
   */
  public getPackageNames(): string[] {
    var classNames = this.getLoadedClassNames(), i: number, className: string,
      finalPackages: {[pkgNames: string]: boolean } = { };
    for (i = 0; i < classNames.length; i++) {
      className = classNames[i];
      if (util.is_reference_type(className)) {
        finalPackages[className.substring(1, (className.lastIndexOf('/')) + 1)] = true;
      }
    }
    return Object.keys(finalPackages);
  }

  /**
   * Adds the given classpath to the class path. If added already, we move it
   * to the front of the classpath.
   *
   * Verifies that the path exists prior to adding.
   *
   * @param p The path to add.
   */
  public addClassPathItem(p: string, cb: (success: boolean) => void) {
    var classPath = this.classPath;
    // Standardize.
    p = path.resolve(p);

    // Check if the item exists.
    fs.stat(p, (err, stats: fs.Stats) => {
      if (err) {
        cb(false);
      } else {
        if (stats.isFile()) {
          // JAR file. Extract first.
          this.unzipJar(p, (err, unzipPath?: string) => {
            if (err) {
              cb(false);
            } else {
              this.jarFilePaths[p] = unzipPath;
              addPath(unzipPath, cb);
            }
          });
        } else {
          // Directory.
          addPath(p, cb);
        }
      }
    });

    var addPath = (p: string, cb: (success: boolean) => void) => {
      var existingIdx = classPath.indexOf(p);
      if (existingIdx !== -1) {
        // Remove it before adding it in again.
        classPath.splice(existingIdx, 1);
      }
      // Add to the front of the classpath.
      classPath.unshift(p);
      // Check for a manifest. If it exists, add it, and then add its classpath
      // items.
      var manifestPath = path.resolve(p, 'META-INF', 'MANIFEST.MF');
      fs.exists(manifestPath, (exists) => {
        if (exists) {
          var jar = new JAR(p, (err) => {
            // Only add the jar file if we successfully parsed it.
            if (!err) {
              this.jarFiles[p] = jar;
            }
            cb(true);
          });
        } else {
          cb(true);
        }
      });
    };
  }

  /**
   * Retrieve the JAR object for the given jar file loaded in the class loader.
   */
  public getJar(jarPath: string): JAR {
    // Standardize path.
    jarPath = path.resolve(jarPath);
    if (this.jarFilePaths.hasOwnProperty(jarPath)) {
      return this.jarFiles[this.jarFilePaths[jarPath]];
    }
    return null;
  }

  /**
   * Retrieves or defines the specified primitive class.
   */
  public getPrimitiveClass(typeStr: string): ClassData.PrimitiveClassData {
    var cdata = <ClassData.PrimitiveClassData> this.getClass(typeStr);
    if (cdata == null) {
      cdata = new ClassData.PrimitiveClassData(typeStr, this);
      this.addClass(typeStr, cdata);
    }
    return cdata;
  }

  /**
   * Asynchronously load the given class from the classpath.
   *
   * SHOULD ONLY BE INVOKED INTERNALLY BY THE CLASSLOADER.
   */
  public _loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData.ClassData) => void, explicit: boolean = true): void {
    debug('[BOOTSTRAP] Loading class ' + typeStr);
    // This method is only valid for reference types!
    assert(util.is_reference_type(typeStr));
    // Search the class path for the class.
    var clsFilePath = util.descriptor2typestr(typeStr);
    util.async_find<string>(this.classPath, (p: string, callback: (success: boolean) => void): void => {
      fs.exists(path.join(p, clsFilePath + ".class"), callback);
    }, (foundPath?: string): void => {
      if (foundPath) {
        // Read the class file, define the class!
        var clsPath = path.join(foundPath, clsFilePath + ".class");
        fs.readFile(clsPath, (err, data: NodeBuffer) => {
          if (err) {
            debug("Failed to load class " + typeStr + ": " + err);
            this.throwClassNotFoundException(thread, typeStr, explicit);
            cb(null);
          } else {
            // We can read the class, all is well!
            cb(this.defineClass(thread, typeStr, data));
          }
        });
      } else {
        // No such class.
        debug("Could not find class " + typeStr);
        this.throwClassNotFoundException(thread, typeStr, explicit);
        cb(null);
      }
    });
  }

  /**
   * Uses BrowserFS to mount the jar file in the file system, allowing us to
   * lazily extract only the files we care about.
   */
  private unzipJarBrowser(jar_path: string, cb: (err: any, unzip_path?: string) => void): void {
    var dest_folder: string = path.resolve(this.extractionPath, path.basename(jar_path, '.jar')),
      mfs = (<any>fs).getRootFS();
    // In case we have mounted this before, unmount.
    try {
      mfs.umount(dest_folder);
    } catch (e) {
      // We didn't mount it before. Ignore.
    }

    // Grab the file.
    fs.readFile(jar_path, function (err: any, data: NodeBuffer) {
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
      } catch (e) {
        cb(e);
      }
    });
  }

  /**
   * Helper function for unzip_jar_node.
   */
  private _extractAllTo(files: any[], dest_dir: string): void {
    for (var filepath in files) {
      var file = files[filepath];
      filepath = path.join(dest_dir, filepath);
      if (file.options.dir || filepath.slice(-1) === '/') {
        if (!fs.existsSync(filepath)) {
          fs.mkdirSync(filepath);
        }
      } else {
        fs.writeFileSync(filepath, file._data, 'binary');
      }
    }
  }

  /**
   * Uses JSZip to eagerly extract the entire JAR file into a temporary folder.
   */
  private unzipJarNode(jar_path: string, cb: (err: any, unzip_path?: string) => void): void {
    var JSZip = require('node-zip'),
      unzipper = new JSZip(fs.readFileSync(jar_path, 'binary'), {
        base64: false,
        checkCRC32: true
      }),
      dest_folder = path.resolve(this.extractionPath, path.basename(jar_path, '.jar'));

    try {
      if (!fs.existsSync(dest_folder)) {
        fs.mkdirSync(dest_folder);
      }
      this._extractAllTo(unzipper.files, dest_folder);
      // Reset stack depth.
      setImmediate(function () { return cb(null, dest_folder); });
    } catch (e) {
      setImmediate(function () { return cb(e); });
    }
  }

  /**
   * Given a path to a JAR file, returns a path in the file system where the
   * extracted contents can be read.
   */
  private unzipJar: (jar_path: string, cb: (err: any, unzipPath?: string) => void) => void;

  /**
   * Returns a listing of absolute paths to the class files loaded in the
   * bootstrap class loader.
   */
  public getLoadedClassFiles(cb: (files: string[]) => void): void {
    var loadedClasses = this.getLoadedClassNames(),
      loadedClassFiles = [];
    util.async_foreach<string>(loadedClasses, (className: string, next_item: (err?: any) => void) => {
      if (util.is_reference_type(className)) {
        // Figure out from whence it came.
        util.async_foreach<string>(this.classPath, (cPath: string, next_cpath: (err?: any) => void) => {
          var pathToClass = path.resolve(cPath, className);
          fs.exists(pathToClass, (exists: boolean) => {
            if (exists) {
              loadedClassFiles.push(pathToClass);
              // Short circuit.
              next_item();
            } else {
              next_cpath();
            }
          });
        }, next_item);
      } else {
        next_item();
      }
    }, (err?: any) => {
      cb(loadedClassFiles);
    });
  }

  /**
   * Returns the JVM object corresponding to this ClassLoader.
   * @todo Represent the bootstrap by something other than 'null'.
   * @todo These should be one-in-the-same.
   */
  public getLoaderObject(): JavaClassLoaderObject {
    return null;
  }

  /**
   * Returns the current classpath.
   */
  public getClassPath(): string[] {
    // Reverse it so it is the expected order (last item is first search target)
    return this.classPath.slice(0).reverse();
  }
}

/**
 * A Custom ClassLoader. Loads classes by calling loadClass on the user-defined
 * loader.
 */
export class CustomClassLoader extends ClassLoader {
  constructor(bootstrap: BootstrapClassLoader,
    private loaderObj: JavaClassLoaderObject) {
    super(bootstrap);
  }

  private loadClassMethod: methods.Method;
  private getLoadClassMethod(thread: threading.JVMThread): methods.Method {
    if (this.loadClassMethod) {
      return this.loadClassMethod;
    } else {
      // This will trigger an exception on the JVM thread if the method does
      // not exist.
      return this.loadClassMethod = this.loaderObj.cls.method_lookup(thread, 'loadClass(Ljava/lang/String;)Ljava/lang/Class;');
    }
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
  public _loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData.ClassData) => void, explicit: boolean = true): void {
    debug('[CUSTOM] Loading class ' + typeStr);
    // This method is only valid for reference types!
    assert(util.is_reference_type(typeStr));
    // Invoke the custom class loader.
    var loadClassMethod = this.getLoadClassMethod(thread);
    if (loadClassMethod) {
      thread.runMethod(loadClassMethod, [this.loaderObj, java_object.initString(this.bootstrap, util.ext_classname(typeStr))],
        (e?: java_object.JavaObject, jco?: java_object.JavaClassObject): void => {
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
    } else {
      // loadClassMethod doesn't exist, and we already threw an exception on
      // the thread... nothing to do!
      setImmediate(() => {
        cb(null);
      });
    }
  }

  /**
   * Returns the JVM object corresponding to this ClassLoader.
   * @todo These should be one-in-the-same.
   */
  public getLoaderObject(): JavaClassLoaderObject {
    return this.loaderObj;
  }
}

// Each JavaClassLoaderObject is a unique ClassLoader.
export class JavaClassLoaderObject extends java_object.JavaObject {
  public $loader: ClassLoader;
  constructor(thread: threading.JVMThread, cls: any) {
    super(cls);
    this.$loader = new CustomClassLoader(thread.getBsCl(), this);
  }

  /**
   * @todo Remove or refactor.
   */
  public serialize(visited: any): any {
    if (visited[this.ref]) {
      return "<*" + this.ref + ">";
    }
    visited[this.ref] = true;
    var fields = {};
    for (var k in this.fields) {
      var f = this.fields[k];
      if (!f || (typeof f.serialize !== "function"))
        fields[k] = f;
      else
        fields[k] = f.serialize(visited);
    }
    var loaded = {},
      loadedClasses = this.$loader.getLoadedClassNames();
    loadedClasses.forEach((type: string) => {
      var vcls = this.$loader.getLoadedClass(type);
      //loaded[type + "(" + enums.ClassState[vcls.get_state()] + ")"] = vcls.loader.serialize(visited);
    });
    return {
      type: this.cls.get_type(),
      ref: this.ref,
      fields: fields,
      loaded: loaded
    };
  }
}
