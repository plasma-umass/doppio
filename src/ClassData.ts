"use strict";
import util = require('./util');
import ByteStream = require('./ByteStream');
import ConstantPool = require('./ConstantPool');
import attributes = require('./attributes');
import threading = require('./threading');
import logging = require('./logging');
import methods = require('./methods');
import ClassLoader = require('./ClassLoader');
import enums = require('./enums');
import ClassLock = require('./ClassLock');
import assert = require('./assert');
import gLong = require('./gLong');
import JVM = require('./jvm');
import StringOutputStream = require('./StringOutputStream');
import JVMTypes = require('../includes/JVMTypes');
var ClassState = enums.ClassState;
var trace = logging.trace;
var debug = logging.debug;

/**
 * Auto-incrementing reference number. Uniquely identifies each object allocated
 * by the JVM. Started at 1 because we use 0 to identify NULL.
 */
var ref: number = 1;

/**
 * Defines special JVM-injected fields. The map stores the TypeScript type of
 * the field and the default value for the field, which will be assigned in the
 * JavaScript constructor for the class.
 */
var injectedFields: {[className: string]: {[fieldName: string]: [string, string]}} = {
  'Ljava/lang/invoke/MemberName;': {
    vmtarget: ["methods.AbstractMethodField", "null"]
  },
  'Ljava/lang/Object;': {
    'ref': ["number", "ref++"],
    '$monitor': ["Monitor", "null"]
  },
  'Ljava/net/PlainSocketImpl;': {
    '$is_shutdown': ['boolean', 'false'],
    '$ws': ['interfaces.IWebsock', 'null']
  },
  'Ljava/io/FileDescriptor;': {
    '$pos': ['number', '-1']
  },
  'Ljava/lang/Class;': {
    '$cls': ['ClassData.ClassData', 'null']
  },
  'Ljava/lang/ClassLoader;': {
    '$loader': ['ClassLoader.ClassLoader', 'new ClassLoader.CustomClassLoader(thread.getBsCl(), this);']
  },
  'Ljava/lang/Thread;': {
    '$thread': ['threading.JVMThread', 'thread.getThreadPool().newThread(this)']
  }
};

/**
 * Defines special JVM-injected method. The map stores the TypeScript type
 * signature of the method and the JavaScript body of the method, keyed on the
 * method's name. These are all instance methods (e.g. non-static).
 */
var injectedMethods: {[className: string]: {[methodName: string]: [string, string]}} = {
  // NOTE: '[' represents any JVM array class.
  '[': {
    'getFieldFromSlot': ['(offset: gLong): T', `function(offset) {
  return this.array[offset.toInt()];
}`],
    'setFieldFromSlot': ['(offset: gLong, value: T): void', `function(offset, value) {
  this[offset.toInt()] = value;
}`]
  },
  'Ljava/lang/Object;': {
    'getClass': ["(): ClassData.ClassData", `function() { return this.constructor.cls }`],
    'getMonitor': ["(): Monitor", `function() {
  if (this.$monitor === null) {
    this.$monitor = new Monitor();
  }
  return this.$monitor;
}`],
    'getFieldFromSlot': ['(offset: gLong): any', `function(offset) {
  return this[this.getClass().getFieldFromSlot(offset.toInt()).fullSignature];
}`],
    'setFieldFromSlot': ['(offset: gLong, value: any): void', `function(offset, value) {
  this[this.getClass().getFieldFromSlot(offset.toInt()).fullSignature] = value;
}`]
  },
  'Ljava/lang/String;': {
    'toString': ["(): string", `function() { return util.chars2jsStr(this['java/lang/String/value']); }`]
  }
};

export interface IJVMConstructor<T extends JVMTypes.java_lang_Object> {
  /**
   * Constructs a new object in the same manner as the JVM's "new" opcode.
   * Does *NOT* run the JVM constructor!
   * @param jvm The thread that is constructing the object.
   * @param lengths... If this is an array type, the length of each dimension of the array. (Required if an array type.)
   */
  new(thread: threading.JVMThread, lengths?: number[] | number): T;
}

/**
 * Extends a JVM class by making its prototype a blank instantiation of an
 * object with the super class's prototype as its prototype. Inspired from
 * TypeScript's __extend function.
 */
function extendClass(cls: any, superCls: any) {
  function __() { this.constructor = cls; }
  __.prototype = superCls.prototype;
  cls.prototype = new (<any> __)();
}

/**
 * Represents a single class in the JVM.
 */
export class ClassData {
  protected loader: ClassLoader.ClassLoader;
  public accessFlags: util.Flags = null;
  /**
   * We make this private to *enforce* call sites to use our getter functions.
   * The actual state of this class depends on the state of its parents, and
   * parents do not inform their children when they change state.
   */
  private state: enums.ClassState = enums.ClassState.LOADED;
  private jco: JVMTypes.java_lang_Class = null;
  /**
   * The class's canonical name, in internal form.
   * Ljava/lang/Foo;
   */
  protected className: string;
  protected superClass: ReferenceClassData<JVMTypes.java_lang_Object> = null;

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
   * Get the name of the package that this class belongs to (e.g. java.lang).
   */
  public getPackageName(): string {
    var extName = this.getExternalName(), i: number;
    // Find the index of the last '.' in the name.
    for (i = extName.length - 1; i >= 0 && extName[i] !== '.'; i--) {}
    if (i >= 0) {
      return extName.slice(0, i);
    } else {
      return "";
    }
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
  public getSuperClass(): ReferenceClassData<JVMTypes.java_lang_Object> {
    return this.superClass;
  }

  /**
   * Get all of the interfaces that the class implements.
   */
  public getInterfaces(): ReferenceClassData<JVMTypes.java_lang_Object>[] {
    return [];
  }

  /**
   * Get all of the injected fields for this class. The value for each field
   * in the returned map is its type.
   */
  public getInjectedFields(): { [fieldName: string]: string } {
    var rv: { [fieldName: string]: string } = {};
    if (injectedFields[this.getInternalName()] !== undefined) {
      var fields = injectedFields[this.getInternalName()];
      Object.keys(fields).forEach((fieldName: string) => {
        rv[fieldName] = fields[fieldName][0];
      });
    }
    return rv;
  }

  /**
   * Get all of the injected methods for this class. The value for each method
   * in the returned map is its type.
   */
  public getInjectedMethods(): { [methodName: string]: string } {
    var rv: { [methodName: string]: string } = {},
      lookupName = this.getInternalName();
    // All array classes share the same injected methods.
    if (lookupName[0] === '[') {
      lookupName = '[';
    }

    if (injectedMethods[lookupName] !== undefined) {
      var methods = injectedMethods[lookupName];
      Object.keys(methods).forEach((methodName: string) => {
        rv[methodName] = methods[methodName][0];
      });
    }
    return rv;
  }

  /**
   * Get a java.lang.Class object corresponding to this class.
   */
  public getClassObject(thread: threading.JVMThread): JVMTypes.java_lang_Class {
    if (this.jco === null) {
      this.jco = new ((<ReferenceClassData<JVMTypes.java_lang_Class>> thread.getBsCl().getResolvedClass('Ljava/lang/Class;')).getConstructor(thread))(thread);
      this.jco.$cls = this;
      this.jco['java/lang/Class/classLoader'] = this.getLoader().getLoaderObject();
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

  protected outputInjectedMethods(jsClassName: string, outputStream: StringOutputStream) {
    var lookupName = this.getInternalName();
    if (lookupName[0] === '[') {
      lookupName = '[';
    }
    if (injectedMethods[lookupName] !== undefined) {
      var methods = injectedMethods[lookupName];
      Object.keys(methods).forEach((methodName: string) => {
        outputStream.write(`  ${jsClassName}.prototype.${methodName} = ${methods[methodName][1]};\n`);
      });
    }
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
  public createWrapperObject(thread: threading.JVMThread, value: any): JVMTypes.java_lang_Object {
    var boxName = this.boxClassName();
    var boxCls = <ReferenceClassData<JVMTypes.java_lang_Object>> thread.getBsCl().getInitializedClass(thread, boxName);
    // these are all initialized in preinit (for the BSCL, at least)
    var boxCons = boxCls.getConstructor(thread);
    var wrapped = new boxCons(thread);
    if (boxName !== 'V') {
      // XXX: all primitive wrappers store their value in a private static final field named 'value'
      (<any> wrapped)[util.jvmName2JSName(boxName) + '/value'] = value;
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
}

export class ArrayClassData<T> extends ClassData {
  private componentClassName: string;
  private componentClass: ClassData;
  private _constructor: IJVMConstructor<JVMTypes.JVMArray<T>> = null;

  constructor(componentType: string, loader: ClassLoader.ClassLoader) {
    super(loader);
    this.className = `[${componentType}`;
    // ArrayClassData objects are ABSTRACT, FINAL, and PUBLIC.
    this.accessFlags = new util.Flags(0x411);
    this.componentClassName = componentType;
  }

  /**
   * Looks up a method with the given signature. Returns null if no method
   * found.
   */
  public methodLookup(signature: string): methods.Method {
    return this.superClass.methodLookup(signature);
  }

  public fieldLookup(name: string): methods.Field {
    return this.superClass.fieldLookup(name);
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
        this.setResolved(<ReferenceClassData<JVMTypes.java_lang_Object>> this.loader.getResolvedClass("Ljava/lang/Object;"), this.loader.getResolvedClass(this.componentClassName));
        cb(this);
      } else {
        cb(null);
      }
    });
  }

  public getComponentClass(): ClassData {
    return this.componentClass;
  }

  /**
   * Resolved and initialized are the same for array types.
   */
  public setResolved<T extends JVMTypes.java_lang_Object>(super_class_cdata: ReferenceClassData<T>, component_class_cdata: ClassData): void {
    this.superClass = super_class_cdata;
    this.componentClass = component_class_cdata;
    this.setState(ClassState.INITIALIZED);
  }

  public tryToResolve(): boolean {
    var loader = this.loader,
      superClassCdata = <ReferenceClassData<JVMTypes.java_lang_Object>> loader.getResolvedClass("Ljava/lang/Object;"),
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
    return this.getComponentClass().isCastable((<ArrayClassData<any>> target).getComponentClass());
  }

  public initialize(thread: threading.JVMThread, cb: (cdata: ClassData) => void, explicit: boolean = true): void {
    this.resolve(thread, cb, explicit);
  }

  private static typedArraysSupported = typeof ArrayBuffer !== "undefined";

  /**
   * Get the array constructor for this particular JVM array class.
   * Uses typed arrays when available for primitive arrays.
   */
  private getJSArrayConstructor(): string {
    if (!ArrayClassData.typedArraysSupported) {
      return 'Array';
    }
    switch (this.componentClassName) {
      case 'B':
        return 'Int8Array';
      case 'C':
        return 'Uint8Array';
      case 'I':
        return 'Int32Array';
      case 'F':
        return 'Float32Array';
      case 'D':
        return 'Float64Array';
      default:
        return 'Array';
    }
  }

  /**
   * Get the initial value placed into each array element.
   */
  private getJSDefaultArrayElement(): string {
    switch(this.componentClassName[0]) {
      case '[':
        return `new (cls.getComponentClass().getConstructor())(otherLengths)`;
      case 'L':
        return "null";
      case 'J':
        return "gLongZero";
      default:
        return "0";
    }
  }

  private _constructConstructor(thread: threading.JVMThread): IJVMConstructor<JVMTypes.JVMArray<T>> {
    assert(this._constructor === null, `Tried to construct constructor twice for ${this.getExternalName()}!`);
    var outputStream = new StringOutputStream(),
      jsClassName = util.jvmName2JSName(this.getInternalName());
    outputStream.write(`function _create(extendClass, cls, superCls, gLongZero, thread) {
  extendClass(${jsClassName}, superCls.getConstructor(thread));
  function ${jsClassName}(thread, lengths) {\n`);
    this.superClass.outputInjectedFields(outputStream);
    // Initialize array.
    if (this.componentClassName[0] !== '[') {
      // Array elements are a non-array type.
      outputStream.write(`    this.array = new ${this.getJSArrayConstructor()}(lengths);\n`)
      if (this.getJSArrayConstructor() === 'Array') {
        // TypedArrays are already initialized to 0, so this check skips array
        // initialization in that case.
        outputStream.write(`    for (var i = 0; i < lengths; i++) {
      this.array[i] = ${this.getJSDefaultArrayElement()};
    }\n`)
      }
    } else {
      // Multi-dimensional array.
      outputStream.write(`    var length = lengths[0], otherLengths = lengths.slice(1);
    this.array = new ${this.getJSArrayConstructor()}(length);
    for (var i = 0; i < length; i++) {
      this.array[i] = ${this.getJSDefaultArrayElement()};
    }\n`)
    }
    outputStream.write(`  }

  ${jsClassName}.cls = cls;\n`);
    this.outputInjectedMethods(jsClassName, outputStream);
    outputStream.write(`
  return ${jsClassName};
}
// Last statement is return value of eval.
_create`);
    // All arrays extend java/lang/Object
    return eval(outputStream.flush())(extendClass, this, this.superClass, gLong.ZERO, thread);
  }

  public getConstructor(thread: threading.JVMThread): IJVMConstructor<JVMTypes.JVMArray<T>> {
    assert(this.isResolved(), `Tried to get constructor for class ${this.getInternalName()} before it was resolved.`);
    if (this._constructor === null) {
      this._constructor = this._constructConstructor(thread);
    }
    return this._constructor;
  }
}

/**
 * Represents a "reference" Class -- that is, a class that neither represents a
 * primitive nor an array.
 */
export class ReferenceClassData<T extends JVMTypes.java_lang_Object> extends ClassData {
  private minorVersion: number;
  public majorVersion: number;
  public constantPool: ConstantPool.ConstantPool;
  /**
   * All of the fields directly defined by this class.
   */
  private fields: methods.Field[];
  /**
   * All of the methods directly defined by this class.
   */
  private methods: methods.Method[];
  private attrs: attributes.IAttribute[];
  private interfaceClasses: ReferenceClassData<JVMTypes.java_lang_Object>[] = null;
  private superClassRef: ConstantPool.ClassReference = null;
  private interfaceRefs: ConstantPool.ClassReference[];
  /**
   * Initialization lock.
   */
  private initLock: ClassLock = new ClassLock();
  /**
   * Stores the JavaScript constructor for this class.
   */
  private _constructor: IJVMConstructor<T> = null;
  /**
   * Virtual field table
   */
  private _fieldLookup: { [name: string]: methods.Field } = {};
  /**
   * All fields in object instantiations. The field's index is its slot.
   */
  protected _fieldSlots: methods.Field[] = [];
  /**
   * All static fields in the class. The field's index is its slot.
   */
  protected _staticFieldSlots: methods.Field[] = [];
  /**
   * Virtual method table.
   */
  private _methodLookup: { [name: string]: methods.Method } = {};
  /**
   * All methods in object instantiations. The method's index is its slot.
   */
  protected _methodSlots: methods.Method[] = [];

  constructor(buffer: NodeBuffer, loader?: ClassLoader.ClassLoader, cpPatches?: JVMTypes.JVMArray<JVMTypes.java_lang_Object>) {
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
      this.fields[i] = new methods.Field(this, this.constantPool, byteStream);
    }
    // class methods
    var numMethods = byteStream.getUint16();
    this.methods = new Array<methods.Method>(numMethods);
    for (i = 0; i < numMethods; i++) {
      var m = new methods.Method(this, this.constantPool, byteStream);
      this.methods[i] = m;
    }
    // class attributes
    this.attrs = attributes.makeAttributes(byteStream, this.constantPool);
    if (byteStream.hasBytes()) {
      throw `Leftover bytes in classfile: ${byteStream}`;
    }
  }

  public getSuperClassReference(): ConstantPool.ClassReference {
    return this.superClassRef;
  }

  public getInterfaceClassReferences(): ConstantPool.ClassReference[] {
    return this.interfaceRefs.slice(0);
  }

  /**
   * Retrieve the set of interfaces that this class implements.
   * DO NOT MUTATE!
   */
  public getInterfaces(): ReferenceClassData<JVMTypes.java_lang_Object>[] {
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
   * The virtual method table for this class. The method's index in the table
   * is its slot.
   */
  public getMethodSlots(): methods.Method[] {
    return this._methodSlots;
  }

  /**
   * Retrieve a method with the given signature from this particular class.
   * Does not search superclasses / interfaces.
   */
  public getMethod(sig: string): methods.Method {
    var i: number, m: methods.Method;
    for (i = 0; i < this.methods.length; i++) {
      m = this.methods[i];
      if (m.name + m.rawDescriptor === sig) {
        return m;
      }
    }
    return null;
  }

  /**
   * Get the methods belonging to this particular class.
   * DO NOT MUTATE!
   */
  public getMethods(): methods.Method[] {
    return this.methods;
  }

  /**
   * Resolves this class's virtual method table according to the JVM
   * specification:
   * http://docs.oracle.com/javase/specs/jvms/se8/html/jvms-5.html#jvms-5.4.3.3
   */
  private _resolveMethods(): void {
    if (this.superClass !== null) {
      // Start off with my parents' table / slots.
      this._methodSlots = this._methodSlots.concat(this.superClass._methodSlots);
      Object.keys(this.superClass._methodLookup).forEach((m: string) => {
        this._methodLookup[m] = this.superClass._methodLookup[m];
      });
    }

    // My methods override my super class'.
    this.methods.forEach((m: methods.Method) => {
      var superM = this._methodLookup[m.signature];
      if (!m.accessFlags.isStatic() && m.name !== "<init>") {
        // Slots only matter to non-static non-constructor methods.
        if (superM === undefined) {
          // New slot.
          m.slot = this._methodSlots.push(m) - 1;
        } else {
          // Old slot. Inherit the super class method's slot.
          m.slot = superM.slot;
          this._methodSlots[m.slot] = m;
        }
      }
      this._methodLookup[m.signature] = m;
    });

    // Root out any miranda / default / static interface methods. Only install
    // them if there are no alternatives already in the table.
    this.interfaceClasses.forEach((iface: ReferenceClassData<JVMTypes.java_lang_Object>) => {
      Object.keys(iface._methodLookup).forEach((ifaceMethodSig: string) => {
        if (this._methodLookup[ifaceMethodSig] === undefined) {
          // New slot.
          var ifaceM = iface._methodLookup[ifaceMethodSig];
          // TODO: How do interface slots work? Can't be fixed... I'm not
          // setting it here. Then again, maybe it's the slot in the interface?
          // TODO: I think I'll need to support multiple slots per method?
          // TODO: invoke tests w/ interfaces.
          this._methodSlots.push(ifaceM);
          this._methodLookup[ifaceMethodSig] = ifaceM;
        }
      });
    });
  }

  /**
   * Resolves all of the fields for this class according to the JVM
   * specification:
   * http://docs.oracle.com/javase/specs/jvms/se8/html/jvms-5.html#jvms-5.4.3.2
   */
  private _resolveFields(): void {
    if (this.superClass !== null) {
      // Start off w/ my parent class' fields.
      this._fieldSlots = this._fieldSlots.concat(this.superClass._fieldSlots);
      this._staticFieldSlots = this._staticFieldSlots.concat(this.superClass._staticFieldSlots);
      Object.keys(this.superClass._fieldLookup).forEach((f: string) => {
        this._fieldLookup[f] = this.superClass._fieldLookup[f];
      });
    }

    // Superinterface fields trump superclass fields.
    this.interfaceClasses.forEach((iface: ReferenceClassData<JVMTypes.java_lang_Object>) => {
      Object.keys(iface._fieldLookup).forEach((ifaceFieldName: string) => {
        var ifaceF = iface._fieldLookup[ifaceFieldName];
        assert(ifaceF.accessFlags.isStatic(), "Interface fields must be static.");
        this._fieldLookup[ifaceFieldName] = ifaceF;
        // TODO: How do interface field slots work...?
        this._staticFieldSlots.push(ifaceF);
      });
    });

    // My fields override all other fields.
    this.fields.forEach((f: methods.Field) => {
      this._fieldLookup[f.name] = f;
      f.slot = (f.accessFlags.isStatic() ? this._staticFieldSlots.push(f) : this._fieldSlots.push(f)) - 1;
    });
  }

  /**
   * Looks up a method with the given signature. Returns null if no method
   * found.
   */
  public methodLookup(signature: string): methods.Method {
    var m = this._methodLookup[signature];
    if (m !== undefined) {
      return m;
    } else {
      return null;
    }
  }

  /**
   * Checks if the signature belongs to a signature polymorphic function.
   * Returns null if not true.
   */
  public signaturePolymorphicMethodLookup(signature: string): methods.Method {
    if (this.className === 'Ljava/lang/invoke/MethodHandle;') {
      // Check if this is a signature polymorphic method.
      // From S2.9:
      // A method is signature polymorphic if and only if all of the following conditions hold :
      // * It is declared in the java.lang.invoke.MethodHandle class.
      // * It has a single formal parameter of type Object[].
      // * It has a return type of Object.
      // * It has the ACC_VARARGS and ACC_NATIVE flags set.
      var polySig = `${signature.slice(0, signature.indexOf('('))}([Ljava/lang/Object;)Ljava/lang/Object;`,
        m = this._methodLookup[polySig];
      if (m !== undefined && m.accessFlags.isNative() && m.accessFlags.isVarArgs() && m.cls === this) {
        return m;
      }
    } else if (this.superClass !== null) {
      return this.superClass.signaturePolymorphicMethodLookup(signature);
    }
    return null;
  }

  /**
   * Looks up a field with the given name. Returns null if no method found.
   */
  public fieldLookup(name: string): methods.Field {
    var f = this._fieldLookup[name];
    if (f !== undefined) {
      return f;
    } else {
      return null;
    }
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

  /**
   * Returns the initial value for a given static field in the class. Should
   * only be called when the constructor is created.
   */
  private _getInitialStaticFieldValue(thread: threading.JVMThread, name: string): any {
    var f: methods.Field = this.fieldLookup(name);
    if (f !== null && f.accessFlags.isStatic()) {
      var cva = <attributes.ConstantValue> f.getAttribute('ConstantValue');
      if (cva !== null) {
        switch (cva.value.getType()) {
          case enums.ConstantPoolItemType.STRING:
            var stringCPI = <ConstantPool.ConstString> cva.value;
            if (stringCPI.value === null) {
              stringCPI.value = thread.getThreadPool().getJVM().internString(stringCPI.stringValue);
            }
            return stringCPI.value;
          default:
            // TODO: Type better.
            return (<any> cva.value).value;
        }
      } else {
        return util.initialValue(f.rawDescriptor);
      }
    }
    assert(false, `Tried to construct a static field value that doesn't exist: ${this.getInternalName()} ${name}`);
  }

  public setResolved(superClazz: ReferenceClassData<JVMTypes.java_lang_Object>, interfaceClazzes: ReferenceClassData<JVMTypes.java_lang_Object>[]): void {
    this.superClass = superClazz;
    trace(`Class ${this.getInternalName()} is now resolved.`);
    this.interfaceClasses = interfaceClazzes;
    // TODO: Assert we are not already resolved or initialized?
    this._resolveMethods();
    this._resolveFields();
    this.setState(ClassState.RESOLVED);
  }

  public tryToResolve(): boolean {
    if (this.getState() === ClassState.LOADED) {
      // Need to grab the super class, and interfaces.
      var loader = this.loader,
        toResolve = this.superClassRef !== null ? this.interfaceRefs.concat(this.superClassRef) : this.interfaceRefs,
        allGood = true,
        resolvedItems: ReferenceClassData<JVMTypes.java_lang_Object>[] = [], i: number,
        item: ConstantPool.ClassReference;
      for (i = 0; i < toResolve.length; i++) {
        item = toResolve[i];
        if (item.tryResolve(loader)) {
          resolvedItems.push(<ReferenceClassData<JVMTypes.java_lang_Object>> item.cls);
        } else {
          return false;
        }
      }

      // It worked!
      this.setResolved(this.superClassRef !== null ? resolvedItems.pop() : null, resolvedItems);
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
    var cons = <any> this.getConstructor(thread);
    if (cons['<clinit>()V'] !== undefined) {
      debug(`T${thread.getRef()} Running static initialization for class ${this.className}...`);
      cons['<clinit>()V'](thread, (e?: JVMTypes.java_lang_Throwable) => {
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
          if (e.getClass().isCastable(thread.getBsCl().getResolvedClass('Ljava/lang/Error;'))) {
            // 'e' is 'Error or one of its subclasses'.
            thread.throwException(e);
            cb(null);
          } else {
            // Wrap the error.
            thread.getBsCl().initializeClass(thread, 'Ljava/lang/ExceptionInInitializerError;', (cdata: ReferenceClassData<JVMTypes.java_lang_ExceptionInInitializerError>) => {
              if (cdata == null) {
                // Exceptional failure right here: *We failed to construct ExceptionInInitializerError*!
                // initializeClass will throw an exception on our behalf;
                // nothing to do.
                cb(null);
              } else {
                // Construct the object!
                var eCons = cdata.getConstructor(thread),
                  e2 = new eCons(thread);
                // Construct the ExceptionInInitializerError!
                e2["<init>(Ljava/lang/Throwable;)V"](thread, [e], (e?: JVMTypes.java_lang_Throwable) => {
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
    var toResolve: ConstantPool.ClassReference[] = this.interfaceRefs.slice(0);
    if (this.superClassRef !== null) {
      toResolve.push(this.superClassRef);
    }
    toResolve = toResolve.filter((item: ConstantPool.ClassReference) => !item.isResolved());
    util.asyncForEach(toResolve, (clsRef: ConstantPool.ClassReference, nextItem: (err?: any) => void) => {
      clsRef.resolve(thread, this.loader, this, (status: boolean) => {
        if (!status) {
          nextItem("Failed.");
        } else {
          nextItem();
        }
      }, explicit);
    }, (err?: any) => {
      if (!err) {
        this.setResolved(this.superClassRef !== null ? <ReferenceClassData<JVMTypes.java_lang_Object>> this.superClassRef.cls : null, this.interfaceRefs.map((ref: ConstantPool.ClassReference) => <ReferenceClassData<JVMTypes.java_lang_Object>> ref.cls));
        cb(this);
      } else {
        cb(null);
      }
    });
  }

  /**
   * Find Miranda and default interface methods in this class. These
   * methods manifest as new slots in the virtual method table compared with
   * the superclass, and are not defined in this class itself.
   */
  public getMirandaAndDefaultMethods(): methods.Method[] {
    var superClsMethodTable: methods.Method[] = this.superClass !== null ? this.superClass.getMethodSlots() : [];
    return this.getMethodSlots().slice(superClsMethodTable.length).filter((method: methods.Method) => method.cls !== this);
  }

  public outputInjectedFields(outputStream: StringOutputStream) {
    if (this.superClass !== null) {
      this.superClass.outputInjectedFields(outputStream);
    }
    var injected = injectedFields[this.getInternalName()];
    if (injected !== undefined) {
      Object.keys(injected).forEach((fieldName: string) => {
        outputStream.write(`this.${fieldName} = ${injected[fieldName][1]};\n`);
      });
    }
  }

  protected _constructConstructor(thread: threading.JVMThread): IJVMConstructor<T> {
    assert(this._constructor === null, `Attempted to construct constructor twice for class ${this.getExternalName()}!`);

    var jsClassName = util.jvmName2JSName(this.getInternalName()),
      outputStream = new StringOutputStream();

    outputStream.write(`function _create(extendClass, cls, InternalStackFrame, NativeStackFrame, BytecodeStackFrame, gLongZero, ClassLoader, Monitor, thread) {
  if (cls.superClass !== null) {
    extendClass(${jsClassName}, cls.superClass.getConstructor(thread));
  }
  function ${jsClassName}(thread) {\n`);
    // Injected fields.
    this.outputInjectedFields(outputStream);

    // Output instance field assignments.
    this._fieldSlots.forEach((f: methods.Field) => f.outputJavaScriptField(jsClassName, outputStream));
    outputStream.write(`  }
  ${jsClassName}.cls = cls;\n`);

    // Injected methods.
    this.outputInjectedMethods(jsClassName, outputStream);

    // Static fields.
    this._staticFieldSlots.forEach((f: methods.Field) => f.outputJavaScriptField(jsClassName, outputStream));

    // Static and instance methods.
    this.getMethods().forEach((m: methods.Method) => m.outputJavaScriptFunction(jsClassName, outputStream));

    // Miranda and default interface methods.
    this.getMirandaAndDefaultMethods().forEach((m: methods.Method) => m.outputJavaScriptFunction(jsClassName, outputStream));

    outputStream.write(`  return ${jsClassName};
}
_create`);

    return eval(outputStream.flush())(extendClass, this, threading.InternalStackFrame, threading.NativeStackFrame, threading.BytecodeStackFrame, gLong.ZERO, require('./ClassLoader'), require('./Monitor'), thread);
  }

  public getConstructor(thread: threading.JVMThread): IJVMConstructor<T> {
    if (this._constructor == null) {
      this._constructor = this._constructConstructor(thread);
    }
    return this._constructor;
  }
}
