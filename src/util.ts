"use strict";
import gLong = require('./gLong');
import java_object = require('./java_object');
import threading = require('./threading');
import enums = require('./enums');

// For type information
import ClassLoader = require('./ClassLoader');
import ClassData = require('./ClassData');

export function are_in_browser(): boolean {
  return process.platform === 'browser';
}

// Applies an async function to each element of a list, in order.
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

if (Math['imul'] == null) {
  Math['imul'] = function(a: number, b: number) {
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

// Creates and initializes *JavaScript* array to *val* in each element slot.
// Like memset, but for arrays.
export function arrayset<T>(len: number, val : T): T[] {
  var array = new Array(len);
  for (var i = 0; i < len; i++) {
    array[i] = val;
  }
  return array;
}

export function float2int(a: number): number {
  if (a > enums.Constants.INT_MAX) {
    return enums.Constants.INT_MAX;
  } else if (a < enums.Constants.INT_MIN) {
    return enums.Constants.INT_MIN;
  } else {
    return a | 0;
  }
}

/**
 * Converts a byte array to a buffer.
 */
export function byteArray2Buffer(bytes: number[], offset: number = 0, len: number = bytes.length): NodeBuffer {
  var buff = new Buffer(len), i: number;
  for (i = 0; i < len; i++) {
    buff.writeInt8(bytes[offset + i], i);
  }
  return buff;
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
export function chars2jsStr(jvmCarr: java_object.JavaArray, offset?: number, count?: number): string {
  var off = offset || 0;
  return bytes2str(jvmCarr.array).substr(off, count);
}

export function bytestr2Array(byteStr: string): number[] {
  var rv : number[] = [];
  for (var i = 0; i < byteStr.length; i++) {
    rv.push(byteStr.charCodeAt(i) & 0xFF);
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

export var internal2external = {
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

export var external2internal = {};
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

// Parse Java's pseudo-UTF-8 strings. (spec 4.4.7)
export function bytes2str(bytes: number[], null_terminate?: boolean): string {
  var y : number;
  var z : number;

  var idx = 0;
  var rv = '';
  while (idx < bytes.length) {
    var x = bytes[idx++] & 0xff;
    if (null_terminate && x == 0) {
      break;
    }
    rv += String.fromCharCode(x <= 0x7f ? x : x <= 0xdf ? (y = bytes[idx++], ((x & 0x1f) << 6) + (y & 0x3f)) : (y = bytes[idx++], z = bytes[idx++], ((x & 0xf) << 12) + ((y & 0x3f) << 6) + (z & 0x3f)));
  }
  return rv;
}

/**
 * Java's reflection APIs need to unbox primitive arguments to function calls,
 * as they are boxed in an Object array. This utility function converts
 * an array of arguments into the appropriate form prior to function invocation.
 * Note that this includes padding category 2 primitives, which consume two
 * slots in the array (doubles/longs).
 */
export function unboxArguments(thread: threading.JVMThread, paramTypes: string[], args: java_object.JavaObject[]): any[] {
  var rv: any[] = [], i: number, type: string, arg: java_object.JavaObject;
  for (i = 0; i < paramTypes.length; i++) {
    type = paramTypes[i];
    arg = args[i];
    if (is_primitive_type(type)) {
      // Unbox the primitive type.
      rv.push(arg.get_field(thread, arg.cls.getInternalName() + 'value'));
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
export function createMethodType(thread: threading.JVMThread, cl: ClassLoader.ClassLoader, descriptor: string, cb: (e: any, type: java_object.JavaObject) => void) {
  cl.initializeClass(thread, 'Ljava/lang/invoke/MethodHandleNatives;', (cdata: ClassData.ClassData) => {
    if (cdata !== null) {
      var makeImpl = cdata.methodLookup(thread, 'findMethodHandleType(Ljava/lang/Class;[Ljava/lang/Class;)Ljava/lang/invoke/MethodType;'),
      classes = getTypes(descriptor);
      classes.push('[Ljava/lang/Class;');
      // Need the return type and parameter types.
      cl.resolveClasses(thread, classes, (classMap: { [name: string]: ClassData.ClassData }) => {
        var types = classes.map((cls: string) => classMap[cls].getClassObject(thread));
        types.pop(); // Discard '[Ljava/lang/Class;'
        var rtype = types.pop(), // Return type.
          ptypes = (<ClassData.ArrayClassData> classMap['[Ljava/lang/Class;']).create(types);
        thread.runMethod(makeImpl, [rtype, ptypes], (e?: java_object.JavaObject, methodTypeObj?: java_object.JavaObject) => {
          if (e) {
            thread.throwException(e);
          } else {
            cb(null, methodTypeObj);
          }
        });
      });
    }
  });
}

/**
 * Given a return type as a Class object, and an array of class objects for
 * parameter types, returns the descriptor string for the method type.
 */
export function getDescriptorString(rtype: java_object.JavaClassObject, ptypes?: java_object.JavaArray): string {
  var rv = "(";
  if (ptypes !== undefined && ptypes !== null) {
    ptypes.array.forEach((ptype: java_object.JavaClassObject) => {
      rv += ptype.$cls.getInternalName();
    });
  }
  rv += ")" + rtype.$cls.getInternalName();
  return rv;
}
