"use strict";
import gLong = require('./gLong');
import threading = require('./threading');
import enums = require('./enums');
import JVMTypes = require('../includes/JVMTypes');

// For type information
import ClassLoader = require('./ClassLoader');
import ClassData = require('./ClassData');

/**
 * util contains stateless utility functions that are used around Doppio's
 * codebase.
 * TODO: Separate general JS utility methods from JVM utility methods.
 */

/**
 * Merges object literals together into a new object. Emulates underscore's merge function.
 */
export function merge(...literals: {[prop: string]: any}[]): {[prop: string]: any} {
  var newObject: {[prop: string]: any} = {};
  literals.forEach((literal) => {
    Object.keys(literal).forEach((key) => {
      newObject[key] = literal[key];
    });
  });
  return newObject;
}

export function are_in_browser(): boolean {
  return process.platform === 'browser';
}

export var typedArraysSupported: boolean = typeof ArrayBuffer !== "undefined";

/**
 * Converts JVM internal names into JS-safe names. Only for use with reference
 * types.
 * Ljava/lang/Object; => java_lang_Object
 * Lfoo/Bar_baz; => foo_Bar__baz
 *
 * Is NOT meant to be unambiguous!
 *
 * Also handles the special characters described here:
 * https://blogs.oracle.com/jrose/entry/symbolic_freedom_in_the_vm
 */
export function jvmName2JSName(jvmName: string): string {
  switch (jvmName[0]) {
    case 'L':
      return jvmName.slice(1, jvmName.length - 1).replace(/_/g, '__')
        // Remove / replace characters that are invalid for JS symbols.
        .replace(/[\/.;$<>\[\]:\\=^-]/g, '_');
    case '[':
      return `ARR_${jvmName2JSName(jvmName.slice(1))}`;
    default:
      return jvmName;
  }
}

/**
 * Re-escapes JVM names for eval'd code. Otherwise, JavaScript removes the escapes.
 */
export function reescapeJVMName(jvmName: string): string {
  return jvmName.replace(/\\/g, '\\\\');
}

/**
 * Applies an async function to each element of a list, in order.
 */
export function asyncForEach<T>(
      lst: Array<T>,
      fn: (elem: T, next_item: (err?: any) => void) => void,
      done_cb: (err?: any) => void
  ): void {
  var i = -1;
  function process(err?: any): void {
    if (err) {
      done_cb(err);
    } else {
      i++;
      if (i < lst.length) {
        fn(lst[i], process);
      } else {
        done_cb();
      }
    }
  }
  process();
}

/**
 * Runs the specified tasks in series.
 */
export function asyncSeries(tasks: {(next: (err?: any) => void): void}[], doneCb: (err?: any) => void) {
  var i = -1;
  function process(err?: any): void {
    if (err) {
      doneCb(err);
    } else {
      i++;
      if (i < tasks.length) {
        tasks[i](process);
      } else {
        doneCb();
      }
    }
  }
  process();
}

/**
 * Applies the function to each element of the list in order in series.
 * The first element that returns success halts the process, and triggers
 * done_cb. If no elements return success, done_cb is triggered with no
 * arguments.
 *
 * I wrote this specifically for classloading, but it may have uses elsewhere.
 */
export function asyncFind<T>(
    lst: Array<T>,
    fn: (elem: T, nextItem: (success: boolean) => void) => void,
    done_cb: (elem?: T) => void
  ): void {
  var i = -1;
  function process(success: boolean): void {
    if (success) {
      done_cb(lst[i]);
    } else {
      i++;
      if (i < lst.length) {
        fn(lst[i], process);
      } else {
        done_cb();
      }
    }
  }
  process(false);
}

if (!(<any> Math)['imul']) {
  (<any> Math)['imul'] = function(a: number, b: number) {
    // polyfill from https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/imul
    var ah = (a >>> 16) & 0xffff;
    var al = a & 0xffff;
    var bh = (b >>> 16) & 0xffff;
    var bl = b & 0xffff;
    // the shift by 0 fixes the sign on the high part
    // the final |0 converts the unsigned value into a signed value
    return ((al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0);
  };
}

if (!(<any> Math)['expm1']) {
  (<any> Math)['expm1'] = function(x: number): number {
    if (Math.abs(x) < 1e-5) {
      return x + 0.5*x*x;
    } else {
      return Math.exp(x) - 1.0;
    }
  };
}

if (!(<any> Math)['sinh']){
  (<any> Math)['sinh'] = function(a: number): number {
    var exp = Math.exp(a);
    return (exp - 1 / exp) / 2;
  }
}

if (!Array.prototype.indexOf) {
  Array.prototype.indexOf = function (searchElement, fromIndex?) {
    if (this == null) {
      throw new TypeError();
    }
    var t = Object(this);
    var len = t.length >>> 0;

    if (len === 0) {
      return -1;
    }
    var n = 0;
    if (fromIndex !== undefined) {
      n = Number(fromIndex);
      if (n != n) { // shortcut for verifying if it's NaN
        n = 0;
      } else if (n != 0 && n != Infinity && n != -Infinity) {
        n = ((n > 0 ? 1 : 0) || -1) * Math.floor(Math.abs(n));
      }
    }
    if (n >= len) {
      return -1;
    }
    var k = n >= 0 ? n : Math.max(len - Math.abs(n), 0);
    for (; k < len; k++) {
      if (k in t && t[k] === searchElement) {
        return k;
      }
    }
    return -1;
  };
}

/**
 * Checks if accessingCls has permission to a field or method with the given
 * flags on owningCls.
 *
 * Modifier    | Class | Package | Subclass | World
 * ————————————+———————+—————————+——————————+———————
 * public      |  y    |    y    |    y     |   y
 * ————————————+———————+—————————+——————————+———————
 * protected   |  y    |    y    |    y     |   n
 * ————————————+———————+—————————+——————————+———————
 * no modifier |  y    |    y    |    n     |   n
 * ————————————+———————+—————————+——————————+———————
 * private     |  y    |    n    |    n     |   n
 *
 * y: accessible
 * n: not accessible
 */
export function checkAccess(accessingCls: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, owningCls: ClassData.ReferenceClassData<JVMTypes.java_lang_Object>, accessFlags: Flags): boolean {
  if (accessFlags.isPublic()) {
    return true;
  } else if (accessFlags.isProtected()) {
    return accessingCls.getPackageName() === owningCls.getPackageName() || accessingCls.isSubclass(owningCls);
  } else if (accessFlags.isPrivate()) {
    return accessingCls === owningCls;
  } else {
    return accessingCls.getPackageName() === owningCls.getPackageName();
  }
}

/**
 * Truncates a floating point into an integer.
 */
export function float2int(a: number): number {
  if (a > enums.Constants.INT_MAX) {
    return enums.Constants.INT_MAX;
  } else if (a < enums.Constants.INT_MIN) {
    return enums.Constants.INT_MIN;
  } else {
    return a | 0;
  }
}

var supportsArrayBuffers = typeof(ArrayBuffer) !== 'undefined';

/**
 * Converts a byte array to a buffer. **Copies.**
 */
export function byteArray2Buffer(bytes: number[] | Int8Array, offset: number = 0, len: number = bytes.length): NodeBuffer {
  if (supportsArrayBuffers && ArrayBuffer.isView(bytes)) {
    let offset = (<Int8Array> bytes).byteOffset;
    return new Buffer(<any> (<Int8Array> bytes).buffer.slice(offset, offset + bytes.length));
  } else {
    var buff = new Buffer(len), i: number;
    for (i = 0; i < len; i++) {
      buff.writeInt8(bytes[offset + i], i);
    }
    return buff;
  }
}

// Call this ONLY on the result of two non-NaN numbers.
export function wrapFloat(a: number): number {
  if (a > 3.40282346638528860e+38) {
    return Number.POSITIVE_INFINITY;
  }
  if (0 < a && a < 1.40129846432481707e-45) {
    return 0;
  }
  if (a < -3.40282346638528860e+38) {
    return Number.NEGATIVE_INFINITY;
  }
  if (0 > a && a > -1.40129846432481707e-45) {
    return 0;
  }
  return a;
}

// Convert :count chars starting from :offset in a Java character array into a JS string
export function chars2jsStr(jvmCarr: JVMTypes.JVMArray<number>, offset: number = 0, count: number = jvmCarr.array.length): string {
  var i : number, carrArray = jvmCarr.array, rv = "", endOffset = offset + count;
  for (i = offset; i < endOffset; i++) {
    rv += String.fromCharCode(carrArray[i]);
  }
  return rv;
}

// TODO: Is this used anywhere where we are *not* inserting the bytestr into
// a JVMArray object?
// TODO: Could inject this as a static String method...
export function bytestr2Array(byteStr: string): number[] {
  var rv : number[] = [];
  for (var i = 0; i < byteStr.length; i++) {
    rv.push(byteStr.charCodeAt(i));
  }
  return rv;
}

export function array2bytestr(byteArray: number[]): string {
  // XXX: We'd like to use String.fromCharCode(bytecode_array...)
  //  but that fails on Webkit with arrays longer than 2^31. See issue #129 for details.
  var rv = '';
  for (var i = 0; i < byteArray.length; i++) {
    rv += String.fromCharCode(byteArray[i]);
  }
  return rv;
}

/**
 * Bit masks for the flag byte.
 */
export enum FlagMasks {
  PUBLIC = 0x1,
  PRIVATE = 0x2,
  PROTECTED = 0x4,
  STATIC = 0x8,
  FINAL = 0x10,
  SYNCHRONIZED = 0x20,
  SUPER = 0x20,
  VOLATILE = 0x40,
  TRANSIENT = 0x80,
  VARARGS = 0x80,
  NATIVE = 0x100,
  INTERFACE = 0x200,
  ABSTRACT = 0x400,
  STRICT = 0x800
}

/**
 * Represents a 'flag byte'. See �4 of the JVM spec.
 * @todo Separate METHOD flags and CLASS flags.
 */
export class Flags {
  private byte: number;
  constructor(byte: number) {
    this.byte = byte;
  }

  public isPublic(): boolean {
    return (this.byte & FlagMasks.PUBLIC) > 0;
  }

  public isPrivate(): boolean {
    return (this.byte & FlagMasks.PRIVATE) > 0;
  }

  public isProtected(): boolean {
    return (this.byte & FlagMasks.PROTECTED) > 0;
  }

  public isStatic(): boolean {
    return (this.byte & FlagMasks.STATIC) > 0;
  }

  public isFinal(): boolean {
    return (this.byte & FlagMasks.FINAL) > 0;
  }

  public isSynchronized(): boolean {
    return (this.byte & FlagMasks.SYNCHRONIZED) > 0;
  }

  public isSuper(): boolean {
    return (this.byte & FlagMasks.SUPER) > 0;
  }

  public isVolatile(): boolean {
    return (this.byte & FlagMasks.VOLATILE) > 0;
  }

  public isTransient(): boolean {
    return (this.byte & FlagMasks.TRANSIENT) > 0;
  }

  public isNative(): boolean {
    return (this.byte & FlagMasks.NATIVE) > 0;
  }

  public isInterface(): boolean {
    return (this.byte & FlagMasks.INTERFACE) > 0;
  }

  public isAbstract(): boolean {
    return (this.byte & FlagMasks.ABSTRACT) > 0;
  }

  public isStrict(): boolean {
    return (this.byte & FlagMasks.STRICT) > 0;
  }

  /**
   * Changes a function to native. Used for trapped methods.
   */
  public setNative(n: boolean): void {
    if (n) {
      this.byte = this.byte | FlagMasks.NATIVE;
    } else {
      this.byte = this.byte & (~FlagMasks.NATIVE);
    }
  }

  public isVarArgs(): boolean {
    return (this.byte & FlagMasks.VARARGS) > 0;
  }

  public getRawByte(): number {
    return this.byte;
  }
}

export function initialValue(type_str: string): any {
  if (type_str === 'J') return gLong.ZERO;
  var c = type_str[0];
  if (c === '[' || c === 'L') return null;
  return 0;
}

/**
 * Java classes are represented internally using slashes as delimiters.
 * These helper functions convert between the two representations.
 * Ljava/lang/Class; => java.lang.Class
 */
export function ext_classname(str: string): string {
  return descriptor2typestr(str).replace(/\//g, '.');
}

/**
 * java.lang.Class => Ljava/lang/Class;
 */
export function int_classname(str: string): string {
  return typestr2descriptor(str.replace(/\./g, '/'));
}

export function verify_int_classname(str: string): boolean {
  var array_nesting = str.match(/^\[*/)[0].length;
  if (array_nesting > 255) {
    return false;
  }
  if (array_nesting > 0) {
    str = str.slice(array_nesting);
  }
  if (str[0] === 'L') {
    if (str[str.length - 1] !== ';') {
      return false;
    }
    str = str.slice(1, -1);
  }
  if (str in internal2external) {
    return true;
  }
  if (str.match(/\/{2,}/)) {
    return false;
  }
  var parts = str.split('/');
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].match(/[^$_a-z0-9]/i)) {
      return false;
    }
  }
  return true;
}

export var internal2external: { [internalType: string]: string } = {
  B: 'byte',
  C: 'char',
  D: 'double',
  F: 'float',
  I: 'int',
  J: 'long',
  S: 'short',
  V: 'void',
  Z: 'boolean'
};

export var external2internal: { [externalType: string]: string } = {};
for (var k in internal2external) {
  external2internal[internal2external[k]] = k;
}

/**
 * Given a method descriptor, returns the typestrings for the return type
 * and the parameters.
 *
 * e.g. (Ljava/lang/Class;Z)Ljava/lang/String; =>
 *        ["Ljava/lang/Class;", "Z", "Ljava/lang/String;"]
 */
export function getTypes(methodDescriptor: string): string[] {
  var i = 0, types: string[] = [], endIdx: number;
  for (i = 0; i < methodDescriptor.length; i++) {
    switch (methodDescriptor.charAt(i)) {
      case '(':
      case ')':
        //Skip.
        break;
      case 'L':
        // Reference type.
        endIdx = methodDescriptor.indexOf(';', i);
        types.push(methodDescriptor.slice(i, endIdx + 1));
        i = endIdx;
        break;
      case '[':
        endIdx = i + 1;
        // Find the start of the component.
        while (methodDescriptor.charAt(endIdx) === '[') {
          endIdx++;
        }
        if (methodDescriptor.charAt(endIdx) === 'L') {
          // Reference component. Read ahead to end.
          endIdx = methodDescriptor.indexOf(';', endIdx);
          types.push(methodDescriptor.slice(i, endIdx + 1));
        } else {
          // Primitive component.
          types.push(methodDescriptor.slice(i, endIdx + 1));
        }
        i = endIdx;
        break;
      default:
        // Primitive type.
        types.push(methodDescriptor.charAt(i));
        break;
    }
  }
  return types;
}

// Get the component type of an array type string.
// Cut off the [L and ; for arrays of classes.
export function get_component_type(type_str: string): string {
  return type_str.slice(1);
}

export function is_array_type(type_str: string): boolean {
  return type_str[0] === '[';
}

export function is_primitive_type(type_str: string): boolean {
  return type_str in internal2external;
}

export function is_reference_type(type_str: string): boolean {
  return type_str[0] === 'L';
}

/**
 * Converts type descriptors into standardized internal type strings.
 * Ljava/lang/Class; => java/lang/Class   Reference types
 * [Ljava/lang/Class; is unchanged        Array types
 * C => char                              Primitive types
 */
export function descriptor2typestr(type_str: string): string {
  var c = type_str[0];
  if (c in internal2external) return internal2external[c];
  if (c === 'L') return type_str.slice(1, -1);
  if (c === '[') return type_str;
  // no match
  throw new Error("Unrecognized type string: " + type_str);
}

// Takes a character array of concatenated type descriptors and returns/removes the first one.
export function carr2descriptor(carr: string[]): string {
  var c = carr.shift();
  if (c == null) return null;
  if (internal2external[c] !== void 0) return c;
  if (c === 'L') {
    var rv = 'L';
    while ((c = carr.shift()) !== ';') {
      rv += c;
    }
    return rv + ';';
  }
  if (c === '[') return "[" + carr2descriptor(carr);
  // no match
  carr.unshift(c);
  throw new Error("Unrecognized descriptor: " + carr.join(''));
}

// Converts internal type strings into type descriptors. Reverse of descriptor2typestr.
export function typestr2descriptor(type_str: string): string {
  if (external2internal[type_str] !== void 0) {
    return external2internal[type_str];
  } else if (type_str[0] === '[') {
    return type_str;
  } else {
    return "L" + type_str + ";";
  }
}

/**
 * Java's reflection APIs need to unbox primitive arguments to function calls,
 * as they are boxed in an Object array. This utility function converts
 * an array of arguments into the appropriate form prior to function invocation.
 * Note that this includes padding category 2 primitives, which consume two
 * slots in the array (doubles/longs).
 */
export function unboxArguments(thread: threading.JVMThread, paramTypes: string[], args: JVMTypes.java_lang_Object[]): any[] {
  var rv: any[] = [], i: number, type: string, arg: JVMTypes.java_lang_Object;
  for (i = 0; i < paramTypes.length; i++) {
    type = paramTypes[i];
    arg = args[i];
    if (is_primitive_type(type)) {
      // Unbox the primitive type.
      // TODO: Precisely type this better. Once TypeScript lets you import
      // union types, we can define a "JVMPrimitive" type...
      rv.push((<JVMTypes.java_lang_Integer> arg).unbox());
      if (type === 'J' || type === 'D') {
        // 64-bit primitives take up two argument slots. Doppio uses a NULL for the second slot.
        rv.push(null);
      }
    } else {
      // Reference type; do not change.
      rv.push(arg);
    }
  }
  return rv;
}

/**
 * Given a method descriptor as a JS string, returns a corresponding MethodType
 * object.
 */
export function createMethodType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, descriptor: string, cb: (e: JVMTypes.java_lang_Throwable, type: JVMTypes.java_lang_invoke_MethodType) => void) {
  cl.initializeClass(thread, 'Ljava/lang/invoke/MethodHandleNatives;', (cdata: ClassData.ReferenceClassData<JVMTypes.java_lang_invoke_MethodHandleNatives>) => {
    if (cdata !== null) {
      var jsCons = <typeof JVMTypes.java_lang_invoke_MethodHandleNatives> cdata.getConstructor(thread), classes = getTypes(descriptor);
      classes.push('[Ljava/lang/Class;');
      // Need the return type and parameter types.
      cl.resolveClasses(thread, classes, (classMap: { [name: string]: ClassData.ClassData }) => {
        var types = classes.map((cls: string) => classMap[cls].getClassObject(thread));
        types.pop(); // Discard '[Ljava/lang/Class;'
        var rtype = types.pop(), // Return type.
          clsArrCons = (<ClassData.ArrayClassData<JVMTypes.java_lang_Class>> classMap['[Ljava/lang/Class;']).getConstructor(thread),
          ptypes = new clsArrCons(thread, types.length);
        ptypes.array = types;

        jsCons['java/lang/invoke/MethodHandleNatives/findMethodHandleType(Ljava/lang/Class;[Ljava/lang/Class;)Ljava/lang/invoke/MethodType;'](thread, [rtype, ptypes], cb);
      });
    }
  });
}

/**
 * Given a method descriptor, returns the number of words required to store
 * its arguments.
 * Does not include considerations for e.g. the 'this' argument, since the
 * descriptor does not specify if the method is static or not.
 */
export function getMethodDescriptorWordSize(descriptor: string): number {
  var parsedDescriptor = getTypes(descriptor),
    words = parsedDescriptor.length - 1, i: number, p: string;
  // Remove return type.
  parsedDescriptor.pop();

  // Double count doubles / longs.
  for (i = 0; i < parsedDescriptor.length; i++) {
    p = parsedDescriptor[i];
    if (p === 'D' || p === 'J') {
      words++;
    }
  }

  return words;
}

/**
 * Given a return type as a Class object, and an array of class objects for
 * parameter types, returns the descriptor string for the method type.
 */
export function getDescriptorString(rtype: JVMTypes.java_lang_Class, ptypes?: JVMTypes.JVMArray<JVMTypes.java_lang_Class>): string {
  var rv = "(";
  if (ptypes !== undefined && ptypes !== null) {
    ptypes.array.forEach((ptype: JVMTypes.java_lang_Class) => {
      rv += ptype.$cls.getInternalName();
    });
  }
  rv += ")" + rtype.$cls.getInternalName();
  return rv;
}


/**
 * Have a JavaClassLoaderObject and need its ClassLoader object? Use this method!
 * @todo Install on Java ClassLoader objects.
 */
export function getLoader(thread: threading.JVMThread, jclo: JVMTypes.java_lang_ClassLoader): ClassLoader.ClassLoader {
  if ((jclo != null) && (jclo.$loader != null)) {
    return jclo.$loader;
  }
  return thread.getBsCl();
}

/**
 * "Fast" array copy; does not have to check every element for illegal
 * assignments. You can do tricks here (if possible) to copy chunks of the array
 * at a time rather than element-by-element.
 * This function *cannot* access any attribute other than 'array' on src due to
 * the special case when src == dest (see code for System.arraycopy below).
 */
export function arraycopyNoCheck(src: JVMTypes.JVMArray<any>, srcPos: number, dest: JVMTypes.JVMArray<any>, destPos: number, length: number): void {
  var j = destPos;
  var end = srcPos + length;
  for (var i = srcPos; i < end; i++) {
    dest.array[j++] = src.array[i];
  }
}

/**
 * "Slow" array copy; has to check every element for illegal assignments.
 * You cannot do any tricks here; you must copy element by element until you
 * have either copied everything, or encountered an element that cannot be
 * assigned (which causes an exception).
 * Guarantees: src and dest are two different reference types. They cannot be
 *             primitive arrays.
 */
export function arraycopyCheck(thread: threading.JVMThread, src: JVMTypes.JVMArray<JVMTypes.java_lang_Object>, srcPos: number, dest: JVMTypes.JVMArray<JVMTypes.java_lang_Object>, destPos: number, length: number): void {
  var j = destPos;
  var end = srcPos + length;
  var destCompCls = dest.getClass().getComponentClass();
  for (var i = srcPos; i < end; i++) {
    // Check if null or castable.
    if (src.array[i] === null || src.array[i].getClass().isCastable(destCompCls)) {
      dest.array[j] = src.array[i];
    } else {
      thread.throwNewException('Ljava/lang/ArrayStoreException;', 'Array element in src cannot be cast to dest array type.');
      return;
    }
    j++;
  }
}

export function initString(cl: ClassLoader.ClassLoader, str: string): JVMTypes.java_lang_String {
  var carr = initCarr(cl, str);
  var strCons = (<ClassData.ReferenceClassData<JVMTypes.java_lang_String>> cl.getResolvedClass('Ljava/lang/String;')).getConstructor(null);
  var strObj = new strCons(null);
  strObj['java/lang/String/value'] = carr;
  return strObj;
}

export function initCarr(cl: ClassLoader.ClassLoader, str: string): JVMTypes.JVMArray<number> {
  var arrClsCons = (<ClassData.ArrayClassData<number>> cl.getInitializedClass(null, '[C')).getConstructor(null),
    carr = new arrClsCons(null, str.length),
    carrArray = carr.array;

  for (var i = 0; i < str.length; i++) {
    carrArray[i] = str.charCodeAt(i);
  }

  return carr;
}

export function newArrayFromClass<T>(thread: threading.JVMThread, clazz: ClassData.ArrayClassData<T>, length: number): JVMTypes.JVMArray<T> {
  return new (clazz.getConstructor(thread))(thread, length);
}

export function newArray<T>(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, desc: string, length: number): JVMTypes.JVMArray<T> {
  var cls = <ClassData.ArrayClassData<T>> cl.getInitializedClass(thread, desc);
  return newArrayFromClass(thread, cls, length);
}

/**
 * Separate from newArray to avoid programming mistakes where newArray and newArrayFromData are conflated.
 */
export function multiNewArray<T>(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, desc: string, lengths: number[]): JVMTypes.JVMArray<T> {
  var cls = <ClassData.ArrayClassData<T>> cl.getInitializedClass(thread, desc);
  return new (cls.getConstructor(thread))(thread, lengths);
}

export function newObjectFromClass<T extends JVMTypes.java_lang_Object>(thread: threading.JVMThread, clazz: ClassData.ReferenceClassData<T>) {
  return new (clazz.getConstructor(thread))(thread);
}

export function newObject<T extends JVMTypes.java_lang_Object>(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, desc: string): T {
  var cls = <ClassData.ReferenceClassData<T>> cl.getInitializedClass(thread, desc);
  return newObjectFromClass(thread, cls);
}

export function getStaticFields<T>(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, desc: string): T {
  return <T> <any> (<ClassData.ReferenceClassData<JVMTypes.java_lang_Object>> cl.getInitializedClass(thread, desc)).getConstructor(thread);
}

export function newArrayFromDataWithClass<T>(thread: threading.JVMThread, cls: ClassData.ArrayClassData<T>, data: T[]): JVMTypes.JVMArray<T> {
  var arr = newArrayFromClass<T>(thread, cls, 0);
  arr.array = data;
  return arr;
}

export function newArrayFromData<T>(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, desc: string, data: T[]): JVMTypes.JVMArray<T> {
  var arr = newArray<T>(thread, cl, desc, 0);
  arr.array = data;
  return arr;
}

/**
 * Returns the boxed class name of the given primitive type.
 */
export function boxClassName(primType: string): string {
  switch (primType) {
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
 * Boxes the given primitive value.
 */
export function boxPrimitiveValue(thread: threading.JVMThread, type: string, val: any): JVMTypes.java_lang_Integer {
  // XXX: We assume Integer for typing purposes only; avoids a huge union type.
  var primCls = <ClassData.ReferenceClassData<JVMTypes.java_lang_Integer>> thread.getBsCl().getInitializedClass(thread, boxClassName(type)),
   primClsCons = <typeof JVMTypes.java_lang_Integer> primCls.getConstructor(thread);
  return primClsCons.box(val);
}

/**
 * Boxes the given arguments into an Object[].
 *
 * @param descriptor The descriptor at the *call site*.
 * @param data The actual arguments for this function call.
 * @param isStatic If false, disregard the first type in the descriptor, as it is the 'this' argument.
 */
export function boxArguments(thread: threading.JVMThread, objArrCls: ClassData.ArrayClassData<JVMTypes.java_lang_Object>, descriptor: string, data: any[], isStatic: boolean, skipArgs: number = 0): JVMTypes.JVMArray<JVMTypes.java_lang_Object> {
  var paramTypes = getTypes(descriptor),
    boxedArgs = newArrayFromClass(thread, objArrCls, paramTypes.length - (isStatic ? 1 : 2) - skipArgs),
    i: number, j: number = 0, boxedArgsArr = boxedArgs.array, type: string;

  // Ignore return value.
  paramTypes.pop();
  if (!isStatic) {
    // Ignore 'this' argument.
    paramTypes.shift();
  }

  if (skipArgs > 0) {
    // Ignore regular arguments
    paramTypes = paramTypes.slice(skipArgs);
    data = data.slice(skipArgs);
  }

  for (i = 0; i < paramTypes.length; i++) {
    type = paramTypes[i];
    switch(type[0]) {
      case '[':
      case 'L':
        // Single argument slot, no boxing required.
        boxedArgsArr[i] = data[j];
        break;
      case 'J':
      case 'D':
        boxedArgsArr[i] = boxPrimitiveValue(thread, type, data[j]);
        j++;
        break;
      default:
        boxedArgsArr[i] = boxPrimitiveValue(thread, type, data[j]);
        break;
    }
    j++;
  }

  return boxedArgs;
}

export function forwardResult<T extends JVMTypes.java_lang_Object>(thread: threading.JVMThread): (e?: JVMTypes.java_lang_Throwable, rv?: T) => void {
  return (e?: JVMTypes.java_lang_Throwable, rv?: T): void => {
    if (e) {
      thread.throwException(e);
    } else {
      thread.asyncReturn(rv);
    }
  };
}
