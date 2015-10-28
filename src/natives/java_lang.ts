import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import attributes = require('../attributes');
import methods = require('../methods');
import threading = require('../threading');
import ClassLoader = require('../ClassLoader');
import enums = require('../enums');
import assert = require('../assert');
import ConstantPool = require('../ConstantPool');
import JVMTypes = require('../../includes/JVMTypes');
declare var registerNatives: (defs: any) => void;

var debug = logging.debug;

function arrayGet(thread: threading.JVMThread, arr: JVMTypes.JVMArray<any>, idx: number): any {
  if (arr == null) {
    thread.throwNewException('Ljava/lang/NullPointerException;', '');
  } else {
    var array = arr.array;
    if (idx < 0 || idx >= array.length) {
      thread.throwNewException('Ljava/lang/ArrayIndexOutOfBoundsException;', 'Tried to access an illegal index in an array.');
    } else {
      return array[idx];
    }
  }
}

function isNotNull(thread: threading.JVMThread, obj: JVMTypes.java_lang_Object): boolean {
  if (obj == null) {
    thread.throwNewException('Ljava/lang/NullPointerException;', '');
    return false;
  } else {
    return true;
  }
}

function verifyArray(thread: threading.JVMThread, obj: JVMTypes.JVMArray<any>): boolean {
  if (!(obj.getClass() instanceof ClassData.ArrayClassData)) {
    thread.throwNewException('Ljava/lang/IllegalArgumentException;', 'Object is not an array.');
    return false;
  } else {
    return true;
  }
}

class java_lang_Class {

  public static 'forName0(Ljava/lang/String;ZLjava/lang/ClassLoader;Ljava/lang/Class;)Ljava/lang/Class;'(thread: threading.JVMThread, jvmStr: JVMTypes.java_lang_String, initialize: number, jclo: JVMTypes.java_lang_ClassLoader, caller: JVMTypes.java_lang_Class): void {
    var classname = util.int_classname(jvmStr.toString());
    if (!util.verify_int_classname(classname)) {
      thread.throwNewException('Ljava/lang/ClassNotFoundException;', classname);
    } else {
      var loader = util.getLoader(thread, jclo);
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      if (initialize) {
        loader.initializeClass(thread, classname, (cls: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>) => {
          if (cls != null) {
            thread.asyncReturn(cls.getClassObject(thread));
          }
        });
      } else {
        loader.resolveClass(thread, classname, (cls: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>) => {
          if (cls != null) {
            thread.asyncReturn(cls.getClassObject(thread));
          }
        });
      }
    }
  }

  public static 'isInstance(Ljava/lang/Object;)Z'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class, obj: JVMTypes.java_lang_Object): boolean {
    if (obj !== null) {
      return obj.getClass().isCastable(javaThis.$cls);
    } else {
      return false;
    }
  }

  public static 'isAssignableFrom(Ljava/lang/Class;)Z'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class, cls: JVMTypes.java_lang_Class): boolean {
    return cls.$cls.isCastable(javaThis.$cls);
  }

  public static 'isInterface()Z'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): boolean {
    if (!(javaThis.$cls instanceof ClassData.ReferenceClassData)) {
      return false;
    }
    return javaThis.$cls.accessFlags.isInterface();
  }

  public static 'isArray()Z'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): boolean {
    return javaThis.$cls instanceof ClassData.ArrayClassData;
  }

  public static 'isPrimitive()Z'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): boolean {
    return javaThis.$cls instanceof ClassData.PrimitiveClassData;
  }

  public static 'getName0()Ljava/lang/String;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.java_lang_String {
    return util.initString(thread.getBsCl(), javaThis.$cls.getExternalName());
  }

  public static 'getSuperclass()Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.java_lang_Class {
    if (javaThis.$cls instanceof ClassData.PrimitiveClassData) {
      return null;
    }
    var cls = javaThis.$cls;
    if (cls.accessFlags.isInterface() || (cls.getSuperClass() == null)) {
      return null;
    }
    return cls.getSuperClass().getClassObject(thread);
  }

  public static 'getInterfaces0()[Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.JVMArray<JVMTypes.java_lang_Class> {
    return util.newArrayFromData<JVMTypes.java_lang_Class>(thread, thread.getBsCl(), '[Ljava/lang/Class;', javaThis.$cls.getInterfaces().map((iface) => iface.getClassObject(thread)));
  }

  public static 'getComponentType()Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.java_lang_Class {
    if (!(javaThis.$cls instanceof ClassData.ArrayClassData)) {
      return null;
    }
    // As this array type is loaded, the component type is guaranteed
    // to be loaded as well. No need for asynchronicity.
    return (<ClassData.ArrayClassData<any>> javaThis.$cls).getComponentClass().getClassObject(thread);
  }

  public static 'getModifiers()I'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): number {
    return javaThis.$cls.accessFlags.getRawByte();
  }

  public static 'getSigners()[Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.JVMArray<JVMTypes.java_lang_Object> {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'setSigners([Ljava/lang/Object;)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class, arg0: JVMTypes.JVMArray<JVMTypes.java_lang_Object>): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getEnclosingMethod0()[Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.JVMArray<JVMTypes.java_lang_Object> {
    var encDesc: JVMTypes.java_lang_String = null,
      enc_name: JVMTypes.java_lang_String = null,
      bsCl = thread.getBsCl();

    if (javaThis.$cls instanceof ClassData.ReferenceClassData) {
      var cls = <ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> javaThis.$cls,
        em: attributes.EnclosingMethod = <attributes.EnclosingMethod> cls.getAttribute('EnclosingMethod');
      if (em == null) {
        return null;
      }

      // array w/ 3 elements:
      // - the immediately enclosing class (java/lang/Class)
      // - the immediately enclosing method or constructor's name (can be null). (String)
      // - the immediately enclosing method or constructor's descriptor (null iff name is). (String)
      var rv = util.newArray<JVMTypes.java_lang_Object>(thread, bsCl, '[Ljava/lang/Object;', 3),
        encClassRef = em.encClass;
      if (em.encMethod != null) {
        rv.array[1] = util.initString(bsCl, em.encMethod.name);
        rv.array[2] = util.initString(bsCl, em.encMethod.descriptor);
      }

      if (encClassRef.isResolved()) {
        rv.array[0] = encClassRef.cls.getClassObject(thread);
        return rv;
      } else {
        thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
        encClassRef.resolve(thread, cls.getLoader(), cls, (status: boolean) => {
          if (status) {
            rv.array[0] = encClassRef.cls.getClassObject(thread);
            thread.asyncReturn(rv);
          }
        });
      }
    }
    return null;
  }

  public static 'getDeclaringClass0()Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.java_lang_Class {
    var declaringName: ConstantPool.ClassReference, entry: attributes.IInnerClassInfo,
      name: string, i: number, len: number;
    if (javaThis.$cls instanceof ClassData.ReferenceClassData) {
      var cls = <ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> javaThis.$cls,
        icls = <attributes.InnerClasses> cls.getAttribute('InnerClasses');
      if (icls == null) {
        return null;
      }
      var myClass = cls.getInternalName(),
        innerClassInfo = icls.classes;
      for (i = 0, len = innerClassInfo.length; i < len; i++) {
        entry = innerClassInfo[i];
        if (entry.outerInfoIndex <= 0) {
          continue;
        }
        name = (<ConstantPool.ClassReference> cls.constantPool.get(entry.innerInfoIndex)).name;
        if (name !== myClass) {
          continue;
        }
        // XXX(jez): this assumes that the first enclosing entry is also
        // the immediate enclosing parent, and I'm not 100% sure this is
        // guaranteed by the spec
        declaringName = (<ConstantPool.ClassReference> cls.constantPool.get(entry.outerInfoIndex));
        if (declaringName.isResolved()) {
          return declaringName.cls.getClassObject(thread);
        } else {
          thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
          declaringName.resolve(thread, cls.getLoader(), cls, (status: boolean) => {
            if (status) {
              thread.asyncReturn(declaringName.cls.getClassObject(thread));
            }
          });
        }
      }
    }
    return null;
  }

  public static 'getProtectionDomain0()Ljava/security/ProtectionDomain;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.java_security_ProtectionDomain {
    return null;
  }

  public static 'getPrimitiveClass(Ljava/lang/String;)Ljava/lang/Class;'(thread: threading.JVMThread, jvmStr: JVMTypes.java_lang_String): JVMTypes.java_lang_Class {
    var type_desc = util.typestr2descriptor(jvmStr.toString()),
      prim_cls = thread.getBsCl().getInitializedClass(thread, type_desc);
    return prim_cls.getClassObject(thread);
  }

  public static 'getGenericSignature0()Ljava/lang/String;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.java_lang_String {
    var cls = javaThis.$cls;
    // TODO: What if it is a primitive type? What do I return?
    if (!util.is_primitive_type(cls.getInternalName())) {
      var sigAttr = <attributes.Signature> (<ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> cls).getAttribute('Signature');
      if (sigAttr != null && sigAttr.sig != null) {
        return util.initString(thread.getBsCl(), sigAttr.sig);
      }
    }
    return null;
  }

  /**
   * Returns RuntimeVisibleAnnotations defined on the class.
   */
  public static 'getRawAnnotations()[B'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.JVMArray<number> {
    var cls = <ClassData.ReferenceClassData<JVMTypes.java_lang_Class>> javaThis.$cls,
      annotationsVisible = <attributes.RuntimeVisibleAnnotations> cls.getAttribute('RuntimeVisibleAnnotations'),
      methods: methods.Method[], i: number, m: methods.Method;

    if (annotationsVisible !== null) {
      // TODO: Use a typed array?
      var bytes = annotationsVisible.rawBytes, data: number[] = new Array(bytes.length);
      for (var i = 0; i < bytes.length; i++) {
        data[i] = bytes.readInt8(i);
      }
      return util.newArrayFromData<number>(thread, thread.getBsCl(), '[B', data);
    }
    return null;
  }

  public static 'getConstantPool()Lsun/reflect/ConstantPool;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.sun_reflect_ConstantPool {
    var cls = <ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> javaThis.$cls,
      cpObj = util.newObject<JVMTypes.sun_reflect_ConstantPool>(thread, thread.getBsCl(), 'Lsun/reflect/ConstantPool;');
    // @todo Make this a proper JavaObject. I don't think the JCL uses it as such,
    // but right now this function fails any automated sanity checks on return values.
    cpObj['sun/reflect/ConstantPool/constantPoolOop'] = <any> cls.constantPool;
    return cpObj;
  }

  public static 'getDeclaredFields0(Z)[Ljava/lang/reflect/Field;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class, publicOnly: number): void {
    var fields = javaThis.$cls.getFields();
    if (publicOnly) {
      fields = fields.filter((f) => f.accessFlags.isPublic());
    }
    var rv = util.newArray<JVMTypes.java_lang_reflect_Field>(thread, thread.getBsCl(), '[Ljava/lang/reflect/Field;', fields.length),
      i: number = 0;
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    util.asyncForEach(fields,
      (f, nextItem) => {
        f.reflector(thread, (fieldObj: JVMTypes.java_lang_reflect_Field) => {
          if (fieldObj !== null) {
            rv.array[i++] = fieldObj;
            nextItem();
          }
        });
      }, () => {
        thread.asyncReturn(rv);
      });
  }

  public static 'getDeclaredMethods0(Z)[Ljava/lang/reflect/Method;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class, publicOnly: number): void {
    var methods: methods.Method[] = javaThis.$cls.getMethods().filter((m: methods.Method) => {
      return m.name[0] !== '<' && (m.accessFlags.isPublic() || !publicOnly);
    }), rv = util.newArray<JVMTypes.java_lang_reflect_Method>(thread, thread.getBsCl(), '[Ljava/lang/reflect/Method;', methods.length),
      i = 0;
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    util.asyncForEach(methods,
      (m, nextItem) => {
        m.reflector(thread, (methodObj) => {
          if (methodObj !== null) {
            rv.array[i++] = <JVMTypes.java_lang_reflect_Method> methodObj;
            nextItem()
          }
        });
      }, () => {
        thread.asyncReturn(rv);
      });
  }

  public static 'getDeclaredConstructors0(Z)[Ljava/lang/reflect/Constructor;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class, publicOnly: number): void {
    var methods: methods.Method[] = javaThis.$cls.getMethods().filter((m: methods.Method) => {
      return m.name === '<init>' && (!publicOnly || m.accessFlags.isPublic());
    }), rv = util.newArray<JVMTypes.java_lang_reflect_Constructor>(thread, thread.getBsCl(), '[Ljava/lang/reflect/Constructor;', methods.length),
      i = 0;
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    util.asyncForEach(methods,
      (m: methods.Method, nextItem: (err?: any) => void) => {
        m.reflector(thread, (methodObj) => {
          if (methodObj !== null) {
            rv.array[i++] = <JVMTypes.java_lang_reflect_Constructor> methodObj;
            nextItem()
          }
        });
      }, () => {
        thread.asyncReturn(rv);
      });
  }

  public static 'getDeclaredClasses0()[Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Class): JVMTypes.JVMArray<JVMTypes.java_lang_Class> {
    var ret = util.newArray<JVMTypes.java_lang_Class>(thread, thread.getBsCl(), '[Ljava/lang/Class;', 0),
      cls = javaThis.$cls;
    if (cls instanceof ClassData.ReferenceClassData) {
      var myClass = cls.getInternalName(),
        iclses = <attributes.InnerClasses[]> cls.getAttributes('InnerClasses'),
        flatNames: ConstantPool.ClassReference[] = [];
      if (iclses.length === 0) {
        return ret;
      }
      for (var i = 0; i < iclses.length; i++) {
        flatNames = flatNames.concat(iclses[i].classes.filter((c: attributes.IInnerClassInfo) =>
          // select inner classes where the enclosing class is my_class
          c.outerInfoIndex > 0 && (<ConstantPool.ClassReference> cls.constantPool.get(c.outerInfoIndex)).name === myClass)
          .map((c: attributes.IInnerClassInfo) => (<ConstantPool.ClassReference> cls.constantPool.get(c.innerInfoIndex))));
      }
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      util.asyncForEach(flatNames,
        (clsRef: ConstantPool.ClassReference, nextItem: () => void) => {
          if (clsRef.isResolved()) {
            ret.array.push(clsRef.cls.getClassObject(thread));
            nextItem();
          } else {
            clsRef.resolve(thread, cls.getLoader(), <ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> javaThis.getClass(), (status) => {
              if (status) {
                ret.array.push(clsRef.cls.getClassObject(thread));
                nextItem();
              }
            });
          }
        }, () => thread.asyncReturn(ret));
    } else {
      return ret;
    }
  }

  public static 'desiredAssertionStatus0(Ljava/lang/Class;)Z'(thread: threading.JVMThread, arg0: JVMTypes.java_lang_Class): boolean {
    return thread.getThreadPool().getJVM().areAssertionsEnabled();
  }

}

class java_lang_ClassLoader$NativeLibrary {

  public static 'load(Ljava/lang/String;Z)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_ClassLoader$NativeLibrary, name: JVMTypes.java_lang_String, isBuiltIn: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'find(Ljava/lang/String;)J'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_ClassLoader$NativeLibrary, arg0: JVMTypes.java_lang_String): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'unload(Ljava/lang/String;)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_ClassLoader$NativeLibrary, name: JVMTypes.java_lang_String): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

// Fun Note: The bootstrap classloader object is represented by null.
class java_lang_ClassLoader {

  public static 'defineClass0(Ljava/lang/String;[BIILjava/security/ProtectionDomain;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_ClassLoader, arg0: JVMTypes.java_lang_String, arg1: JVMTypes.JVMArray<number>, arg2: number, arg3: number, arg4: JVMTypes.java_security_ProtectionDomain): JVMTypes.java_lang_Class {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'defineClass1(Ljava/lang/String;[BIILjava/security/ProtectionDomain;Ljava/lang/String;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_ClassLoader, name: JVMTypes.java_lang_String, bytes: JVMTypes.JVMArray<number>, offset: number, len: number, pd: gLong, source: JVMTypes.java_lang_String): JVMTypes.java_lang_Class {
    var loader = util.getLoader(thread, javaThis),
      type = util.int_classname(name.toString()),
      cls = loader.defineClass(thread, type, util.byteArray2Buffer(bytes.array, offset, len));
    if (cls == null) {
      return null;
    }
    // Ensure that this class is resolved.
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    cls.resolve(thread, (status) => {
      // NULL status means resolution failed.
      if (status !== null) {
        thread.asyncReturn(cls.getClassObject(thread));
      }
    }, true);
  }

  public static 'defineClass2(Ljava/lang/String;Ljava/nio/ByteBuffer;IILjava/security/ProtectionDomain;Ljava/lang/String;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_ClassLoader, arg0: JVMTypes.java_lang_String, arg1: JVMTypes.java_nio_ByteBuffer, arg2: number, arg3: number, arg4: JVMTypes.java_security_ProtectionDomain, arg5: JVMTypes.java_lang_String): JVMTypes.java_lang_Class {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'resolveClass0(Ljava/lang/Class;)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_ClassLoader, cls: JVMTypes.java_lang_Class): void {
    var loader = util.getLoader(thread, javaThis);
    if (cls.$cls.isResolved()) {
      return;
    }
    // Ensure that this class is resolved.
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    cls.$cls.resolve(thread, (cdata: ClassData.ClassData) => {
      if (cdata !== null) {
        thread.asyncReturn();
      }
      // Else: An exception occurred.
    }, true);
  }

  public static 'findBootstrapClass(Ljava/lang/String;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_ClassLoader, name: JVMTypes.java_lang_String): void {
    var type = util.int_classname(name.toString());
    // This returns null in OpenJDK7, but actually can throw an exception
    // in OpenJDK6.
    // TODO: Fix currently incorrect behavior for our JDK. Should return null, not throw an exception on failure.
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    thread.getBsCl().resolveClass(thread, type, (cls) => {
      if (cls != null) {
        thread.asyncReturn(cls.getClassObject(thread));
      }
    }, true);
  }

  public static 'findLoadedClass0(Ljava/lang/String;)Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_ClassLoader, name: JVMTypes.java_lang_String): JVMTypes.java_lang_Class {
    var loader = util.getLoader(thread, javaThis),
      type = util.int_classname(name.toString()),
      // Return JavaClassObject if loaded, or null otherwise.
      cls = loader.getResolvedClass(type);
    if (cls != null) {
      return cls.getClassObject(thread);
    } else {
      return null;
    }
  }

  public static 'retrieveDirectives()Ljava/lang/AssertionStatusDirectives;'(thread: threading.JVMThread): JVMTypes.java_lang_AssertionStatusDirectives {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class java_lang_Compiler {

  public static 'initialize()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'registerNatives()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'compileClass(Ljava/lang/Class;)Z'(thread: threading.JVMThread, arg0: JVMTypes.java_lang_Class): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'compileClasses(Ljava/lang/String;)Z'(thread: threading.JVMThread, arg0: JVMTypes.java_lang_String): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'command(Ljava/lang/Object;)Ljava/lang/Object;'(thread: threading.JVMThread, arg0: JVMTypes.java_lang_Object): JVMTypes.java_lang_Object {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  // NOP'd.
  public static 'enable()V'(thread: threading.JVMThread): void {}
  public static 'disable()V'(thread: threading.JVMThread): void {}

}

// Used for converting between numerical representations.
var conversionBuffer = new Buffer(8);

class java_lang_Double {

  public static 'doubleToRawLongBits(D)J'(thread: threading.JVMThread, num: number): gLong {
    conversionBuffer.writeDoubleLE(num, 0);
    return gLong.fromBits(conversionBuffer.readUInt32LE(0), conversionBuffer.readUInt32LE(4));
  }

  public static 'longBitsToDouble(J)D'(thread: threading.JVMThread, num: gLong): number {
    conversionBuffer.writeInt32LE(num.getLowBits(), 0);
    conversionBuffer.writeInt32LE(num.getHighBits(), 4);
    return conversionBuffer.readDoubleLE(0);
  }

}

class java_lang_Float {

  public static 'floatToRawIntBits(F)I'(thread: threading.JVMThread, num: number): number {
    conversionBuffer.writeFloatLE(num, 0);
    return conversionBuffer.readInt32LE(0);
  }

  public static 'intBitsToFloat(I)F'(thread: threading.JVMThread, num: number): number {
    conversionBuffer.writeInt32LE(num, 0);
    return conversionBuffer.readFloatLE(0);
  }

}

class java_lang_Object {

  public static 'getClass()Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Object): JVMTypes.java_lang_Class {
    return javaThis.getClass().getClassObject(thread);
  }

  public static 'hashCode()I'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Object): number {
    return javaThis.ref;
  }

  public static 'clone()Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Object): JVMTypes.java_lang_Object {
    var cls = javaThis.getClass();
    if (cls.getInternalName()[0] === '[') {
      // Array clone. It's always a shallow clone.
      return (<JVMTypes.JVMArray<any>> javaThis).slice(0);
    } else {
      var clonedObj = util.newObjectFromClass<JVMTypes.java_lang_Object>(thread, <ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> javaThis.getClass());
      Object.keys(javaThis).forEach((fieldName: string) => {
        (<any> clonedObj)[fieldName] = (<any> javaThis)[fieldName];
      });
      return clonedObj;
    }
  }

  public static 'notify()V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Object): void {
    debug("TE(notify): on lock *" + javaThis.ref);
    javaThis.getMonitor().notify(thread);
  }

  public static 'notifyAll()V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Object): void {
    debug("TE(notifyAll): on lock *" + javaThis.ref);
    javaThis.getMonitor().notifyAll(thread);
  }

  public static 'wait(J)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Object, timeout: gLong): void {
    debug("TE(wait): on lock *" + javaThis.ref);
    javaThis.getMonitor().wait(thread, (fromTimer: boolean) => {
      thread.asyncReturn();
    }, timeout.toNumber());
  }

}

class java_lang_Package {

  public static 'getSystemPackage0(Ljava/lang/String;)Ljava/lang/String;'(thread: threading.JVMThread, pkgNameObj: JVMTypes.java_lang_String): JVMTypes.java_lang_String {
    var pkgName = pkgNameObj.toString();
    if (thread.getBsCl().getPackageNames().indexOf(pkgName) >= 0) {
      return pkgNameObj;
    } else {
      return null;
    }
  }

  public static 'getSystemPackages0()[Ljava/lang/String;'(thread: threading.JVMThread): JVMTypes.JVMArray<JVMTypes.java_lang_String> {
    var pkgNames = thread.getBsCl().getPackageNames();
    return util.newArrayFromData<JVMTypes.java_lang_String>(thread, thread.getBsCl(), '[Ljava/lang/String;', pkgNames.map((pkgName) => util.initString(thread.getBsCl(), pkgName)));
  }
}

class java_lang_ProcessEnvironment {

  public static 'environ()[[B'(thread: threading.JVMThread): JVMTypes.JVMArray<JVMTypes.JVMArray<number>> {
    var envArr = util.newArray<JVMTypes.JVMArray<number>>(thread, thread.getBsCl(), '[[B', 0),
      env = process.env, key: string, v: string, bArr: JVMTypes.JVMArray<number>;
    // convert to an array of strings of the form [key, value, key, value ...]
    for (key in env) {
      v = env[key];
      bArr = util.newArray<number>(thread, thread.getBsCl(), '[B', 0);
      bArr.array = util.bytestr2Array(key);
      envArr.array.push(bArr);
      bArr = util.newArray<number>(thread, thread.getBsCl(), '[B', 0);
      bArr.array = util.bytestr2Array(v);
      envArr.array.push(bArr);
    }
    return envArr;
  }

}

class java_lang_reflect_Array {

  public static 'getLength(Ljava/lang/Object;)I'(thread: threading.JVMThread, arr: JVMTypes.JVMArray<JVMTypes.java_lang_Object>): number {
    if (verifyArray(thread, arr)) {
      if (isNotNull(thread, arr)) {
        return arr.array.length;
      }
    }
  }

  public static 'get(Ljava/lang/Object;I)Ljava/lang/Object;'(thread: threading.JVMThread, arr: JVMTypes.JVMArray<any>, idx: number): any {
    var val = arrayGet(thread, arr, idx);
    if (val != null) {
      var component = arr.getClass().getComponentClass();
      if (util.is_primitive_type(component.getInternalName())) {
        // Box primitive values.
        return (<ClassData.PrimitiveClassData> component).createWrapperObject(thread, val);
      }
    }
    return val;
  }

  public static 'getBoolean(Ljava/lang/Object;I)Z': (thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number) => number = arrayGet;
  public static 'getByte(Ljava/lang/Object;I)B': (thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number) => number = arrayGet;
  public static 'getChar(Ljava/lang/Object;I)C': (thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number) => number = arrayGet;
  public static 'getShort(Ljava/lang/Object;I)S': (thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number) => number = arrayGet;
  public static 'getInt(Ljava/lang/Object;I)I': (thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number) => number = arrayGet;
  public static 'getLong(Ljava/lang/Object;I)J': (thread: threading.JVMThread, arg0: JVMTypes.JVMArray<gLong>, arg1: number) => gLong = arrayGet;
  public static 'getFloat(Ljava/lang/Object;I)F': (thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number) => number = arrayGet;
  public static 'getDouble(Ljava/lang/Object;I)D': (thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number) => number = arrayGet;

  public static 'set(Ljava/lang/Object;ILjava/lang/Object;)V'(thread: threading.JVMThread, arr: JVMTypes.JVMArray<any>, idx: number, val: JVMTypes.java_lang_Object): void {
    if (verifyArray(thread, arr) && isNotNull(thread, arr)) {
      if (idx < 0 || idx >= arr.array.length) {
        thread.throwNewException('Ljava/lang/ArrayIndexOutOfBoundsException;', 'Tried to write to an illegal index in an array.');
      } else {
        var ccls = arr.getClass().getComponentClass();
        if (ccls instanceof ClassData.PrimitiveClassData) {
          if (val.getClass().isSubclass(thread.getBsCl().getInitializedClass(thread, (<ClassData.PrimitiveClassData> ccls).boxClassName()))) {
            var ccname = ccls.getInternalName();
            (<any> val)[`${util.internal2external[ccname]}Value()${ccname}`](thread, (e?: JVMTypes.java_lang_Throwable, rv?: any) => {
              if (e) {
                thread.throwException(e);
              } else {
                arr.array[idx] = rv;
                thread.asyncReturn();
              }
            });
          } else {
            thread.throwNewException('Ljava/lang/IllegalArgumentException;', 'argument type mismatch');
          }
        } else if (val.getClass().isSubclass(ccls)) {
          arr.array[idx] = val;
        } else {
          thread.throwNewException('Ljava/lang/IllegalArgumentException;', 'argument type mismatch');
        }
      }
    }
  }

  public static 'setBoolean(Ljava/lang/Object;IZ)V'(thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setByte(Ljava/lang/Object;IB)V'(thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setChar(Ljava/lang/Object;IC)V'(thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setShort(Ljava/lang/Object;IS)V'(thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setInt(Ljava/lang/Object;II)V'(thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setLong(Ljava/lang/Object;IJ)V'(thread: threading.JVMThread, arg0: JVMTypes.JVMArray<gLong>, arg1: number, arg2: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setFloat(Ljava/lang/Object;IF)V'(thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'setDouble(Ljava/lang/Object;ID)V'(thread: threading.JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'newArray(Ljava/lang/Class;I)Ljava/lang/Object;'(thread: threading.JVMThread, cls: JVMTypes.java_lang_Class, len: number): JVMTypes.JVMArray<any> {
    return util.newArray<any>(thread, cls.$cls.getLoader(), `[${cls.$cls.getInternalName()}`, len);
  }

  public static 'multiNewArray(Ljava/lang/Class;[I)Ljava/lang/Object;'(thread: threading.JVMThread, jco: JVMTypes.java_lang_Class, lens: JVMTypes.JVMArray<number>): JVMTypes.JVMArray<any> {
    var typeStr = (new Array(lens.array.length + 1)).join('[') + jco.$cls.getInternalName();
    if (jco.$cls.isInitialized(thread)) {
      return util.multiNewArray<any>(thread, jco.$cls.getLoader(), typeStr, lens.array);
    } else {
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      jco.$cls.initialize(thread, (cls) => {
        thread.asyncReturn(util.multiNewArray<any>(thread, jco.$cls.getLoader(), typeStr, lens.array));
      });
    }
  }

}

class java_lang_reflect_Proxy {

  public static 'defineClass0(Ljava/lang/ClassLoader;Ljava/lang/String;[BII)Ljava/lang/Class;'(thread: threading.JVMThread, cl: JVMTypes.java_lang_ClassLoader, name: JVMTypes.java_lang_String, bytes: JVMTypes.JVMArray<number>, offset: number, len: number): JVMTypes.java_lang_Class {
    var loader = util.getLoader(thread, cl),
      cls = loader.defineClass(thread, util.int_classname(name.toString()), util.byteArray2Buffer(bytes.array, offset, len));
    if (cls != null) {
      return cls.getClassObject(thread);
    }
  }

}

class java_lang_Runtime {

  public static 'availableProcessors()I'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Runtime): number {
    return 1;
  }

  public static 'freeMemory()J'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Runtime): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'totalMemory()J'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Runtime): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  /**
   * Returns the maximum amount of memory that the Java Virtual Machine will
   * attempt to use, in bytes, as a Long. If there is no inherent limit then the
   * value Long.MAX_VALUE will be returned.
   *
   * Currently returns Long.MAX_VALUE because unlike other JVMs Doppio has no
   * hard limit on the heap size.
   */
  public static 'maxMemory()J'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Runtime): gLong {
    debug("Warning: maxMemory has no meaningful value in Doppio -- there is no hard memory limit.");
    return gLong.MAX_VALUE;
  }

  /**
   * No universal way of forcing browser to GC, so we yield in hopes
   * that the browser will use it as an opportunity to GC.
   */
  public static 'gc()V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Runtime): void {
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    setImmediate(() => {
      thread.asyncReturn();
    });
  }

  public static 'runFinalization0()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'traceInstructions(Z)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Runtime, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'traceMethodCalls(Z)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Runtime, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_lang_SecurityManager {

  public static 'getClassContext()[Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_SecurityManager): JVMTypes.JVMArray<JVMTypes.java_lang_Class> {
    // return an array of classes for each method on the stack
    // starting with the current method and going up the call chain
    return util.newArrayFromData<JVMTypes.java_lang_Class>(thread, thread.getBsCl(), '[Ljava/lang/Class;', thread.getStackTrace().map((item) => item.method.cls.getClassObject(thread)));;
  }

  public static 'currentClassLoader0()Ljava/lang/ClassLoader;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_SecurityManager): JVMTypes.java_lang_ClassLoader {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'classDepth(Ljava/lang/String;)I'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_SecurityManager, arg0: JVMTypes.java_lang_SecurityManager): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'classLoaderDepth0()I'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_SecurityManager): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'currentLoadedClass0()Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_SecurityManager): JVMTypes.java_lang_Class {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class java_lang_Shutdown {

  public static 'halt0(I)V'(thread: threading.JVMThread, status: number): void {
    // @todo Actually add a mechanism to abort with a code.
    thread.getThreadPool().getJVM().abort();
  }

  public static 'runAllFinalizers()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_lang_StrictMath {

  public static 'sin(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.sin(d_val);
  }

  public static 'cos(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.cos(d_val);
  }

  public static 'tan(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.tan(d_val);
  }

  public static 'asin(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.asin(d_val);
  }

  public static 'acos(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.acos(d_val);
  }

  public static 'atan(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.atan(d_val);
  }

  public static 'exp(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.exp(d_val);
  }

  public static 'log(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.log(d_val);
  }

  public static 'log10(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.log(d_val) / Math.LN10;
  }

  public static 'sqrt(D)D'(thread: threading.JVMThread, d_val: number): number {
    return Math.sqrt(d_val);
  }

  public static 'cbrt(D)D'(thread: threading.JVMThread, d_val: number): number {
    var is_neg = d_val < 0;
    if (is_neg) {
      return -Math.pow(-d_val, 1 / 3);
    } else {
      return Math.pow(d_val, 1 / 3);
    }
  }

  public static 'IEEEremainder(DD)D'(thread: threading.JVMThread, x: number, y: number): number {
    // Purge off exception values.
    if (x == Number.NEGATIVE_INFINITY || ! (x < Number.POSITIVE_INFINITY)
	|| y == 0 || y != y)
      return Number.NaN;

    var TWO_1023 = 8.98846567431158e307; // Long bits 0x7fe0000000000000L.

    var negative = x < 0;
    x = Math.abs(x);
    y = Math.abs(y);
    if (x == y || x == 0)
      return 0 * x; // Get correct sign.

    // Achieve x < 2y, then take first shot at remainder.
    if (y < TWO_1023)
      x %= y + y;

    // Now adjust x to get correct precision.
    if (y < 4 / TWO_1023)
      {
        if (x + x > y)
          {
            x -= y;
            if (x + x >= y)
              x -= y;
          }
      }
    else
      {
        y *= 0.5;
        if (x > y)
          {
            x -= y;
            if (x >= y)
              x -= y;
          }
      }
    return negative ? -x : x;
  }

  public static 'atan2(DD)D'(thread: threading.JVMThread, y: number, x: number): number {
    return Math.atan2(y, x);
  }

  public static 'pow(DD)D'(thread: threading.JVMThread, base: number, exp: number): number {
    return Math.pow(base, exp);
  }

  public static 'sinh(D)D'(thread: threading.JVMThread, d_val: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'cosh(D)D'(thread: threading.JVMThread, d_val: number): number {
    var exp = Math.exp(d_val);
    return (exp + 1 / exp) / 2;
  }

  public static 'tanh(D)D'(thread: threading.JVMThread, d_val: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'hypot(DD)D'(thread: threading.JVMThread, arg0: number, arg1: number): number {
    return Math.sqrt(Math.pow(arg0, 2) + Math.pow(arg1, 2));
  }

  public static 'expm1(D)D'(thread: threading.JVMThread, d_val: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'log1p(D)D'(thread: threading.JVMThread, d_val: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

}

class java_lang_String {

  public static 'intern()Ljava/lang/String;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_String): JVMTypes.java_lang_String {
    return thread.getThreadPool().getJVM().internString(javaThis.toString(), javaThis);
  }

}

class java_lang_System {

  public static 'setIn0(Ljava/io/InputStream;)V'(thread: threading.JVMThread, stream: JVMTypes.java_io_InputStream): void {
    var sys = util.getStaticFields<typeof JVMTypes.java_lang_System>(thread, thread.getBsCl(), 'Ljava/lang/System;');
    sys['java/lang/System/in'] = stream;
  }

  public static 'setOut0(Ljava/io/PrintStream;)V'(thread: threading.JVMThread, stream: JVMTypes.java_io_PrintStream): void {
    var sys = util.getStaticFields<typeof JVMTypes.java_lang_System>(thread, thread.getBsCl(), 'Ljava/lang/System;');
    sys['java/lang/System/out'] = stream;
  }

  public static 'setErr0(Ljava/io/PrintStream;)V'(thread: threading.JVMThread, stream: JVMTypes.java_io_PrintStream): void {
    var sys = util.getStaticFields<typeof JVMTypes.java_lang_System>(thread, thread.getBsCl(), 'Ljava/lang/System;');
    sys['java/lang/System/err'] = stream;
  }

  public static 'currentTimeMillis()J'(thread: threading.JVMThread): gLong {
    return gLong.fromNumber((new Date).getTime());
  }

  /**
   * @todo Use performance.now() if available.
   */
  public static 'nanoTime()J'(thread: threading.JVMThread): gLong {
    return gLong.fromNumber((new Date).getTime()).multiply(gLong.fromNumber(1000000));
  }

  public static 'arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V'(thread: threading.JVMThread, src: JVMTypes.JVMArray<any>, srcPos: number, dest: JVMTypes.JVMArray<any>, destPos: number, length: number): void {
    // Needs to be checked *even if length is 0*.
    if ((src == null) || (dest == null)) {
      thread.throwNewException('Ljava/lang/NullPointerException;', 'Cannot copy to/from a null array.');
    }
    // Can't do this on non-array types. Need to check before I check bounds below, or else I'll get an exception.
    else if (!(src.getClass() instanceof ClassData.ArrayClassData) || !(dest.getClass() instanceof ClassData.ArrayClassData)) {
      thread.throwNewException('Ljava/lang/ArrayStoreException;', 'src and dest arguments must be of array type.');
    }
    // Also needs to be checked *even if length is 0*.
    else if (srcPos < 0 || (srcPos + length) > src.array.length || destPos < 0 || (destPos + length) > dest.array.length || length < 0) {
      // System.arraycopy requires IndexOutOfBoundsException, but Java throws an array variant of the exception in practice.
      thread.throwNewException('Ljava/lang/ArrayIndexOutOfBoundsException;', 'Tried to write to an illegal index in an array.');
    } else {
      var srcClass = src.getClass(), destClass = dest.getClass();
      // Special case; need to copy the section of src that is being copied into a temporary array before actually doing the copy.
      if (src === dest) {
        src = dest.slice(srcPos, srcPos + length)
        srcPos = 0;
      }
      if (srcClass.isCastable(destClass)) {
        // Fast path
        util.arraycopyNoCheck(src, srcPos, dest, destPos, length);
      } else {
        // Slow path
        // Absolutely cannot do this when two different primitive types, or a primitive type and a reference type.
        var srcCompCls = src.getClass().getComponentClass(),
          destCompCls = dest.getClass().getComponentClass();
        if ((srcCompCls instanceof ClassData.PrimitiveClassData) || (destCompCls instanceof ClassData.PrimitiveClassData)) {
          thread.throwNewException('Ljava/lang/ArrayStoreException;', 'If calling arraycopy with a primitive array, both src and dest must be of the same primitive type.');
        } else {
          // Must be two reference types.
          util.arraycopyCheck(thread, src, srcPos, dest, destPos, length);
        }
      }
    }
  }

  public static 'identityHashCode(Ljava/lang/Object;)I'(thread: threading.JVMThread, x: JVMTypes.java_lang_Object): number {
    if (x != null && x.ref != null) {
      return x.ref;
    }
    return 0;
  }

  public static 'initProperties(Ljava/util/Properties;)Ljava/util/Properties;'(thread: threading.JVMThread, props: JVMTypes.java_util_Properties): void {
    var jvm = thread.getThreadPool().getJVM(),
      properties = jvm.getSystemPropertyNames();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    util.asyncForEach(properties, (propertyName: string, nextItem: (err?: JVMTypes.java_lang_Throwable) => void) => {
      var propertyVal = jvm.getSystemProperty(propertyName);
      props["setProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/Object;"](thread, [jvm.internString(propertyName), jvm.internString(propertyVal)], nextItem);
    }, (err?: JVMTypes.java_lang_Throwable) => {
      if (err) {
        thread.throwException(err);
      } else {
        thread.asyncReturn(props);
      }
    });
  }

  public static 'mapLibraryName(Ljava/lang/String;)Ljava/lang/String;'(thread: threading.JVMThread, arg0: JVMTypes.java_lang_String): JVMTypes.java_lang_String {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class java_lang_Thread {

  public static 'currentThread()Ljava/lang/Thread;'(thread: threading.JVMThread): JVMTypes.java_lang_Thread {
    return thread.getJVMObject();
  }

  public static 'yield()V'(thread: threading.JVMThread): void {
    // Force the thread scheduler to pick another thread by waiting for a short
    // amount of time.
    // @todo Build this into the scheduler?
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    setImmediate(() => {
      thread.setStatus(enums.ThreadStatus.RUNNABLE);
      thread.asyncReturn();
    });
  }

  public static 'sleep(J)V'(thread: threading.JVMThread, millis: gLong): void {
    var beforeMethod = thread.currentMethod();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    setTimeout(() => {
      // Check if the thread was interrupted during our sleep. Interrupting
      // sleep causes an exception, so we need to ignore the setTimeout
      // callback in this case.
      if (beforeMethod === thread.currentMethod()) {
        thread.setStatus(enums.ThreadStatus.RUNNABLE);
        thread.asyncReturn();
      }
    }, millis.toNumber());
  }

  public static 'start0()V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Thread): void {
    javaThis['run()V'](javaThis.$thread);
  }

  public static 'isInterrupted(Z)Z'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Thread, clearFlag: number): boolean {
    var isInterrupted = javaThis.$thread.isInterrupted();
    if (clearFlag) {
      javaThis.$thread.setInterrupted(false);
    }
    return isInterrupted;
  }

  public static 'isAlive()Z'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Thread): boolean {
    var state = javaThis.$thread.getStatus();
    return state !== enums.ThreadStatus.TERMINATED && state !== enums.ThreadStatus.NEW;
  }

  public static 'countStackFrames()I'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Thread): number {
    return javaThis.$thread.getStackTrace().length;
  }

  public static 'holdsLock(Ljava/lang/Object;)Z'(thread: threading.JVMThread, obj: JVMTypes.java_lang_Object): boolean {
    var mon = obj.getMonitor();
    return mon.getOwner() === thread;
  }

  public static 'dumpThreads([Ljava/lang/Thread;)[[Ljava/lang/StackTraceElement;'(thread: threading.JVMThread, arg0: JVMTypes.JVMArray<JVMTypes.java_lang_Thread>): JVMTypes.JVMArray<JVMTypes.JVMArray<JVMTypes.java_lang_StackTraceElement>> {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getThreads()[Ljava/lang/Thread;'(thread: threading.JVMThread): JVMTypes.JVMArray<JVMTypes.java_lang_Thread> {
    return util.newArrayFromData<JVMTypes.java_lang_Thread>(thread, thread.getBsCl(), '[Ljava/lang/Thread;', thread.getThreadPool().getThreads().map((thread: threading.JVMThread) => thread.getJVMObject()));
  }

  public static 'setPriority0(I)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Thread, arg0: number): void {
    // NOP
  }

  public static 'stop0(Ljava/lang/Object;)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Thread, arg0: JVMTypes.java_lang_Object): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'suspend0()V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Thread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'resume0()V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Thread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  /**
   * Interrupts this thread.
   *
   * Unless the current thread is interrupting itself, which is always
   * permitted, the checkAccess method of this thread is invoked, which may
   * cause a SecurityException to be thrown.
   *
   * - If this thread is blocked in an invocation of the Object.wait(),
   *   wait(long), or Object.wait(long,int) methods of the Object class, or of
   *   the join(), join(long), join(long,int), sleep(long), or sleep(long,int),
   *   methods of this class, then its interrupt status will be cleared and it
   *   will receive an InterruptedException.
   *
   * - If this thread is blocked in an I/O operation upon an
   *   java.nio.channels.InterruptibleChannel then the channel will be closed,
   *   the thread's interrupt status will be set, and the thread will receive a
   *   java.nio.channels.ClosedByInterruptException.
   *
   * - If this thread is blocked in a java.nio.channels.Selector then the
   *   thread's interrupt status will be set and it will return immediately from
   *   the selection operation, possibly with a non-zero value, just as if the
   *   selector's java.nio.channels.Selector.wakeup() method were invoked.
   *
   * - If none of the previous conditions hold then this thread's interrupt
   *   status will be set.
   *
   * Interrupting a thread that is not alive need not have any effect.
   */
  public static 'interrupt0()V'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Thread): void {
    function throwInterruptedException() {
      javaThis.$thread.throwNewException('Ljava/lang/InterruptedException;', 'interrupt0 called');
    }

    var nativeThreadObj = javaThis.$thread;
    // See if we have access to modify this thread.
    javaThis['checkAccess()V'](thread, (e?: JVMTypes.java_lang_Throwable) => {
      if (e) {
        // SecurityException. Rethrow it.
        thread.throwException(e);
      } else {
        // Check if thread is alive.
        var status = nativeThreadObj.getStatus();
        switch (status) {
          case enums.ThreadStatus.NEW:
          case enums.ThreadStatus.TERMINATED:
            // Thread is not alive. NOP.
            return thread.asyncReturn();
          case enums.ThreadStatus.BLOCKED:
          case enums.ThreadStatus.WAITING:
          case enums.ThreadStatus.TIMED_WAITING:
            // Thread is waiting or blocked on a monitor. Clear interrupted
            // status, and throw an interrupted exception.
            nativeThreadObj.setInterrupted(false);
            // Exit the monitor.
            var monitor = nativeThreadObj.getMonitorBlock();
            if (status === enums.ThreadStatus.BLOCKED) {
              monitor.unblock(nativeThreadObj, true);
              throwInterruptedException();
            } else {
              monitor.unwait(nativeThreadObj, false, true, throwInterruptedException);
            }
            return thread.asyncReturn();
          case enums.ThreadStatus.PARKED:
            // Parked threads become unparked when interrupted.
            javaThis.$thread.getThreadPool().completelyUnpark(nativeThreadObj);
            // FALL-THROUGH
          default:
            var threadCls = <ClassData.ReferenceClassData<JVMTypes.java_lang_Thread>> thread.getBsCl().getInitializedClass(thread, 'Ljava/lang/Thread;'),
              // If we are in the following methods, we throw an InterruptedException:
              interruptMethods: methods.Method[] = [
                threadCls.methodLookup('join()V'),   // * Thread.join()
                threadCls.methodLookup('join(J)V'),  // * Thread.join(long)
                threadCls.methodLookup('join(JI)V'), // * Thread.join(long, int)
                threadCls.methodLookup('sleep(J)V'), // * Thread.sleep(long)
                threadCls.methodLookup('sleep(JI)V') // * Thread.sleep(long, int)
              ],
              stackTrace = nativeThreadObj.getStackTrace(),
              currentMethod = stackTrace[stackTrace.length - 1].method;
            if (interruptMethods.indexOf(currentMethod) !== -1) {
              // Clear interrupt state before throwing the exception.
              nativeThreadObj.setInterrupted(false);
              nativeThreadObj.throwNewException('Ljava/lang/InterruptedException;', 'interrupt0 called');
            } else {
              // Set the interrupted status.
              nativeThreadObj.setInterrupted(true);
            }
            return thread.asyncReturn();
        }
      }
    });
  }

}

class java_lang_Throwable {

  /**
   * NOTE: Integer is only there to distinguish this function from non-native fillInStackTrace()V.
   */
  public static 'fillInStackTrace(I)Ljava/lang/Throwable;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Throwable, dummy: number): JVMTypes.java_lang_Throwable {
    var stackTraceElementCls = <ClassData.ReferenceClassData<JVMTypes.java_lang_StackTraceElement>> thread.getBsCl().getInitializedClass(thread, 'Ljava/lang/StackTraceElement;'),
      stacktrace = util.newArray<JVMTypes.java_lang_StackTraceElement>(thread, thread.getBsCl(), '[Ljava/lang/StackTraceElement;', 0),
      cstack = thread.getStackTrace(),
      i: number, j: number, bsCl = thread.getBsCl();
    /**
     * OK, so we need to toss the following stack frames:
     * - The stack frame for this method.
     * - If we're still constructing the throwable object, we need to toss any
     *   stack frames involved in constructing the throwable. But if we're not,
     *   then there's no other frames we should cut.
     */
    cstack.pop(); // The stack frame for this method.
    // Bytecode methods involved in constructing the throwable. We assume that
    // there are no native methods involved in the mix other than this one.
    while (cstack.length > 0 &&
      !cstack[cstack.length - 1].method.accessFlags.isNative() &&
      cstack[cstack.length - 1].locals[0] === javaThis) {
      cstack.pop();
    }

    // Construct the stack such that the method on top of the stack is at index
    // 0.
    for (i = cstack.length - 1; i >= 0; i--) {
      var sf = cstack[i],
        cls = sf.method.cls,
        ln = -1,
        sourceFile: string;
      // Java 8: Ignore 'Hidden' methods. These are involved in constructing
      // Lambdas, and shouldn't be use-visible.
      if (sf.method.isHidden()) {
        continue;
      }

      if (sf.method.accessFlags.isNative()) {
        sourceFile = 'Native Method';
      } else {
        var srcAttr = <attributes.SourceFile> cls.getAttribute('SourceFile'),
          code = sf.method.getCodeAttribute(),
          table = <attributes.LineNumberTable> code.getAttribute('LineNumberTable');
        sourceFile = (srcAttr != null) ? srcAttr.filename : 'unknown';

        if (table != null) {
          ln = table.getLineNumber(sf.pc);
        } else {
          ln = -1;
        }
      }

      var newElement = util.newObjectFromClass<JVMTypes.java_lang_StackTraceElement>(thread, stackTraceElementCls);
      newElement['java/lang/StackTraceElement/declaringClass'] = util.initString(bsCl, util.ext_classname(cls.getInternalName()));
      newElement['java/lang/StackTraceElement/methodName'] = util.initString(bsCl, sf.method.name != null ? sf.method.name : 'unknown');
      newElement['java/lang/StackTraceElement/fileName'] = util.initString(bsCl, sourceFile);
      newElement['java/lang/StackTraceElement/lineNumber'] = ln;
      stacktrace.array.push(newElement);
    }
    javaThis['java/lang/Throwable/backtrace'] = stacktrace;
    return javaThis;
  }

  public static 'getStackTraceDepth()I'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Throwable): number {
    // 'backtrace' is typed as an Object so JVMs have flexibility in what to store there.
    // We simply store the stack trace element array.
    return (<JVMTypes.JVMArray<JVMTypes.java_lang_StackTraceElement>> javaThis['java/lang/Throwable/backtrace']).array.length;
  }

  public static 'getStackTraceElement(I)Ljava/lang/StackTraceElement;'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_Throwable, depth: number): JVMTypes.java_lang_StackTraceElement {
    return (<JVMTypes.JVMArray<JVMTypes.java_lang_StackTraceElement>> javaThis['java/lang/Throwable/backtrace']).array[depth];
  }

}

class java_lang_UNIXProcess {

  public static 'waitForProcessExit(I)I'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_UNIXProcess, arg0: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'forkAndExec(I[B[B[BI[BI[B[IZ)I'(thread: threading.JVMThread, javaThis: JVMTypes.java_lang_UNIXProcess): void {
    thread.throwNewException('Ljava/lang/Error;', "Doppio doesn't support forking processes.");
  }

  public static 'destroyProcess(IZ)V'(thread: threading.JVMThread, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'init()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

/**
 * Misc. MemberName-specific constants, enum'd so they get inlined.
 */
enum MemberNameConstants {
  /* Bit masks for FLAGS for particular types */
  IS_METHOD           = 0x00010000, // method (not constructor)
  IS_CONSTRUCTOR      = 0x00020000, // constructor
  IS_FIELD            = 0x00040000, // field
  IS_TYPE             = 0x00080000, // nested type
  CALLER_SENSITIVE    = 0x00100000, // @CallerSensitive annotation detected
  /* Passed in in matchFlags argument of MHN.getMembers */
  SEARCH_SUPERCLASSES = 0x00100000,
  SEARCH_INTERFACES   = 0x00200000,
  /* Number of bits to shift over the reference kind into the MN's flags. */
  REFERENCE_KIND_SHIFT = 24,
  /* Mask to extract member type. */
  ALL_KINDS = (IS_METHOD | IS_CONSTRUCTOR | IS_FIELD | IS_TYPE)
}

/**
 * Given a MemberName object and a reflective field/method/constructor,
 * initializes the member name:
 * - name: Name of the field/method.
 * - clazz: Referenced class that contains the method.
 * - flags: Encodes the reference type of the member and the member's access flags.
 * - type: String encoding of the type (method descriptor, or class name of field type in descriptor form)
 * - vmtarget: Contains the VM-specific pointer to the member (in our case, a Method or Field object)
 * (set clazz, updates flags, sets vmtarget).
 */
function initializeMemberName(thread: threading.JVMThread, mn: JVMTypes.java_lang_invoke_MemberName, ref: methods.AbstractMethodField) {
  var flags = mn['java/lang/invoke/MemberName/flags'],
    type = mn['java/lang/invoke/MemberName/type'],
    name = mn['java/lang/invoke/MemberName/name'],
    refKind: number,
    existingRefKind = flags >>> MemberNameConstants.REFERENCE_KIND_SHIFT;

  // Determine the reference type.
  if (ref instanceof methods.Method) {
     flags = MemberNameConstants.IS_METHOD;
     if (ref.cls.accessFlags.isInterface()) {
       refKind = enums.MethodHandleReferenceKind.INVOKEINTERFACE;
     } else if (ref.accessFlags.isStatic()) {
       refKind = enums.MethodHandleReferenceKind.INVOKESTATIC;
     } else if (ref.name[0] === '<') {
       flags = MemberNameConstants.IS_CONSTRUCTOR;
       refKind = enums.MethodHandleReferenceKind.INVOKESPECIAL;
     } else {
       refKind = enums.MethodHandleReferenceKind.INVOKEVIRTUAL;
     }
     mn.vmtarget = ref.getVMTargetBridgeMethod(thread, existingRefKind ? existingRefKind : refKind);
     if (refKind === enums.MethodHandleReferenceKind.INVOKEINTERFACE ||
       refKind === enums.MethodHandleReferenceKind.INVOKEVIRTUAL) {
       mn.vmindex = ref.cls.getVMIndexForMethod(ref);
     }
     flags |= (refKind << MemberNameConstants.REFERENCE_KIND_SHIFT) | methodFlags(ref);
  } else {
    flags = MemberNameConstants.IS_FIELD;
    // Assume a GET.
    if (ref.accessFlags.isStatic()) {
      refKind = enums.MethodHandleReferenceKind.GETSTATIC;
    } else {
      refKind = enums.MethodHandleReferenceKind.GETFIELD;
    }
    mn.vmindex = ref.cls.getVMIndexForField(<methods.Field> ref);
    flags |= (refKind << MemberNameConstants.REFERENCE_KIND_SHIFT) | ref.accessFlags.getRawByte();
  }
  // Initialize type if we need to.
  if (type === null) {
    type = thread.getThreadPool().getJVM().internString(ref.rawDescriptor);
  }
  // Initialize name if we need to.
  if (name === null) {
    name = thread.getThreadPool().getJVM().internString(ref.name);
  }
  mn['java/lang/invoke/MemberName/clazz'] = ref.cls.getClassObject(thread);
  mn['java/lang/invoke/MemberName/flags'] = flags;
  mn['java/lang/invoke/MemberName/type'] = type;
  mn['java/lang/invoke/MemberName/name'] = name;
}

/**
 * Returns the MemberName flags for the given method.
 */
function methodFlags(method: methods.Method): number {
  var flags = method.accessFlags.getRawByte();
  if (method.isCallerSensitive()) {
    flags |= MemberNameConstants.CALLER_SENSITIVE;
  }
  return flags;
}

class java_lang_invoke_MethodHandleNatives {
  /**
   * I'm going by JAMVM's implementation of this method, which is very easy
   * to understand:
   * http://sourceforge.net/p/jamvm/code/ci/master/tree/src/classlib/openjdk/mh.c#l388
   *
   * The second argument is a Reflection object for the specified member,
   * which is either a Field, Method, or Constructor.
   *
   * We need to:
   * * Set "clazz" field to item's declaring class in the reflection object.
   * * Set "flags" field to items's flags, OR'd with its type (method/field/
   *   constructor), and OR'd with its reference kind shifted up by 24.
   * * Set "vmtarget" if relevant.
   * * Set "vmindex" if relevant.
   *
   * This method "resolves" the MemberName unambiguously using the provided
   * reflection object.
   *
   */
  public static 'init(Ljava/lang/invoke/MemberName;Ljava/lang/Object;)V'(thread: threading.JVMThread, self: JVMTypes.java_lang_invoke_MemberName, ref: JVMTypes.java_lang_Object): void {
    var clazz: JVMTypes.java_lang_Class,
      clazzData: ClassData.ReferenceClassData<JVMTypes.java_lang_Class>,
      flags: number, m: methods.Method, f: methods.Field;
    switch (ref.getClass().getInternalName()) {
      case "Ljava/lang/reflect/Method;":
        var methodObj = <JVMTypes.java_lang_reflect_Method> ref, refKind:  number;
        clazz = methodObj['java/lang/reflect/Method/clazz'];
        clazzData = (<ClassData.ReferenceClassData<JVMTypes.java_lang_Class>> clazz.$cls);
        m = clazzData.getMethodFromSlot(methodObj['java/lang/reflect/Method/slot']);
        flags = methodFlags(m) | MemberNameConstants.IS_METHOD;
        if (m.accessFlags.isStatic()) {
          refKind = enums.MethodHandleReferenceKind.INVOKESTATIC;
        } else if (clazzData.accessFlags.isInterface()) {
          refKind = enums.MethodHandleReferenceKind.INVOKEINTERFACE;
        } else {
          refKind = enums.MethodHandleReferenceKind.INVOKEVIRTUAL;
        }
        flags |= refKind << MemberNameConstants.REFERENCE_KIND_SHIFT;

        self['java/lang/invoke/MemberName/clazz'] = clazz;
        self['java/lang/invoke/MemberName/flags'] = flags;
        self.vmtarget = m.getVMTargetBridgeMethod(thread, refKind);
        // Only set vmindex for virtual dispatch.
        if (refKind === enums.MethodHandleReferenceKind.INVOKEVIRTUAL || refKind === enums.MethodHandleReferenceKind.INVOKEINTERFACE) {
          self.vmindex = clazzData.getVMIndexForMethod(m);
        }
        break;
      case "Ljava/lang/reflect/Constructor;":
        var consObj = <JVMTypes.java_lang_reflect_Constructor> ref;
        clazz = consObj['java/lang/reflect/Constructor/clazz'];
        clazzData = (<ClassData.ReferenceClassData<JVMTypes.java_lang_Class>> clazz.$cls);
        m = clazzData.getMethodFromSlot(consObj['java/lang/reflect/Constructor/slot']);
        flags = methodFlags(m) | MemberNameConstants.IS_CONSTRUCTOR | (enums.MethodHandleReferenceKind.INVOKESPECIAL << MemberNameConstants.REFERENCE_KIND_SHIFT);
        self['java/lang/invoke/MemberName/clazz'] = clazz;
        self['java/lang/invoke/MemberName/flags'] = flags;
        self.vmtarget = m.getVMTargetBridgeMethod(thread, refKind);
        // vmindex not relevant; nonvirtual dispatch.
        break;
      case "Ljava/lang/reflect/Field;":
        var fieldObj = <JVMTypes.java_lang_reflect_Field> ref;
        clazz = fieldObj['java/lang/reflect/Field/clazz'];
        clazzData = (<ClassData.ReferenceClassData<JVMTypes.java_lang_Class>> clazz.$cls);
        f = clazzData.getFieldFromSlot(fieldObj['java/lang/reflect/Field/slot']);
        flags = f.accessFlags.getRawByte() | MemberNameConstants.IS_FIELD;
        flags |= (f.accessFlags.isStatic() ? enums.MethodHandleReferenceKind.GETSTATIC : enums.MethodHandleReferenceKind.GETFIELD) << MemberNameConstants.REFERENCE_KIND_SHIFT;

        self['java/lang/invoke/MemberName/clazz'] = clazz;
        self['java/lang/invoke/MemberName/flags'] = flags;
        self.vmindex = clazzData.getVMIndexForField(f);
        // vmtarget not relevant.
        break;
      default:
        thread.throwNewException("Ljava/lang/InternalError;", "init: Invalid target.");
        break;
    }
  }

  public static 'getConstant(I)I'(thread: threading.JVMThread, arg0: number): number {
    // I have no idea what the semantics are, but returning 0 disables some internal MH-related counting.
    return 0;
  }

  /**
   * I'm going by JAMVM's implementation of resolve:
   * http://sourceforge.net/p/jamvm/code/ci/master/tree/src/classlib/openjdk/mh.c#l1266
   * @todo It doesn't do anything with the lookupClass... is that for permission checks?
   *
   * Input: A MemberName object that already has a name, reference kind, and class set.
   * Uses that info to resolve a concrete method, and then updates the MemberName's flags,
   * sets "vmtarget", and sets "vmindex".
   */
  public static 'resolve(Ljava/lang/invoke/MemberName;Ljava/lang/Class;)Ljava/lang/invoke/MemberName;'(thread: threading.JVMThread, memberName: JVMTypes.java_lang_invoke_MemberName, lookupClass: JVMTypes.java_lang_Class): JVMTypes.java_lang_invoke_MemberName {
    var type = memberName['java/lang/invoke/MemberName/type'],
      name = memberName['java/lang/invoke/MemberName/name'].toString(),
      clazz = <ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> memberName['java/lang/invoke/MemberName/clazz'].$cls,
      flags = memberName['java/lang/invoke/MemberName/flags'],
      refKind = flags >>> MemberNameConstants.REFERENCE_KIND_SHIFT;

    if (clazz == null || name == null || type == null) {
      thread.throwNewException("Ljava/lang/IllegalArgumentException;", "Invalid MemberName.");
      return;
    }

    assert((flags & MemberNameConstants.CALLER_SENSITIVE) === 0, "Not yet supported: Caller sensitive methods.");
    switch (flags & MemberNameConstants.ALL_KINDS) {
      case MemberNameConstants.IS_CONSTRUCTOR:
      case MemberNameConstants.IS_METHOD:
        // Need to perform method lookup.
        var methodTarget = clazz.signaturePolymorphicAwareMethodLookup(name + (<JVMTypes.java_lang_invoke_MethodType> type).toString());
        if (methodTarget !== null) {
          flags |= methodFlags(methodTarget);
          memberName['java/lang/invoke/MemberName/flags'] = flags;
          memberName.vmtarget = methodTarget.getVMTargetBridgeMethod(thread, flags >>> MemberNameConstants.REFERENCE_KIND_SHIFT);
          // vmindex is only relevant for virtual dispatch.
          if (refKind === enums.MethodHandleReferenceKind.INVOKEINTERFACE || refKind === enums.MethodHandleReferenceKind.INVOKEVIRTUAL) {
            memberName.vmindex = clazz.getVMIndexForMethod(methodTarget);
          }
          return memberName;
        } else {
          thread.throwNewException('Ljava/lang/NoSuchMethodError;', `Invalid method ${name + (<JVMTypes.java_lang_invoke_MethodType> type).toString()} in class ${clazz.getExternalName()}.`);
        }
        break;
      case MemberNameConstants.IS_FIELD:
        var fieldTarget = clazz.fieldLookup(name);
        if (fieldTarget !== null) {
          flags |= fieldTarget.accessFlags.getRawByte();
          memberName['java/lang/invoke/MemberName/flags'] = flags;
          memberName.vmindex = clazz.getVMIndexForField(fieldTarget);
          return memberName;
        } else {
          thread.throwNewException('Ljava/lang/NoSuchFieldError;', `Invalid method ${name} in class ${clazz.getExternalName()}.`);
        }
        break;
      default:
        thread.throwNewException('Ljava/lang/LinkageError;', 'resolve member name');
        break;
    }
  }

  /**
   * Follows the same logic as sun.misc.Unsafe's objectFieldOffset.
   */
  public static 'objectFieldOffset(Ljava/lang/invoke/MemberName;)J'(thread: threading.JVMThread, memberName: JVMTypes.java_lang_invoke_MemberName): gLong {
    if (memberName['vmindex'] === -1) {
      thread.throwNewException("Ljava/lang/IllegalStateException;", "Attempted to retrieve the object offset for an unresolved or non-object MemberName.");
    } else {
      return gLong.fromNumber(memberName.vmindex);
    }
  }

  /**
   * Get the members of the given class that match the specified flags, skipping
   * the specified number of members. For each non-skipped matching member,
   * fill in the fields of a MemberName objects in the results array.
   * If there are more matches than can fit in the array, do *not* overrun
   * the array. Return the total number of matching non-skipped members.
   * TODO: Access checks?
   */
  public static 'getMembers(Ljava/lang/Class;Ljava/lang/String;Ljava/lang/String;ILjava/lang/Class;I[Ljava/lang/invoke/MemberName;)I'(
    thread: threading.JVMThread, defc: JVMTypes.java_lang_Class,
    matchName: JVMTypes.java_lang_String, matchSig: JVMTypes.java_lang_String,
    matchFlags: number, caller: JVMTypes.java_lang_Class, skip: number,
    results: JVMTypes.JVMArray<JVMTypes.java_lang_invoke_MemberName>
  ): number {
    // General search flags.
    var searchSuperclasses = 0 !== (matchFlags & MemberNameConstants.SEARCH_SUPERCLASSES),
      searchInterfaces = 0 !== (matchFlags & MemberNameConstants.SEARCH_INTERFACES),
      matched = 0, targetClass = defc.$cls, methods: methods.Method[],
      fields: methods.Field[], matchArray = results.array,
      name: string = matchName !== null ? matchName.toString() : null,
      sig: string = matchSig !== null ? matchSig.toString() : null;

    /**
     * Helper function: Adds matched items to the array once we've skipped
     * enough.
     */
    function addMatch(item: methods.AbstractMethodField) {
      if (skip >= 0) {
        if (matched < matchArray.length) {
          initializeMemberName(thread, matchArray[matched], item);
        }
        matched++;
      } else {
        skip--;
      }
    }

    // TODO: Support these flags.
    assert(!searchSuperclasses && !searchInterfaces, "Unsupported: Non-local getMembers calls.");

    // Constructors
    if (0 !== (matchFlags & MemberNameConstants.IS_CONSTRUCTOR) && (name === null || name === "<init>")) {
      methods = targetClass.getMethods();
      methods.forEach((m: methods.Method) => {
        if (m.name === "<init>" && (sig === null || sig === m.rawDescriptor)) {
          addMatch(m);
        }
      });
    }

    // Methods
    if (0 !== (matchFlags & MemberNameConstants.IS_METHOD)) {
      methods = targetClass.getMethods();
      methods.forEach((m: methods.Method) => {
        if (m.name !== "<init>" && (name === null || name === m.name) && (sig === null || sig === m.rawDescriptor)) {
          addMatch(m);
        }
      });
    }

    // Fields
    if (0 !== (matchFlags & MemberNameConstants.IS_FIELD) && sig === null) {
      fields = targetClass.getFields();
      fields.forEach((f: methods.Field) => {
        if (name === null || name === f.name) {
          addMatch(f);
        }
      });
    }

    // TODO: Inner types (IS_TYPE).
    assert(0 == (matchFlags & MemberNameConstants.IS_TYPE), "Unsupported: Getting inner type MemberNames.");
    return matched;
  }

  /**
   * Debug native in the JDK: Gets a named constant from MethodHandleNatives.Constants.
   */
  public static 'getNamedCon(I[Ljava/lang/Object;)I'(thread: threading.JVMThread, fieldNum: number, args: JVMTypes.JVMArray<JVMTypes.java_lang_Object>): void {
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    thread.getBsCl().initializeClass(thread, "Ljava/lang/invoke/MethodHandleNatives$Constants;", (constantsCls: ClassData.ReferenceClassData<JVMTypes.java_lang_invoke_MethodHandleNatives$Constants>) => {
      if (constantsCls === null) {
        return;
      }
      var constants = constantsCls.getFields().filter((field: methods.Field) => field.accessFlags.isStatic() && field.accessFlags.isFinal());
      if (fieldNum < constants.length) {
        var field = constants[fieldNum];
        args.array[0] = util.initString(thread.getBsCl(), field.name);
        thread.asyncReturn((<any> constantsCls.getConstructor(thread))[field.fullName]);
      } else {
        thread.asyncReturn(-1);
      }
    });
  }

  public static 'getMemberVMInfo(Ljava/lang/invoke/MemberName;)Ljava/lang/Object;'(thread: threading.JVMThread, mname: JVMTypes.java_lang_invoke_MemberName): JVMTypes.java_lang_Object {
    var rv = util.newArray(thread, thread.getBsCl(), '[Ljava/lang/Object;', 2),
      flags = mname['java/lang/invoke/MemberName/flags'],
      refKind = flags >>> MemberNameConstants.REFERENCE_KIND_SHIFT,
      longCls = (<ClassData.PrimitiveClassData> thread.getBsCl().getInitializedClass(thread, 'J'));

    // VMIndex of the target.
    rv.array[0] = longCls.createWrapperObject(thread, gLong.fromNumber(mname.vmindex));
    // Class if field, membername if method
    rv.array[1] = (((flags & MemberNameConstants.ALL_KINDS) & MemberNameConstants.IS_FIELD) > 0) ? mname['java/lang/invoke/MemberName/clazz'] : mname;
    return rv;
  }

  public static 'setCallSiteTargetNormal(Ljava/lang/invoke/CallSite;Ljava/lang/invoke/MethodHandle;)V'(thread: threading.JVMThread, callSite: JVMTypes.java_lang_invoke_CallSite, methodHandle: JVMTypes.java_lang_invoke_MethodHandle): void {
    callSite['java/lang/invoke/CallSite/target'] = methodHandle;
  }
}

class java_lang_invoke_MethodHandle {
  /**
   * Invokes the method handle, allowing any caller type descriptor, but requiring an exact type match.
   *
   * If this native method is invoked directly via java.lang.reflect.Method.invoke,
   * via JNI, or indirectly via java.lang.invoke.MethodHandles.Lookup.unreflect,
   * it will throw an UnsupportedOperationException.
   *
   * @throws WrongMethodTypeException if the target's type is not identical with the caller's symbolic type descriptor
   * @throws Throwable anything thrown by the underlying method propagates unchanged through the method handle call
   */
  public static 'invokeExact([Ljava/lang/Object;)Ljava/lang/Object;'(thread: threading.JVMThread, mh: JVMTypes.java_lang_invoke_MethodHandle, args: JVMTypes.JVMArray<JVMTypes.java_lang_Object>): void {
    // Like other JVMs, we bake the semantics of invoke/invokeExact directly
    // into the bytecode. Thus, this version of the method will *only* be
    // invoked via reflection, causing this exception.
    thread.throwNewException("Ljava/lang/UnsupportedOperationException;", "MethodHandle.invokeExact cannot be invoked reflectively");
  }

  public static 'invoke([Ljava/lang/Object;)Ljava/lang/Object;'(thread: threading.JVMThread, mh: JVMTypes.java_lang_invoke_MethodHandle, args: JVMTypes.JVMArray<JVMTypes.java_lang_Object>): void {
    // Like other JVMs, we bake the semantics of invoke/invokeExact directly
    // into the bytecode. Thus, this version of the method will *only* be
    // invoked via reflection, causing this exception.
    thread.throwNewException("Ljava/lang/UnsupportedOperationException;", "MethodHandle.invoke cannot be invoked reflectively");
  }

  /**
   * Unlike invoke and invokeExact, invokeBasic *can* be invoked reflectively,
   * and thus it has an implementation here. Note that invokeBasic is private,
   * and thus can only be invoked by trusted OpenJDK code.
   *
   * When invoked reflectively, arguments to invokeBasic will be boxed.
   *
   * The return value is *never* boxed. Yes, this is weird. It's only called by
   * trusted code, though.
   */
  public static 'invokeBasic([Ljava/lang/Object;)Ljava/lang/Object;'(thread: threading.JVMThread, mh: JVMTypes.java_lang_invoke_MethodHandle, argsBoxed: JVMTypes.JVMArray<JVMTypes.java_lang_Object>): void {
    var lmbdaForm = mh['java/lang/invoke/MethodHandle/form'],
      mn = lmbdaForm['java/lang/invoke/LambdaForm/vmentry'],
      descriptor: string, paramTypes: string[];

    assert(mh.getClass().isCastable(thread.getBsCl().getInitializedClass(thread, 'Ljava/lang/invoke/MethodHandle;')), "First argument to invokeBasic must be a method handle.");
    assert(mn.vmtarget !== null && mn.vmtarget !== undefined, "vmtarget must be defined");

    assert(mn['java/lang/invoke/MemberName/type'].getClass().getInternalName() === 'Ljava/lang/invoke/MethodType;', "Expected a MethodType object.");
    descriptor = (<JVMTypes.java_lang_invoke_MethodType> mn['java/lang/invoke/MemberName/type']).toString();
    paramTypes = util.getTypes(descriptor);
    // Remove return value.
    paramTypes.pop();
    // Remove method handle; it's not boxed.
    paramTypes.shift();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    // Need to include methodhandle in the arguments to vmtarget, which handles
    // invoking it appropriately.
    mn.vmtarget(thread, descriptor, [mh].concat(util.unboxArguments(thread, paramTypes, argsBoxed.array)), (e: JVMTypes.java_lang_Throwable, rv: any) => {
      if (e) {
        thread.throwException(e);
      } else {
        thread.asyncReturn(rv);
      }
    });
  }
}

registerNatives({
  'java/lang/Class': java_lang_Class,
  'java/lang/ClassLoader$NativeLibrary': java_lang_ClassLoader$NativeLibrary,
  'java/lang/ClassLoader': java_lang_ClassLoader,
  'java/lang/Compiler': java_lang_Compiler,
  'java/lang/Double': java_lang_Double,
  'java/lang/Float': java_lang_Float,
  'java/lang/Object': java_lang_Object,
  'java/lang/Package': java_lang_Package,
  'java/lang/ProcessEnvironment': java_lang_ProcessEnvironment,
  'java/lang/reflect/Array': java_lang_reflect_Array,
  'java/lang/reflect/Proxy': java_lang_reflect_Proxy,
  'java/lang/Runtime': java_lang_Runtime,
  'java/lang/SecurityManager': java_lang_SecurityManager,
  'java/lang/Shutdown': java_lang_Shutdown,
  'java/lang/StrictMath': java_lang_StrictMath,
  'java/lang/String': java_lang_String,
  'java/lang/System': java_lang_System,
  'java/lang/Thread': java_lang_Thread,
  'java/lang/Throwable': java_lang_Throwable,
  'java/lang/UNIXProcess': java_lang_UNIXProcess,
  'java/lang/invoke/MethodHandleNatives': java_lang_invoke_MethodHandleNatives,
  'java/lang/invoke/MethodHandle': java_lang_invoke_MethodHandle
});

//@ sourceURL=natives/java_lang.js
