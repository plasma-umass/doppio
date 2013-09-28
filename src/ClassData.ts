"use strict";
import util = require('./util');
import ConstantPool = require('./ConstantPool');
import attributes = require('./attributes');
import opcodes = require('./opcodes');
import java_object = require('./java_object');
var JavaObject = java_object.JavaObject;
var JavaClassObject = java_object.JavaClassObject;
import logging = require('./logging');
import methods = require('./methods');
import runtime = require('./runtime');
import natives = require('./natives');
import ClassLoader = require('./ClassLoader');
import enums = require('./enums');
var ClassState = enums.ClassState;
var trace = logging.trace;

// Represents a single class in the JVM.
export class ClassData {
  public loader: ClassLoader.ClassLoader;
  public access_flags: util.Flags = null;
  // We make this private to *enforce* call sites to use our getter functions.
  // The actual state of this class depends on the state of its parents, and
  // parents do not inform their children when they change state.
  private state: enums.ClassState = ClassState.LOADED;
  private jco: java_object.JavaClassObject = null;
  // Flip to 1 to trigger reset() call on load.
  public reset_bit: number = 0;
  public this_class: string;
  public super_class: string;
  public super_class_cdata: ClassData;

  // Responsible for setting up all of the fields that are guaranteed to be
  // present on any ClassData object.
  constructor(loader: ClassLoader.ClassLoader) {
    // XXX: Avoids a tough circular dependency.
    // (ClassData->methods->natives->...)
    if (!natives.instantiated) {
      natives.instantiate(ReferenceClassData, PrimitiveClassData, ArrayClassData);
    }
    this.loader = loader != null ? loader : null;
  }

  // Resets any ClassData state that may have been built up
  // We do not reset 'initialized' here; only reference types need to reset that.
  public reset(): void {
    this.jco = null;
    this.reset_bit = 0;
    // Reset any referenced classes if they are up for reset.
    var sc = this.get_super_class();
    if (sc != null && sc.reset_bit === 1) {
      sc.reset();
    }
    var ifaces = this.get_interfaces();
    for (var i = 0; i < ifaces.length; i++) {
      var iface = ifaces[i];
      if (iface.reset_bit === 1) {
        iface.reset();
      }
    }
  }

  public toExternalString(): string {
    return util.ext_classname(this.this_class);
  }

  // Returns the ClassLoader object of the classloader that initialized this
  // class. Returns null for the default classloader.
  public get_class_loader(): ClassLoader.ClassLoader {
    return this.loader;
  }

  public get_type(): string {
    return this.this_class;
  }

  public get_super_class_type(): string {
    return this.super_class;
  }

  public get_super_class(): ClassData {
    return this.super_class_cdata;
  }

  public get_interface_types(): string[] {
    return [];
  }

  public get_interfaces(): ClassData[] {
    return [];
  }

  public get_class_object(rs: runtime.RuntimeState): java_object.JavaClassObject {
    if (this.jco == null) {
      this.jco = new JavaClassObject(rs, this);
    }
    return this.jco;
  }

  public get_method(name: string): methods.Method {
    return null;
  }

  public get_methods(): { [name: string]: methods.Method } {
    return {};
  }

  public get_fields(): methods.Field[] {
    return [];
  }

  public method_lookup(rs: runtime.RuntimeState, sig: string): methods.Method {
    var err_cls = <ReferenceClassData> rs.get_bs_class('Ljava/lang/NoSuchMethodError;');
    rs.java_throw(err_cls, "No such method found in " + util.ext_classname(this.get_type()) + "::" + sig);
    return null; // TypeScript can't infer that rs.java_throw *always* throws an exception.
  }

  public field_lookup(rs: runtime.RuntimeState, name: string): methods.Field {
    var err_cls = <ReferenceClassData> rs.get_bs_class('Ljava/lang/NoSuchFieldError;');
    rs.java_throw(err_cls, "No such field found in " + util.ext_classname(this.get_type()) + "::" + name);
    return null; // TypeScript can't infer that rs.java_throw *always* throws an exception.
  }

  public set_state(state:enums.ClassState):void { this.state = state; }

  // Gets the current state of this class.
  public get_state(): enums.ClassState {
    if (this.state == ClassState.RESOLVED && this.get_method('<clinit>()V') == null) {
      // We can promote to INITIALIZED if this class has no static initialization
      // logic, and its parent class is initialized.
      var scls = this.get_super_class();
      if (scls != null && scls.get_state() === ClassState.INITIALIZED) {
        this.state = ClassState.INITIALIZED;
      }
    }
    return this.state;
  }

  // Convenience function.
  public is_initialized(): boolean { return this.get_state() === ClassState.INITIALIZED; }
  // Convenience function.
  public is_resolved(): boolean { return this.get_state() !== ClassState.LOADED; }

  public is_subinterface(target: ClassData): boolean {
    return false;
  }

  public is_subclass(target: ClassData): boolean {
    if (this === target) {
      return true;
    }
    if (this.get_super_class() == null) {
      return false;
    }
    return this.get_super_class().is_subclass(target);
  }

  public is_castable(target: ClassData): boolean {
    throw new Error("Unimplemented.");
  }
}

export class PrimitiveClassData extends ClassData {
  constructor(this_class: string, loader: ClassLoader.ClassLoader) {
    super(loader);
    this.this_class = this_class;
    this.set_state(ClassState.INITIALIZED);
  }

  // Returns a boolean indicating if this class is an instance of the target class.
  // "target" is a ClassData object.
  // The ClassData objects do not need to be initialized; just loaded.
  public is_castable(target: ClassData): boolean {
    return this.this_class === target.this_class;
  }

  public box_class_name(): string {
    switch (this.this_class) {
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
      default:
        throw new Error("Tried to box a non-primitive class: " + this.this_class);
    }
  }

  public create_wrapper_object(rs: runtime.RuntimeState, value: any): java_object.JavaObject {
    var box_name = this.box_class_name();
    var box_cls = <ReferenceClassData> rs.get_bs_class(box_name);
    // these are all initialized in preinit (for the BSCL, at least)
    var wrapped = new JavaObject(rs, box_cls);
    // XXX: all primitive wrappers store their value in a private static final field named 'value'
    wrapped.fields[box_name + 'value'] = value;
    return wrapped;
  }
}

export class ArrayClassData extends ClassData {
  private component_type: string;
  private component_class_cdata: ClassData;

  constructor(component_type: string, loader: ClassLoader.ClassLoader) {
    super(loader);
    this.component_type = component_type;
    this.this_class = "[" + this.component_type;
    this.super_class = 'Ljava/lang/Object;';
    this.access_flags = util.parse_flags(0);  // no flags set
  }

  public reset(): void {
    super.reset();
    var ccls = this.get_component_class();
    if (ccls && ccls.reset_bit) {
      ccls.reset();
    }
  }

  public get_component_type(): string {
    return this.component_type;
  }

  public get_component_class(): ClassData {
    return this.component_class_cdata;
  }

  // This class itself has no fields/methods, but java/lang/Object does.
  public field_lookup(rs: runtime.RuntimeState, name: string): methods.Field {
    return this.super_class_cdata.field_lookup(rs, name);
  }

  public method_lookup(rs: runtime.RuntimeState, sig: string): methods.Method {
    return this.super_class_cdata.method_lookup(rs, sig);
  }

  // Resolved and initialized are the same for array types.
  public set_resolved(super_class_cdata: ClassData, component_class_cdata: ClassData): void {
    this.super_class_cdata = super_class_cdata;
    this.component_class_cdata = component_class_cdata;
    this.set_state(ClassState.INITIALIZED);
  }

  // Returns a boolean indicating if this class is an instance of the target class.
  // "target" is a ClassData object.
  // The ClassData objects do not need to be initialized; just loaded.
  // See §2.6.7 for casting rules.
  public is_castable(target: ClassData): boolean {
    if (!(target instanceof ArrayClassData)) {
      if (target instanceof PrimitiveClassData) {
        return false;
      }
      // Must be a reference type.
      if (target.access_flags["interface"]) {
        // Interface reference type
        var type = target.get_type();
        return type === 'Ljava/lang/Cloneable;' || type === 'Ljava/io/Serializable;';
      }
      // Non-interface reference type
      return target.get_type() === 'Ljava/lang/Object;';
    }
    // We are both array types, so it only matters if my component type can be
    // cast to its component type.
    return this.get_component_class().is_castable((<ArrayClassData> target).get_component_class());
  }
}

// Represents a "reference" Class -- that is, a class that neither represents a
// primitive nor an array.
export class ReferenceClassData extends ClassData {
  private minor_version: number;
  private major_version: number;
  public constant_pool: ConstantPool.ConstantPool;
  private access_byte: number;
  private interfaces: string[];
  private fields: methods.Field[];
  private fl_cache: { [name: string]: methods.Field };
  private methods: { [name: string]: methods.Method };
  private ml_cache: { [name: string]: methods.Method };
  private attrs: attributes.Attribute[];
  public static_fields: { [name: string]: any };
  private interface_cdatas: ReferenceClassData[];
  private default_fields: { [name: string]: any };

  constructor(buffer: NodeBuffer, loader?: ClassLoader.ClassLoader) {
    super(loader);
    var bytes_array = new util.BytesArray(buffer);
    if ((bytes_array.get_uint(4)) !== 0xCAFEBABE) {
      throw "Magic number invalid";
    }
    this.minor_version = bytes_array.get_uint(2);
    this.major_version = bytes_array.get_uint(2);
    if (!(45 <= this.major_version && this.major_version <= 51)) {
      throw "Major version invalid";
    }
    this.constant_pool = new ConstantPool.ConstantPool();
    this.constant_pool.parse(bytes_array);
    // bitmask for {public,final,super,interface,abstract} class modifier
    this.access_byte = bytes_array.get_uint(2);
    this.access_flags = util.parse_flags(this.access_byte);

    this.this_class = this.constant_pool.get(bytes_array.get_uint(2)).deref();
    // super reference is 0 when there's no super (basically just java.lang.Object)
    var super_ref = bytes_array.get_uint(2);
    if (super_ref !== 0) {
      this.super_class = this.constant_pool.get(super_ref).deref();
    }
    // direct interfaces of this class
    var isize = bytes_array.get_uint(2);
    this.interfaces = [];
    for (var _i = 0; _i < isize; ++_i) {
      this.interfaces.push(this.constant_pool.get(bytes_array.get_uint(2)).deref());
    }
    // fields of this class
    var num_fields = bytes_array.get_uint(2);
    this.fields = [];
    for (var _i = 0; _i < num_fields; ++_i) {
      this.fields.push(new methods.Field(this));
    }
    this.fl_cache = {};
    for (var i = 0, _len = this.fields.length; i < _len; ++i) {
      var f = this.fields[i];
      f.parse(bytes_array, this.constant_pool, i);
      this.fl_cache[f.name] = f;
    }
    // class methods
    var num_methods = bytes_array.get_uint(2);
    this.methods = {};
    this.ml_cache = {};
    // XXX: we may want to populate ml_cache with methods whose exception
    // handler classes we have already loaded
    for (var i = 0; i < num_methods; i += 1) {
      var m = new methods.Method(this);
      m.parse(bytes_array, this.constant_pool, i);
      var mkey = m.name + m.raw_descriptor;
      this.methods[mkey] = m;
    }
    // class attributes
    this.attrs = attributes.make_attributes(bytes_array, this.constant_pool);
    if (bytes_array.has_bytes()) {
      throw "Leftover bytes in classfile: " + bytes_array;
    }
    // Contains the value of all static fields. Will be reset when reset()
    // is run.
    this.static_fields = Object.create(null);
  }

  // Resets the ClassData for subsequent JVM invocations. Resets all
  // of the built up state / caches present in the opcode instructions.
  // Eventually, this will also handle `clinit` duties.
  public reset(): void {
    super.reset();
    if (this.get_state() === ClassState.INITIALIZED) {
      this.set_state(ClassState.LOADED);
    }
    this.static_fields = Object.create(null);
    for (var k in this.methods) {
      this.methods[k].initialize();
    }
  }

  public get_interfaces(): ReferenceClassData[] {
    return this.interface_cdatas;
  }

  public get_interface_types(): string[] {
    return this.interfaces;
  }

  public get_fields(): methods.Field[] {
    return this.fields;
  }

  public get_method(sig: string): methods.Method {
    return this.methods[sig];
  }

  public get_methods(): { [name: string]: methods.Method } {
    return this.methods;
  }

  public get_attribute(name: string): attributes.Attribute {
    var attrs = this.attrs;
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      if (attr.name === name) {
        return attr;
      }
    }
    return null;
  }

  public get_attributes(name: string): attributes.Attribute[] {
    var attrs = this.attrs;
    var results : attributes.Attribute[] = [];
    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i];
      if (attr.name === name) {
        results.push(attr);
      }
    }
    return results;
  }

  public get_default_fields(): { [name: string]: any } {
    if (this.default_fields) {
      return this.default_fields;
    }
    this.construct_default_fields();
    return this.default_fields;
  }

  // Handles static fields. We lazily create them, since we cannot initialize static
  // default String values before Ljava/lang/String; is initialized.
  private _initialize_static_field(rs: runtime.RuntimeState, name: string): void {
    var f = this.fl_cache[name];
    if (f != null && f.access_flags["static"]) {
      var cva = <attributes.ConstantValue>f.get_attribute('ConstantValue');
      if (cva != null) {
        var cv = f.type === 'Ljava/lang/String;' ? rs.init_string(cva.value) : cva.value;
      }
      this.static_fields[name] = cv != null ? cv : util.initial_value(f.raw_descriptor);
    } else {
      rs.java_throw(<ReferenceClassData>this.loader.get_initialized_class('Ljava/lang/NoSuchFieldError;'), name);
    }
  }

  public static_get(rs: runtime.RuntimeState, name: string): any {
    if (this.static_fields[name] !== void 0) {
      return this.static_fields[name];
    }
    this._initialize_static_field(rs, name);
    return this.static_get(rs, name);
  }

  public static_put(rs: runtime.RuntimeState, name: string, val: any): void {
    if (this.static_fields[name] !== void 0) {
      this.static_fields[name] = val;
    } else {
      this._initialize_static_field(rs, name);
      this.static_put(rs, name, val);
    }
  }

  public set_resolved(super_class_cdata: ClassData, interface_cdatas: ReferenceClassData[]): void {
    this.super_class_cdata = super_class_cdata;
    trace("Class " + (this.get_type()) + " is now resolved.");
    this.interface_cdatas = interface_cdatas;
    // TODO: Assert we are not already resolved or initialized?
    this.set_state(ClassState.RESOLVED);
  }

  public construct_default_fields(): void {
    // init fields from this and inherited ClassDatas
    var cls = this;
    // Object.create(null) avoids interference with Object.prototype's properties
    this.default_fields = Object.create(null);
    while (cls != null) {
      var fields = cls.fields;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (!(!f.access_flags["static"])) {
          continue;
        }
        var val = util.initial_value(f.raw_descriptor);
        this.default_fields[cls.get_type() + f.name] = val;
      }
      cls = <ReferenceClassData>cls.get_super_class();
    }
  }

  // Spec [5.4.3.2][1].
  // [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#77678
  public field_lookup(rs: runtime.RuntimeState, name: string, null_handled?: boolean): methods.Field {
    var field = this.fl_cache[name];
    if (field != null) {
      return field;
    }
    field = this._field_lookup(rs, name);
    if ((field != null) || null_handled === true) {
      this.fl_cache[name] = field;
      return field;
    }
    var err_cls = <ReferenceClassData> rs.get_bs_class('Ljava/lang/NoSuchFieldError;');
    // Throw exception
    rs.java_throw(err_cls, "No such field found in " + util.ext_classname(this.get_type()) + "::" + name);
    return null;  // java_throw always throws.
  }

  private _field_lookup(rs: runtime.RuntimeState, name: string): methods.Field {
    for (var i = 0; i < this.fields.length; i++) {
      var field = this.fields[i];
      if (field.name === name) {
        return field;
      }
    }
    // These may not be initialized! But we have them loaded.
    var ifaces = this.get_interfaces();
    for (var i = 0; i < ifaces.length; i++) {
      var field = ifaces[i].field_lookup(rs, name, true);
      if (field != null) {
        return field;
      }
    }
    var sc = <ReferenceClassData> this.get_super_class();
    if (sc != null) {
      var field = sc.field_lookup(rs, name, true);
      if (field != null) {
        return field;
      }
    }
    return null;
  }

  // Spec [5.4.3.3][1], [5.4.3.4][2].
  // [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#79473
  // [2]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#78621
  public method_lookup(rs: runtime.RuntimeState, sig: string): methods.Method {
    if (this.ml_cache[sig] != null) {
      return this.ml_cache[sig];
    }
    var method = this._method_lookup(rs, sig);
    if (method == null) {
      var err_cls = <ReferenceClassData> rs.get_bs_class('Ljava/lang/NoSuchMethodError;');
      rs.java_throw(err_cls, "No such method found in " + util.ext_classname(this.get_type()) + "::" + sig);
    }
    if (method.code != null && method.code.exception_handlers != null) {
      var handlers = method.code.exception_handlers;
      for (var i = 0; i < handlers.length; i++) {
        var eh = handlers[i];
        if (!(eh.catch_type === '<any>' || ((this.loader.get_resolved_class(eh.catch_type, true)) != null))) {
          return null; // we found it, but it needs to be resolved
        }
      }
    }
    return method;
  }

  private _method_lookup(rs: runtime.RuntimeState, sig: string): methods.Method {
    if (sig in this.ml_cache) {
      return this.ml_cache[sig];
    }
    if (sig in this.methods) {
      return this.ml_cache[sig] = this.methods[sig];
    }
    var parent = <ReferenceClassData>this.get_super_class();
    if (parent != null) {
      this.ml_cache[sig] = parent._method_lookup(rs, sig);
      if (this.ml_cache[sig] != null) {
        return this.ml_cache[sig];
      }
    }
    var ifaces = this.get_interfaces();
    for (var i = 0; i < ifaces.length; i++) {
      var ifc = ifaces[i];
      this.ml_cache[sig] = ifc._method_lookup(rs, sig);
      if (this.ml_cache[sig] != null) {
        return this.ml_cache[sig];
      }
    }
    return this.ml_cache[sig] = null;
  }

  // this should only be called after method_lookup returns null!
  // in particular, we assume that the method exists and has exception handlers.
  public resolve_method(rs: runtime.RuntimeState, sig: string, success_fn: (mthd:methods.Method)=>void, failure_fn: (e_cb:()=>void)=>void) {
    var _this = this;

    trace("ASYNCHRONOUS: resolve_method " + sig);
    var m = this.method_lookup(rs, sig);
    var handlers = m.code.exception_handlers;
    util.async_foreach(handlers,
      function(eh: attributes.ExceptionHandler, next_item: ()=>void) {
        if (!(eh.catch_type === '<any>' || _this.loader.get_resolved_class(eh.catch_type, true))) {
          _this.loader.resolve_class(rs, eh.catch_type, next_item, failure_fn);
        } else {
          next_item();
        }
      }, ()=>success_fn(m));
  }

  // Returns a boolean indicating if this class is an instance of the target class.
  // "target" is a ClassData object.
  // The ClassData objects do not need to be initialized; just loaded.
  // See §2.6.7 for casting rules.
  public is_castable(target: ClassData): boolean {
    if (!(target instanceof ReferenceClassData)) {
      return false;
    }
    if (this.access_flags["interface"]) {
      // We are both interfaces
      if (target.access_flags["interface"]) {
        return this.is_subinterface(target);
      }
      // Only I am an interface
      if (!target.access_flags["interface"]) {
        return target.get_type() === 'Ljava/lang/Object;';
      }
    } else {
      // I am a regular class, target is an interface
      if (target.access_flags["interface"]) {
        return this.is_subinterface(target);
      }
      // We are both regular classes
      return this.is_subclass(target);
    }
  }

  // Returns 'true' if I implement the target interface.
  public is_subinterface(target: ClassData): boolean {
    if (this.this_class === target.this_class) {
      return true;
    }
    var ifaces = this.get_interfaces();
    for (var i = 0; i < ifaces.length; i++) {
      var super_iface = ifaces[i];
      if (super_iface.is_subinterface(target)) {
        return true;
      }
    }
    if (this.get_super_class() == null) {
      return false;
    }
    return this.get_super_class().is_subinterface(target);
  }
}
