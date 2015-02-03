"use strict";
import util = require('./util');
import ByteStream = require('./ByteStream');
import ConstantPool = require('./ConstantPool');
import attributes = require('./attributes');
import java_object = require('./java_object');
import threading = require('./threading');
import logging = require('./logging');
import methods = require('./methods');
import ClassLoader = require('./ClassLoader');
import enums = require('./enums');
import ClassLock = require('./ClassLock');
import assert = require('./assert');
import gLong = require('./gLong');
var JavaObject = java_object.JavaObject;
var JavaClassObject = java_object.JavaClassObject;
var ClassState = enums.ClassState;
var trace = logging.trace;
var debug = logging.debug;

/**
 * Extends a JVM class by making its prototype a blank instantiation of an
 * object with the super class's prototype as its prototype. Inspired from
 * TypeScript's __extend function.
 */
function extendClass(cls, superCls) {
  // for (var p in superCls) if (superCls.hasOwnProperty(p)) cls[p] = superCls[p];
  function __() { this.constructor = cls; }
  __.prototype = superCls.prototype;
  cls.prototype = new __();
}

/**
 * Represents a single class in the JVM.
 */
export class ClassData {
  /**
   * Stores the JavaScript constructor for this JVM class.
   */
  private _constructor: Function = null;
  protected loader: ClassLoader.ClassLoader;
  public accessFlags: util.Flags = null;
  /**
   * We make this private to *enforce* call sites to use our getter functions.
   * The actual state of this class depends on the state of its parents, and
   * parents do not inform their children when they change state.
   */
  private state: enums.ClassState = enums.ClassState.LOADED;
  private jco: java_object.JavaClassObject = null;
  /**
   * The class's canonical name, in internal form.
   * Ljava/lang/Foo;
   */
  protected className: string;
  protected superClass: ReferenceClassData = null;

  /**
   * Responsible for setting up all of the fields that are guaranteed to be
   * present on any ClassData object.
   */
  constructor(loader: ClassLoader.ClassLoader) {
    this.loader = loader;
  }

  /**
   * Get the external form of this class's name (e.g. java.lang.String).
   */
  public getExternalName(): string {
    return util.ext_classname(this.className);
  }

  /**
   * Get the internal form of this class's name (e.g. Ljava/lang/String;).
   */
  public getInternalName(): string {
    return this.className;
  }

  /**
   * Returns the ClassLoader object of the classloader that initialized this
   * class. Returns null for the default classloader.
   */
  public getLoader(): ClassLoader.ClassLoader {
    return this.loader;
  }

  /**
   * Get the class's super class, which is always going to be a reference
   * class.
   */
  public getSuperClass(): ReferenceClassData {
    return this.superClass;
  }

  /**
   * Get all of the interfaces that the class implements.
   */
  public getInterfaces(): ReferenceClassData[] {
    return [];
  }

  /**
   * Get a java.lang.Class object corresponding to this class.
   */
  public getClassObject(thread: threading.JVMThread): java_object.JavaClassObject {
    if (this.jco === null) {
      this.jco = new JavaClassObject(thread, this);
    }
    return this.jco;
  }

  /**
   * Retrieves the method defined in this particular class by the given method
   * signature *without* invoking method lookup.
   * @param methodSignature The method's full signature, e.g. <clinit>()V
   */
  public getMethod(methodSignature: string): methods.Method {
    return null;
  }

  /**
   * Retrieve all of the methods defined on this class.
   */
  public getMethods(): methods.Method[] {
    return [];
  }

  /**
   * Retrieve the set of fields defined on this class.
   */
  public getFields(): methods.Field[] {
    return [];
  }

  public methodLookup(thread: threading.JVMThread, sig: string): methods.Method {
    thread.throwNewException('Ljava/lang/NoSuchMethodError;', `No such method found in ${this.getExternalName()}::${sig}`);
    return null;
  }

  public fieldLookup(thread: threading.JVMThread, name: string): methods.Field {
    thread.throwNewException('Ljava/lang/NoSuchFieldError;', `No such field found in ${this.getExternalName()}::${name}`);
    return null;
  }

  /**
   * Attempt to synchronously resolve this class using its loader. Should only
   * be called on ClassData in the LOADED state.
   */
  public tryToResolve(): boolean {
    throw new Error("Abstract method.");
  }

  /**
   * Attempt to synchronously initialize this class.
   */
  public tryToInitialize(): boolean {
    throw new Error("Abstract method.");
  }

  /**
   * Set the state of this particular class to LOADED/RESOLVED/INITIALIZED.
   */
  public setState(state: enums.ClassState): void {
    this.state = state;
  }

  /**
   * Gets the current state of this class.
   */
  protected getState(): enums.ClassState {
    if (this.state === ClassState.RESOLVED && this.getMethod('<clinit>()V') === null) {
      // We can promote to INITIALIZED if this class has no static initialization
      // logic, and its parent class is initialized.
      var scls = this.getSuperClass();
      if (scls !== null && scls.getState() === ClassState.INITIALIZED) {
        this.state = ClassState.INITIALIZED;
      }
    }
    return this.state;
  }

  /**
   * Check if the class is initialized.
   * @param thread The thread that is performing the check. If initialization
   *   is in progress on that thread, then the class is, for all intents and
   *   purposes, initialized.
   */
  public isInitialized(thread: threading.JVMThread): boolean {
    return this.getState() === ClassState.INITIALIZED;
  }
  // Convenience function.
  public isResolved(): boolean { return this.getState() !== ClassState.LOADED; }

  public isSubinterface(target: ClassData): boolean {
    return false;
  }

  public isSubclass(target: ClassData): boolean {
    if (this === target) {
      return true;
    }
    if (this.getSuperClass() === null) {
      return false;
    }
    return this.getSuperClass().isSubclass(target);
  }

  public isCastable(target: ClassData): boolean {
    throw new Error("Unimplemented.");
  }

  public resolve(thread: threading.JVMThread, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    throw new Error("Unimplemented.");
  }

  public initialize(thread: threading.JVMThread, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    throw new Error("Unimplemented.");
  }

  public getFieldFromSlot(slot: number): methods.Field {
    return null;
  }

  public getMethodFromSlot(slot: number): methods.Method {
    return null;
  }

  /**
   * Constructs a JavaScript constructor for this particular class. Called
   * *once* lazily during first object construction.
   */
  protected _constructConstructor(): Function {
    throw new Error("Unimplemented abstract method.");
  }

  /**
   * Get the JavaScript constructor for this class. Can only be called if
   * class is resolved.
   */
  public getConstructor(): Function {
    assert(this.state === enums.ClassState.RESOLVED || this.state === enums.ClassState.INITIALIZED, "Class must be initialized or resolved before its JS constructor can be retrieved...");
    if (this._constructor === null) {
      this._constructor = this._constructConstructor();
    }
    return this._constructor;
  }
}

export class PrimitiveClassData extends ClassData {
  constructor(className: string, loader: ClassLoader.ClassLoader) {
    super(loader);
    this.className = className;
    // PrimitiveClassData objects are ABSTRACT, FINAL, and PUBLIC.
    this.accessFlags = new util.Flags(0x411);
    this.setState(ClassState.INITIALIZED);
  }

  /**
   * Returns a boolean indicating if this class is an instance of the target class.
   * "target" is a ClassData object.
   * The ClassData objects do not need to be initialized; just loaded.
   */
  public isCastable(target: ClassData): boolean {
    return this.className === target.getInternalName();
  }

  /**
   * Returns the internal class name for the corresponding boxed type.
   */
  public boxClassName(): string {
    switch (this.className) {
      case 'B':
        return 'Ljava/lang/Byte;';
      case 'C':
        return 'Ljava/lang/Character;';
      case 'D':
        return 'Ljava/lang/Double;';
      case 'F':
        return 'Ljava/lang/Float;';
      case 'I':
        return 'Ljava/lang/Integer;';
      case 'J':
        return 'Ljava/lang/Long;';
      case 'S':
        return 'Ljava/lang/Short;';
      case 'Z':
        return 'Ljava/lang/Boolean;';
      case 'V':
        return 'Ljava/lang/Void;';
      default:
        throw new Error(`Tried to box a non-primitive class: ${this.className}`);
    }
  }

  /**
   * Returns a boxed version of the given primitive.
   */
  public createWrapperObject(thread: threading.JVMThread, value: any): java_object.JavaObject {
    var boxName = this.boxClassName();
    var boxCls = <ReferenceClassData> thread.getBsCl().getInitializedClass(thread, boxName);
    // these are all initialized in preinit (for the BSCL, at least)
    var wrapped = new JavaObject(boxCls);
    if (boxName !== 'V') {
      // XXX: all primitive wrappers store their value in a private static final field named 'value'
      wrapped.fields[boxName + 'value'] = value;
    }
    return wrapped;
  }

  public tryToResolve(): boolean {
    return true;
  }

  public tryToInitialize(): boolean {
    return true;
  }

  /**
   * Primitive classes are already resolved.
   */
  public resolve(thread: threading.JVMThread, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    setImmediate(() => cb(this));
  }

  protected _constructConstructor(): Function {
    // Irrelevant. NOP.
    return null;
  }
}

export class ArrayClassData extends ClassData {
  private componentClassName: string;
  private componentClass: ClassData;

  constructor(component_type: string, loader: ClassLoader.ClassLoader) {
    super(loader);
    this.className = `[${component_type}`;
    // ArrayClassData objects are ABSTRACT, FINAL, and PUBLIC.
    this.accessFlags = new util.Flags(0x411);
    this.componentClassName = component_type;
  }

  public getFieldFromSlot(slot: number): methods.Field {
    return this.superClass.getFieldFromSlot(slot);
  }

  public getMethodFromSlot(slot: number): methods.Method {
    return this.superClass.getMethodFromSlot(slot);
  }

  /**
   * Resolve the class.
   */
  public resolve(thread: threading.JVMThread, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    if (this.isResolved()) {
      // Short circuit.
      setImmediate(() => cb(this));
      return;
    }
    util.asyncForEach(["Ljava/lang/Object;", this.componentClassName], (cls: string, nextItem: (err?: any) => void) => {
      this.loader.resolveClass(thread, cls, (cdata: ClassData) => {
        if (cdata !== null) {
          nextItem();
        } else {
          nextItem("Failed.");
        }
      });
    }, (err?: any) => {
      if (!err) {
        this.setResolved(<ReferenceClassData> this.loader.getResolvedClass("Ljava/lang/Object;"), this.loader.getResolvedClass(this.componentClassName));
        cb(this);
      } else {
        cb(null);
      }
    });
  }

  /**
   * XXX: Avoid a circular reference in constantpool, for now.
   */
  public create(obj: any[]): java_object.JavaArray {
    return new java_object.JavaArray(this, obj);
  }

  public getComponentClass(): ClassData {
    return this.componentClass;
  }

  /**
   * This class itself has no fields/methods, but java/lang/Object does.
   */
  public fieldLookup(thread: threading.JVMThread, name: string): methods.Field {
    return this.superClass.fieldLookup(thread, name);
  }

  public methodLookup(thread: threading.JVMThread, sig: string): methods.Method {
    return this.superClass.methodLookup(thread, sig);
  }

  /**
   * Resolved and initialized are the same for array types.
   */
  public setResolved(super_class_cdata: ReferenceClassData, component_class_cdata: ClassData): void {
    this.superClass = super_class_cdata;
    this.componentClass = component_class_cdata;
    this.setState(ClassState.INITIALIZED);
  }

  public tryToResolve(): boolean {
    var loader = this.loader,
      superClassCdata = <ReferenceClassData> loader.getResolvedClass("Ljava/lang/Object;"),
      componentClassCdata = loader.getResolvedClass(this.componentClassName);

    if (superClassCdata === null || componentClassCdata === null) {
      return false;
    } else {
      this.setResolved(superClassCdata, componentClassCdata);
      return true;
    }
  }

  public tryToInitialize(): boolean {
    // Arrays are initialized once resolved.
    return this.tryToResolve();
  }

  /**
   * Returns a boolean indicating if this class is an instance of the target class.
   * "target" is a ClassData object.
   * The ClassData objects do not need to be initialized; just loaded.
   * See §2.6.7 for casting rules.
   */
  public isCastable(target: ClassData): boolean {
    if (!(target instanceof ArrayClassData)) {
      if (target instanceof PrimitiveClassData) {
        return false;
      }
      // Must be a reference type.
      if (target.accessFlags.isInterface()) {
        // Interface reference type
        var type = target.getInternalName();
        return type === 'Ljava/lang/Cloneable;' || type === 'Ljava/io/Serializable;';
      }
      // Non-interface reference type
      return target.getInternalName() === 'Ljava/lang/Object;';
    }
    // We are both array types, so it only matters if my component type can be
    // cast to its component type.
    return this.getComponentClass().isCastable((<ArrayClassData> target).getComponentClass());
  }

  public initialize(thread: threading.JVMThread, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    this.resolve(thread, cb, explicit);
  }

  protected _constructConstructor(): Function {
    var jsClassName = util.jvmName2JSName(this.getInternalName()),
      template = `function _create(extendClass, cls) {
  extendClass(${jsClassName}, cls.superClass.getConstructor());
  function ${jsClassName}(jvm, length) {
    this.ref = jvm.getNextRef();
    this.array = new Array(length);
  }

  // Static values.
  ${jsClassName}.cls = cls;

  return ${jsClassName};
}
// Last statement is return value of eval.
_create`;
    // All arrays extend java/lang/Object
    var p = eval(template)(extendClass, this);
    return p;
  }
}

/**
 * Represents a "reference" Class -- that is, a class that neither represents a
 * primitive nor an array.
 */
export class ReferenceClassData extends ClassData {
  private minorVersion: number;
  public majorVersion: number;
  public constantPool: ConstantPool.ConstantPool;
  private defaultFields: { [name: string]: any };
  private fields: methods.Field[];
  /**
   * Maps a field's full name, including owning class, to its field object.
   * Lazily populated.
   */
  private fieldLookupCache: { [name: string]: methods.Field };
  private methods: methods.Method[];
  /**
   * Maps a method's full name to its method object. Contains methods declared
   * in other classes.
   * Lazily populated. Does not contain overridden methods. Used for virtual
   * dispatch.
   */
  private methodLookupCache: { [name: string]: methods.Method };
  private attrs: attributes.IAttribute[];
  public staticFields: { [name: string]: any };
  private interfaceClasses: ReferenceClassData[] = null;
  private superClassRef: ConstantPool.ClassReference = null;
  private interfaceRefs: ConstantPool.ClassReference[];
  /**
   * Base number for slot lookups for methods. Equal to the total number of
   * methods in parent classes.
   *
   * Initialized once the class is resolved.
   */
  private slotMethodBase: number = -1;
  /**
   * Base number of slot lookups for fields. Equal to the total number of
   * fields in parent classes.
   *
   * Initialized once the class is resolved.
   */
  private slotFieldBase: number = -1;
  /**
   * Initialization lock.
   */
  private initLock: ClassLock = new ClassLock();

  constructor(buffer: NodeBuffer, loader?: ClassLoader.ClassLoader, cpPatches?: java_object.JavaArray) {
    super(loader);
    var byteStream = new ByteStream(buffer),
      i: number = 0;
    if ((byteStream.getUint32()) !== 0xCAFEBABE) {
      throw new Error("Magic number invalid");
    }
    this.minorVersion = byteStream.getUint16();
    this.majorVersion = byteStream.getUint16();
    if (!(45 <= this.majorVersion && this.majorVersion <= 52)) {
      throw new Error("Major version invalid");
    }
    this.constantPool = new ConstantPool.ConstantPool();
    this.constantPool.parse(byteStream, cpPatches);
    // bitmask for {public,final,super,interface,abstract} class modifier
    this.accessFlags = new util.Flags(byteStream.getUint16());

    this.className = (<ConstantPool.ClassReference> this.constantPool.get(byteStream.getUint16())).name;
    // super reference is 0 when there's no super (basically just java.lang.Object)
    var superRef = byteStream.getUint16();
    if (superRef !== 0) {
      this.superClassRef = (<ConstantPool.ClassReference> this.constantPool.get(superRef));
    }
    // direct interfaces of this class
    var isize = byteStream.getUint16();
    this.interfaceRefs = new Array<ConstantPool.ClassReference>(isize);
    for (i = 0; i < isize; ++i) {
      this.interfaceRefs[i] = <ConstantPool.ClassReference> this.constantPool.get(byteStream.getUint16());
    }
    // fields of this class
    var numFields = byteStream.getUint16();
    this.fields = new Array<methods.Field>(numFields);
    for (i = 0; i < numFields; ++i) {
      this.fields[i] = new methods.Field(this);
    }
    this.fieldLookupCache = {};
    for (i = 0; i < this.fields.length; ++i) {
      var f = this.fields[i];
      f.parse(byteStream, this.constantPool);
      this.fieldLookupCache[f.name] = f;
    }
    // class methods
    var numMethods = byteStream.getUint16();
    this.methods = new Array<methods.Method>(numMethods);
    this.methodLookupCache = {};
    for (i = 0; i < numMethods; i++) {
      var m = new methods.Method(this);
      m.parse(byteStream, this.constantPool);
      var mkey = m.name + m.raw_descriptor;
      this.methodLookupCache[mkey] = m;
      this.methods[i] = m;
    }
    // class attributes
    this.attrs = attributes.makeAttributes(byteStream, this.constantPool);
    if (byteStream.hasBytes()) {
      throw `Leftover bytes in classfile: ${byteStream}`;
    }
    // Contains the value of all static fields.
    this.staticFields = Object.create(null);
  }

  /**
   * Retrieve the set of interfaces that this class implements.
   * DO NOT MUTATE!
   */
  public getInterfaces(): ReferenceClassData[] {
    return this.interfaceClasses;
  }

  /**
   * The set of fields that this class has.
   * DO NOT MUTATE!
   */
  public getFields(): methods.Field[] {
    return this.fields;
  }

  /**
   * Retrieve a method with the given signature from this particular class.
   */
  public getMethod(sig: string): methods.Method {
    // Method lookup cache is guaranteed to have this particular method's
    // methods, but it may have methods created by parent classes and such.
    var m = this.methodLookupCache[sig];
    if (m !== undefined && m.cls === this) {
      return m;
    } else {
      return null;
    }
  }

  /**
   * Get the methods belonging to this particular class.
   * DO NOT MUTATE!
   */
  public getMethods(): methods.Method[] {
    return this.methods;
  }

  public getAttribute(name: string): attributes.IAttribute {
    var attrs = this.attrs;
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      if (attr.getName() === name) {
        return attr;
      }
    }
    return null;
  }

  public getAttributes(name: string): attributes.IAttribute[] {
    var attrs = this.attrs;
    var results : attributes.IAttribute[] = [];
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      if (attr.getName() === name) {
        results.push(attr);
      }
    }
    return results;
  }

  /**
   * Get the bootstrap method information for an InvokeDynamic opcode.
   */
  public getBootstrapMethod(idx: number): [ConstantPool.MethodHandle, ConstantPool.IConstantPoolItem[]] {
    var bms = <attributes.BootstrapMethods> this.getAttribute('BootstrapMethods');
    return bms.bootstrapMethods[idx];
  }

  public getDefaultFields(): { [name: string]: any } {
    if (this.defaultFields) {
      return this.defaultFields;
    }
    this.constructDefaultFields();
    return this.defaultFields;
  }

  /**
   * Handles static fields. We lazily create them, since we cannot initialize static
   * default String values before Ljava/lang/String; is initialized.
   */
  private _initializeStaticField(thread: threading.JVMThread, name: string): boolean {
    var f = this.fieldLookupCache[name];
    if (f != null && f.accessFlags.isStatic()) {
      var cva = <attributes.ConstantValue> f.get_attribute('ConstantValue'),
        cv: any = null;
      if (cva != null) {
        switch (cva.value.getType()) {
          case enums.ConstantPoolItemType.STRING:
            var stringCPI = <ConstantPool.ConstString> cva.value;
            if (stringCPI.value === null) {
              stringCPI.value = thread.getThreadPool().getJVM().internString(stringCPI.stringValue);
            }
            cv = stringCPI.value;
            break;
          default:
            // TODO: Type better.
            cv = (<any> cva.value).value;
            break;
        }
      }
      this.staticFields[name] = cv !== null ? cv : util.initialValue(f.raw_descriptor);
      return true;
    } else {
      thread.throwNewException('Ljava/lang/NoSuchFieldError;', name);
      return false;
    }
  }

  public staticGet(thread: threading.JVMThread, name: string): any {
    if (this.staticFields[name] !== void 0) {
      return this.staticFields[name];
    }
    if (this._initializeStaticField(thread, name)) {
      return this.staticGet(thread, name);
    } else {
      return undefined;
    }
  }

  public staticPut(thread: threading.JVMThread, name: string, val: any): boolean {
    if (this.staticFields[name] !== void 0) {
      this.staticFields[name] = val;
      return true;
    } else {
      if (this._initializeStaticField(thread, name)) {
        return this.staticPut(thread, name, val);
      }
    }
    return false;
  }

  protected getSlotMethodBase(): number { return this.slotMethodBase; }
  protected getSlotFieldBase(): number { return this.slotFieldBase; }

  public setResolved(super_class_cdata: ReferenceClassData, interface_cdatas: ReferenceClassData[]): void {
    this.superClass = super_class_cdata;
    if (super_class_cdata !== null) {
      this.slotMethodBase = this.superClass.getSlotMethodBase() + this.superClass.getMethods().length;
      this.slotFieldBase = this.superClass.getSlotFieldBase() + this.superClass.getFields().length;
    } else {
      this.slotMethodBase = 0;
      this.slotFieldBase = 0;
    }
    // Populate method / field slots.
    // TODO: Interface methods and fields???
    this.methods.forEach((m: methods.Method, i: number) => {
      m.slot = this.slotMethodBase + i;
    });
    this.fields.forEach((f: methods.Field, i: number) => {
      f.slot = this.slotFieldBase + i;
    });

    trace(`Class ${this.getInternalName()} is now resolved.`);
    this.interfaceClasses = interface_cdatas;
    // TODO: Assert we are not already resolved or initialized?
    this.setState(ClassState.RESOLVED);
  }

  public getFieldFromSlot(slot: number): methods.Field {
    if (slot >= this.slotFieldBase) {
      var f = this.fields[slot - this.slotFieldBase];
      if (f !== undefined) {
        return f;
      } else {
        return null;
      }
    } else {
      if (this.superClass !== null) {
        return this.superClass.getFieldFromSlot(slot);
      } else {
        return null;
      }
    }
  }

  public getMethodFromSlot(slot: number): methods.Method {
    if (slot >= this.slotMethodBase) {
      var m = this.methods[slot - this.slotMethodBase];
      if (m !== undefined) {
        return m;
      } else {
        return null;
      }
    } else {
      if (this.superClass !== null) {
        return this.superClass.getMethodFromSlot(slot);
      } else {
        return null;
      }
    }
  }

  public tryToResolve(): boolean {
    if (this.getState() === ClassState.LOADED) {
      // Need to grab the super class, and interfaces.
      var loader = this.loader,
        // NOTE: The super_class of java/lang/Object is null.
        superClassCdata = <ReferenceClassData> (this.superClassRef !== null ? this.superClassRef.tryGetClass(loader) : null),
        interfaceCdatas: ReferenceClassData[] = [], i: number;

      if (superClassCdata === null && this.superClassRef !== null) {
        return false;
      }

      for (i = 0; i < this.interfaceRefs.length; i++) {
        var icls = <ReferenceClassData> this.interfaceRefs[i].tryGetClass(loader);
        if (icls === null) {
          return false;
        }
        interfaceCdatas.push(icls);
      }

      // It worked!
      this.setResolved(superClassCdata, interfaceCdatas);
    }
    return true;
  }

  /**
   * Attempt to synchronously initialize. This is possible if there is no
   * static initializer, and the parent classes are properly initialized.
   */
  public tryToInitialize(): boolean {
    if (this.getState() === ClassState.INITIALIZED) {
      // Already initialized.
      return true;
    }

    if (this.getState() === ClassState.RESOLVED || this.tryToResolve()) {
      // Ensure parent is initialized.
      if (this.superClass !== null && !this.superClass.tryToInitialize()) {
        // Parent failed to initialize.
        return false;
      }

      // Check if this class has a static initializer.
      var clinit = this.getMethod('<clinit>()V');
      if (clinit !== null) {
        // Nope; this class needs to do the full initialization song-and-dance.
        return false;
      } else {
        // No static initializer! This class is initialized!
        this.setState(ClassState.INITIALIZED);
        return true;
      }
    }

    // This class is not resolved.
    return false;
  }

  public constructDefaultFields(): void {
    // init fields from this and inherited ClassDatas
    var cls = this;
    // Object.create(null) avoids interference with Object.prototype's properties
    this.defaultFields = Object.create(null);
    while (cls !== null) {
      var fields = cls.fields;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.accessFlags.isStatic()) {
          continue;
        }
        var val = util.initialValue(f.raw_descriptor);
        this.defaultFields[cls.getInternalName() + f.name] = val;
      }
      cls = <ReferenceClassData> cls.getSuperClass();
    }
  }

  /**
   * Spec [5.4.3.2][1].
   * [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#77678
   */
  public fieldLookup(thread: threading.JVMThread, name: string, null_handled?: boolean): methods.Field {
    var field = this.fieldLookupCache[name];
    if (field != null) {
      return field;
    }
    field = this._fieldLookup(thread, name);
    if ((field != null) || null_handled === true) {
      this.fieldLookupCache[name] = field;
      return field;
    }
    thread.throwNewException('Ljava/lang/NoSuchFieldError;', `No such field found in ${this.getExternalName()}::${name}`);
  }

  private _fieldLookup(thread: threading.JVMThread, name: string): methods.Field {
    var i: number = 0, field: methods.Field;
    for (i = 0; i < this.fields.length; i++) {
      field = this.fields[i];
      if (field.name === name) {
        return field;
      }
    }
    // These may not be initialized! But we have them loaded.
    var ifaces = this.getInterfaces();
    for (i = 0; i < ifaces.length; i++) {
      field = ifaces[i].fieldLookup(thread, name, true);
      if (field != null) {
        return field;
      }
    }
    var sc = <ReferenceClassData> this.getSuperClass();
    if (sc != null) {
      field = sc.fieldLookup(thread, name, true);
      if (field != null) {
        return field;
      }
    }
    return null;
  }

  /**
   * Spec [5.4.3.3][1], [5.4.3.4][2].
   * [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#79473
   * [2]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#78621
   */
  public methodLookup(thread: threading.JVMThread, sig: string): methods.Method {
    if (this.methodLookupCache[sig] != null) {
      return this.methodLookupCache[sig];
    }
    var method = this._methodLookup(sig);
    if (method == null) {
      thread.throwNewException('Ljava/lang/NoSuchMethodError;', `No such method found in ${this.getExternalName()}::${sig}`);
      return null;
    } else {
      return method;
    }
  }

  private _methodLookup(sig: string): methods.Method {
    if (sig in this.methodLookupCache) {
      return this.methodLookupCache[sig];
    }
    var parent = <ReferenceClassData> this.getSuperClass();
    if (parent != null) {
      this.methodLookupCache[sig] = parent._methodLookup(sig);
      if (this.methodLookupCache[sig] != null) {
        return this.methodLookupCache[sig];
      }
    }
    var ifaces = this.getInterfaces();
    for (var i = 0; i < ifaces.length; i++) {
      var ifc = ifaces[i];
      this.methodLookupCache[sig] = ifc._methodLookup(sig);
      if (this.methodLookupCache[sig] != null) {
        return this.methodLookupCache[sig];
      }
    }

    if (this.className === 'Ljava/lang/invoke/MethodHandle;') {
      // Check if this is a signature polymorphic method.
      // From S2.9:
      // A method is signature polymorphic if and only if all of the following conditions hold :
      // * It is declared in the java.lang.invoke.MethodHandle class.
      // * It has a single formal parameter of type Object[].
      // * It has a return type of Object.
      // * It has the ACC_VARARGS and ACC_NATIVE flags set.
      var polySig = `${sig.slice(0, sig.indexOf('('))}([Ljava/lang/Object;)Ljava/lang/Object;`,
        m = this.methodLookupCache[polySig];
      if (m != null && m.accessFlags.isNative() && m.accessFlags.isVarArgs() && m.cls === this) {
        return this.methodLookupCache[sig] = m;
      }
    }
    return this.methodLookupCache[sig] = null;
  }

  /**
   * Returns a boolean indicating if this class is an instance of the target class.
   * "target" is a ClassData object.
   * The ClassData objects do not need to be initialized; just loaded.
   * See §2.6.7 for casting rules.
   */
  public isCastable(target: ClassData): boolean {
    if (!(target instanceof ReferenceClassData)) {
      return false;
    }
    if (this.accessFlags.isInterface()) {
      // We are both interfaces
      if (target.accessFlags.isInterface()) {
        return this.isSubinterface(target);
      }
      // Only I am an interface
      if (!target.accessFlags.isInterface()) {
        return target.getInternalName() === 'Ljava/lang/Object;';
      }
    } else {
      // I am a regular class, target is an interface
      if (target.accessFlags.isInterface()) {
        return this.isSubinterface(target);
      }
      // We are both regular classes
      return this.isSubclass(target);
    }
  }

  /**
   * Returns 'true' if I implement the target interface.
   */
  public isSubinterface(target: ClassData): boolean {
    if (this.className === target.getInternalName()) {
      return true;
    }
    var ifaces = this.getInterfaces();
    for (var i = 0; i < ifaces.length; i++) {
      var superIface = ifaces[i];
      if (superIface.isSubinterface(target)) {
        return true;
      }
    }
    if (this.getSuperClass() == null) {
      return false;
    }
    return this.getSuperClass().isSubinterface(target);
  }

  /**
   * Asynchronously *initializes* the class and its super classes.
   * Throws a Java exception on the thread if initialization fails.
   * @param thread The thread that is performing the initialization.
   * @param cb Callback to invoke when completed. Contains a reference to the
   *   class if it succeeds, or NULL if a failure occurs.
   * @param [explicit] Defaults to true. If true, this class is being
   *   *explicitly* initialized by a user. If false, the JVM is implicitly
   *   initializing the class.
   */
  public initialize(thread: threading.JVMThread, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    if (this.isResolved()) {
      if (this.isInitialized(thread)) {
        // Nothing to do! Either resolution failed and an exception has already
        // been thrown, cdata is already initialized, or the current thread is
        // initializing the class.
        setImmediate(() => {
          cb(this);
        });
      } else if (this.initLock.tryLock(thread, cb)) {
        // Initialize the super class, and then this class.
        if (this.superClass != null) {
          this.superClass.initialize(thread, (cdata: ClassData) => {
            if (cdata == null) {
              // Nothing to do. Initializing the super class failed.
              this.initLock.unlock(null);
            } else {
              // Initialize myself.
              this._initialize(thread, (cdata: ClassData) => {
                this.initLock.unlock(cdata);
              });
            }
          }, explicit);
        } else {
          // java/lang/Object's parent is NULL.
          // Continue initializing this class.
          this._initialize(thread, (cdata: ClassData) => {
            this.initLock.unlock(cdata);
          });
        }
      }
    } else {
      // Resolve first, then initialize.
      this.resolve(thread, (cdata: ClassData) => {
        if (cdata !== null) {
          this.initialize(thread, cb, explicit);
        } else {
          // Else: An exception was thrown.
          cb(cdata);
        }
      }, explicit);
    }
  }

  /**
   * Helper function. Initializes this class alone. Assumes super class is
   * already initialized.
   */
  private _initialize(thread: threading.JVMThread, cb: (cdata: ClassData) => void): void {
    var clinit = this.getMethod('<clinit>()V');
    // We'll reset it if it fails.
    if (clinit != null) {
      debug(`T${thread.ref} Running static initialization for class ${this.className}...`);
      thread.runMethod(clinit, [], (e?: java_object.JavaObject, rv?: any) => {
        if (e) {
          debug(`Initialization of class ${this.className} failed.`);
          this.setState(enums.ClassState.RESOLVED);
          /**
           * "The class or interface initialization method must have completed
           *  abruptly by throwing some exception E. If the class of E is not
           *  Error or one of its subclasses, then create a new instance of the
           *  class ExceptionInInitializerError with E as the argument, and use
           *  this object in place of E."
           * @url http://docs.oracle.com/javase/specs/jvms/se7/html/jvms-5.html#jvms-5.5
           */
          if (e.cls.isCastable(thread.getBsCl().getResolvedClass('Ljava/lang/Error;'))) {
            // 'e' is 'Error or one of its subclasses'.
            thread.throwException(e);
            cb(null);
          } else {
            // Wrap the error.
            thread.getBsCl().initializeClass(thread, 'Ljava/lang/ExceptionInInitializerError;', (cdata: ReferenceClassData) => {
              if (cdata == null) {
                // Exceptional failure right here: *We failed to construct ExceptionInInitializerError*!
                // initializeClass will throw an exception on our behalf;
                // nothing to do.
                cb(null);
              } else {
                // Construct the object!
                var e2 = new java_object.JavaObject(cdata),
                  cnstrctr = cdata.getMethod('<init>(Ljava/lang/Throwable;)V');
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
          this.setState(enums.ClassState.INITIALIZED);
          debug(`Initialization of class ${this.className} succeeded.`);
          // Normal case! Initialization succeeded.
          cb(this);
        }
      });
    } else {
      // Class doesn't have a static initializer.
      this.setState(enums.ClassState.INITIALIZED);
      cb(this);
    }
  }

  /**
   * A reference class can be treated as initialized in a thread if that thread
   * is in the process of initializing it.
   */
  public isInitialized(thread: threading.JVMThread): boolean {
    return this.getState() === ClassState.INITIALIZED || this.initLock.getOwner() === thread;
  }

  /**
   * Resolve the class.
   */
  public resolve(thread: threading.JVMThread, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    var toResolve: ConstantPool.ClassReference[] = this.interfaceRefs.slice(0),
      interfaceClasses: ReferenceClassData[] = [], superClass: ReferenceClassData = null;
    if (this.superClassRef !== null) {
      toResolve.push(this.superClassRef);
    }
    util.asyncForEach(toResolve, (clsRef: ConstantPool.ClassReference, nextItem: (err?: any) => void) => {
      clsRef.getClass(thread, this.loader, (cdata: ClassData) => {
        if (cdata === null) {
          nextItem("Failed.");
        } else {
          if (interfaceClasses.length < this.interfaceRefs.length) {
            interfaceClasses.push(<ReferenceClassData> cdata);
          } else {
            superClass = <ReferenceClassData> cdata;
          }
          nextItem();
        }
      }, explicit);
    }, (err?: any) => {
      if (!err) {
        this.setResolved(superClass, interfaceClasses);
        cb(this);
      } else {
        cb(null);
      }
    });
  }

  protected _constructConstructor(): Function {
    var jsClassName = util.jvmName2JSName(this.getInternalName());

    function getDefaultFieldValue(desc: string): string {
      if (desc === 'J') return 'gLongZero';
      var c = desc[0];
      if (c === '[' || c === 'L') return 'null';
      return '0';
    }

    function getFieldAssignments(cls: ReferenceClassData): string {
      var superClass = cls.getSuperClass(),
        prefix = superClass !== null ? getFieldAssignments(superClass) : "",
        clsBase = util.descriptor2typestr(cls.getInternalName());
      return prefix + cls.getFields().map((field: methods.Field) =>
        `this["${clsBase}/${field.name}"] = ${getDefaultFieldValue(field.raw_descriptor)};\n`
      ).join("");
    }

    function getMethodPrototypeAssignments(cls: ReferenceClassData): string {
      var clsName = util.jvmName2JSName(cls.getInternalName()),
        clsBase = util.descriptor2typestr(cls.getInternalName()),
        methodAssignments: string = cls.getMethods().map((m: methods.Method, i: number) =>
          `${clsName}.prototype["${clsBase}/${m.name}${m.raw_descriptor}"] = ${clsName}.prototype["${m.name}${m.raw_descriptor}"] = (function(method) {
            return function(thread, args, cb) {
              if (cb) {
                thread.stack.push(new InternalStackFrame(cb));
              }
              thread.stack.push(new ${m.accessFlags.isNative() ? "NativeStackFrame" : "BytecodeStackFrame"}(method, args));
              thread.setStatus(${enums.ThreadStatus.RUNNABLE});
            };
          })(cls.getMethods()[${i}]);\n`
        ).join("");

      // Install default methods.
      return methodAssignments + cls.getInterfaces().map((i: ReferenceClassData, intIdx: number) => i.getMethods().map((m: methods.Method, i: number) => {
        if (m.accessFlags.isAbstract() || m.getCodeAttribute() == null) {
          return ""
        } else {
          return `if (!${clsName}.prototype[${m.name}${m.raw_descriptor}]) {
              ${clsName}.prototype["${m.name}${m.raw_descriptor}"] = (function(method) {
              return function(thread, args, cb) {
                if (cb) {
                  thread.stack.push(new InternalStackFrame(cb));
                }
                thread.stack.push(new ${m.accessFlags.isNative() ? "NativeStackFrame" : "BytecodeStackFrame"}(method, args));
                thread.setStatus(${enums.ThreadStatus.RUNNABLE});
              };
            })(cls.getInterfaces()[${intIdx}].getMethods()[${i}]);
          }\n`;
        }
      }).join("")).join("");
    }

    return eval(`function _create(extendClass, cls, InternalStackFrame, NativeStackFrame, BytecodeStackFrame, gLongZero) {
      if (cls.superClass !== null) {
        extendClass(${jsClassName}, cls.superClass.getConstructor());
      }
      function ${jsClassName}(jvm) {
        this.ref = jvm.getNextRef();
        ${getFieldAssignments(this)}
      }

      // Static values.
      ${jsClassName}.cls = cls;

      ${getMethodPrototypeAssignments(this)}

      return ${jsClassName};
    }
    _create`)(extendClass, this, threading.InternalStackFrame, threading.NativeStackFrame, threading.BytecodeStackFrame, gLong.ZERO);
  }
}
