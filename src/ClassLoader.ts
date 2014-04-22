///<reference path='../vendor/DefinitelyTyped/node/node.d.ts' />
import ClassData = require('./ClassData');
import threading = require('./threading');
import enums = require('./enums');
import util = require('./util');
import java_object = require('./java_object');
import methods = require('./methods');
import logging = require('./logging');
import assert = require('./assert');
import path = require('path');
import fs = require('fs');
var debug = logging.debug;

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
   * @param bootstrap The JVM's bootstrap classloader. ClassLoaders use it
   *   to retrieve primitive types.
   */
  constructor(private bootstrap: BootstrapClassLoader) { }

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
        // Array classes can be *loaded* synchronously. Resolving, on the other
        // hand, might need to be done asynchronously.
        return this.defineArrayClass(typeStr);
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
  public getInitializedClass(typeStr: string): ClassData.ClassData {
    var cls = this.getLoadedClass(typeStr);
    if (cls !== null) {
      if (cls.get_state() === enums.ClassState.INITIALIZED) {
        return cls;
      } else if (cls.tryToInitialize()) {
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
  public loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData.ClassData) => void, explicit: boolean = true): void {
    // See if we can grab this synchronously first.
    var cdata = this.getLoadedClass(typeStr);
    if (cdata) {
      setImmediate(() => {
        cb(cdata);
      });
    } else {
      // Async it is!
      // NOTE: Must be a reference type. Array and primitives can be *loaded*
      // synchronously.
      assert(util.is_reference_type(typeStr));
      this._loadClass(thread, typeStr, cb, explicit);
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
          // Reference: Super class + interface types.
          toResolve = toResolve.concat(cdata.get_interface_types());
        }
        // Gotta resolve 'em all!
        util.async_foreach<string>(toResolve, (aTypeStr: string, next: (err?: any) => void): void => {
          // SPECIAL CASE: super class was null (java/lang/Object).
          if (aTypeStr === null) {
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
      if (cdata === null || cdata.is_initialized()) {
        // Nothing to do! Either resolution failed and an exception has already
        // been thrown, or cdata is already initialized.
        setImmediate(() => {
          cb(cdata);
        });
      } else {
        // Initialize the super class, and then this class.
        // Must be a reference type.
        assert(util.is_reference_type(typeStr));
        this.initializeClass(thread, cdata.get_super_class_type(), (superCdata: ClassData.ClassData) => {
          if (superCdata == null) {
            // Nothing to do. Initializing the super class failed.
            cb(null);
          } else {
            // Initialize myself. We can directly use the caller's callback
            // here, since once I'm initialized we're finished.
            this._initializeClass(thread, typeStr, <ClassData.ReferenceClassData> cdata, cb);
          }
        });
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
    cdata.set_state(enums.ClassState.INITIALIZED);
    if (clinit != null) {
      thread.runMethod(clinit, [], (e?: java_object.JavaObject, rv?: any) => {
        if (e) {
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
          // Normal case! Initialization succeeded.
          cb(cdata);
        }
      });
    } else {
      // Class doesn't have a static initializer.
      cb(cdata);
    }
  }

  /**
   * Throws the appropriate exception/error for a class not being found.
   * If loading was implicitly triggered by the JVM, we call NoClassDefFoundError.
   * If the program explicitly called loadClass, then we throw the ClassNotFoundException.
   */
  public throwClassNotFoundException(thread: threading.JVMThread, typeStr: string, explicit: boolean): void {
    thread.throwNewException(explicit ? 'Ljava/lang/ClassNotFoundException;' : 'Ljava/lang/ClassNotFoundException;', 'Could not load class: ' + typeStr);
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
   * Constructs the bootstrap classloader with the given classpath.
   * @param classPath The classpath, where the *first* item is the *last*
   *   classpath searched. Meaning, the classPath[0] should be the bootstrap
   *   class path.
   */
  constructor(classPath: string[]) {
    super(this);
    // For convenience, it's much easier when the first item in the array is
    // searched first. So we reverse the input array.
    this.classPath = classPath.reverse();
  }

  /**
   * Adds the given classpath to the class path. If added already, we move it
   * to the front of the classpath.
   * @param p The path to add.
   */
  public addClassPath(p: string) {
    var classPath = this.classPath;
    // Standardize.
    p = path.resolve(p);

    var existingIdx = classPath.indexOf(p);
    if (existingIdx !== -1) {
      // Remove it before adding it in again.
      classPath.splice(existingIdx, 1);
    }
    // Add to the front of the classpath.
    classPath.unshift(p);
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
   */
  public _loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData.ClassData) => void, explicit: boolean = true): void {
    // This method is only valid for reference types!
    assert(util.is_reference_type(typeStr));
    // Search the class path for the class.
    var clsFilePath = util.descriptor2typestr(typeStr);
    util.async_find<string>(this.classPath, (p: string, callback: (success: boolean) => void): void => {
      fs.exists(path.join(p, clsFilePath), callback);
    }, (foundPath?: string): void => {
      if (foundPath) {
        // Read the class file, define the class!
        var clsPath = path.join(foundPath, clsFilePath);
        fs.readFile(clsPath, (err, data: NodeBuffer) => {
          if (err) {
            this.throwClassNotFoundException(thread, typeStr, explicit);
            cb(null);
          } else {
            // We can read the class, all is well!
            cb(this.defineClass(thread, typeStr, data));
          }
        });
      } else {
        // No such class.
        this.throwClassNotFoundException(thread, typeStr, explicit);
        cb(null);
      }
    });
  }
}

/**
 * A Custom ClassLoader. Loads classes by calling loadClass on the user-defined
 * loader.
 */
export class CustomClassLoader extends ClassLoader {
  constructor(bootstrap: BootstrapClassLoader,
    private loaderObj: java_object.JavaClassLoaderObject) {
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
   * @param thread The thread that triggered the loading.
   * @param typeStr The type string of the class.
   * @param cb The callback that will be called with the loaded class. It will
   *   be passed a null if there is an error -- which also indicates that it
   *   threw an exception on the JVM thread.
   * @param explicit 'True' if loadClass was explicitly invoked by the program,
   *   false otherwise. This changes the exception/error that we throw.
   */
  public _loadClass(thread: threading.JVMThread, typeStr: string, cb: (cdata: ClassData.ClassData) => void, explicit: boolean = true): void {
    // This method is only valid for reference types!
    assert(util.is_reference_type(typeStr));
    // Invoke the custom class loader.
    var loadClassMethod = this.getLoadClassMethod(thread);
    if (loadClassMethod) {
      thread.runMethod(loadClassMethod, [this.loaderObj, java_object.initString(this, util.ext_classname(typeStr))],
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
}
