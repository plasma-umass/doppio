"use strict";
import gLong = require('./gLong');
import runtime = require('./runtime');
import java_object = require('./java_object');
import ClassData = require('./ClassData');

export function are_in_browser(): boolean {
  return process.platform === 'browser';
}

// Applies an async function to each element of a list, in order.
// Assumes that the async function expects "success" and "fail" callbacks.
export function async_foreach<T>(
      lst: Array<T>,
      fn: (elem: T, next_item: ()=>void)=>void,
      done_cb: ()=>void
    ): void {
  var i = -1;
  function process(): void {
    i++;
    if (i < lst.length) {
      fn(lst[i], process);
    } else {
      done_cb();
    }
  }
  process();
}

export var INT_MAX = Math.pow(2, 31) - 1;
export var INT_MIN = -INT_MAX - 1;
export var FLOAT_POS_INFINITY = Math.pow(2, 128);
export var FLOAT_NEG_INFINITY = -1 * FLOAT_POS_INFINITY;
export var FLOAT_POS_INFINITY_AS_INT = 0x7F800000;
export var FLOAT_NEG_INFINITY_AS_INT = -8388608;
// We use the JavaScript NaN as our NaN value, and convert it to
// a NaN value in the SNaN range when an int equivalent is requested.
export var FLOAT_NaN_AS_INT = 0x7fc00000;

if (Math['imul'] == null) {
  Math['imul'] = function(a: number, b: number) {
    // polyfill from https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/imul
    var ah = (a >>> 16) & 0xffff;
    var al = a & 0xffff;
    var bh = (b >>> 16) & 0xffff;
    var bl = b & 0xffff;
    // the shift by 0 fixes the sign on the high part, and the |0 prevents
    // overflow on the high part.
    return (al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0;
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
  }
}

// Creates and initializes *JavaScript* array to *val* in each element slot.
// Like memset, but for arrays.
export function arrayset<T>(len: number, val :T): T[] {
  var array = new Array(len);
  for (var i = 0; i < len; i++) {
    array[i] = val;
  }
  return array;
}

export function int_mod(rs: runtime.RuntimeState, a: number, b: number): number {
  if (b === 0) {
    var err_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArithmeticException;');
    rs.java_throw(err_cls, '/ by zero');
  }
  return a % b;
}

export function int_div(rs: runtime.RuntimeState, a: number, b: number): number {
  if (b === 0) {
    var err_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArithmeticException;');
    rs.java_throw(err_cls, '/ by zero');
  }
  // spec: "if the dividend is the negative integer of largest possible magnitude
  // for the int type, and the divisor is -1, then overflow occurs, and the
  // result is equal to the dividend."
  if (a === INT_MIN && b === -1) {
    return a;
  }
  return (a / b) | 0;
}

export function long_mod(rs: runtime.RuntimeState, a: gLong, b: gLong): gLong {
  if (b.isZero()) {
    var err_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArithmeticException;');
    rs.java_throw(err_cls, '/ by zero');
  }
  return a.modulo(b);
}

export function long_div(rs: runtime.RuntimeState, a: gLong, b: gLong): gLong {
  if (b.isZero()) {
    var err_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArithmeticException;');
    rs.java_throw(err_cls, '/ by zero');
  }
  return a.div(b);
}

export function float2int(a: number): number {
  if (a > INT_MAX) {
    return INT_MAX;
  } else if (a < INT_MIN) {
    return INT_MIN;
  } else {
    return a | 0;
  }
}

export function intbits2float(int32: number): number {
  if (typeof Int32Array !== "undefined") {
    var i_view = new Int32Array([int32]);
    var f_view = new Float32Array(i_view.buffer);
    return f_view[0];
  }
  // Fallback for older JS engines

  // Map +/- infinity to JavaScript equivalents
  if (int32 === FLOAT_POS_INFINITY_AS_INT) {
    return Number.POSITIVE_INFINITY;
  } else if (int32 === FLOAT_NEG_INFINITY_AS_INT) {
    return Number.NEGATIVE_INFINITY;
  }
  var sign = (int32 & 0x80000000) >>> 31;
  var exponent = (int32 & 0x7F800000) >>> 23;
  var significand = int32 & 0x007FFFFF;
  var value : number;
  if (exponent === 0) {  // we must denormalize!
    value = Math.pow(-1, sign) * significand * Math.pow(2, -149);
  } else {
    value = Math.pow(-1, sign) * (1 + significand * Math.pow(2, -23)) * Math.pow(2, exponent - 127);
  }
  // NaN check
  if (value < FLOAT_NEG_INFINITY || value > FLOAT_POS_INFINITY) {
    value = NaN;
  }
  return value;
}

export function longbits2double(uint32_a: number, uint32_b: number): number {
  if (typeof Uint32Array !== "undefined") {
    var i_view = new Uint32Array(2);
    i_view[0] = uint32_b;
    i_view[1] = uint32_a;
    var d_view = new Float64Array(i_view.buffer);
    return d_view[0];
  }
  var sign = (uint32_a & 0x80000000) >>> 31;
  var exponent = (uint32_a & 0x7FF00000) >>> 20;
  var significand = lshift(uint32_a & 0x000FFFFF, 32) + uint32_b;

  // Special values!
  if (exponent === 0 && significand === 0) {
    return 0;
  }
  if (exponent === 2047) {
    if (significand === 0) {
      if (sign === 1) {
        return Number.NEGATIVE_INFINITY;
      }
      return Number.POSITIVE_INFINITY;
    } else {
      return NaN;
    }
  }
  if (exponent === 0)  // we must denormalize!
    return Math.pow(-1, sign) * significand * Math.pow(2, -1074);
  return Math.pow(-1, sign) * (1 + significand * Math.pow(2, -52)) * Math.pow(2, exponent - 1023);
}

// Call this ONLY on the result of two non-NaN numbers.
export function wrap_float(a: number): number {
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

export function cmp(a: any, b: any): number {
  if (a === b) {
    return 0;
  }
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  // this will occur if either a or b is NaN
  return null;
}

// implements x<<n without the braindead javascript << operator
// (see http://stackoverflow.com/questions/337355/javascript-bitwise-shift-of-long-long-number)
export function lshift(x: number, n: number): number {
  return x * Math.pow(2, n);
}

export function read_uint(bytes: number[]): number {
  var n = bytes.length - 1;
  // sum up the byte values shifted left to the right alignment.
  var sum = 0;
  for (var i = 0; i <= n; i++) {
    sum += lshift(bytes[i], 8 * (n - i));
  }
  return sum;
}

// Convert :count chars starting from :offset in a Java character array into a JS string
export function chars2js_str(jvm_carr: java_object.JavaArray, offset?: number, count?: number): string {
  var off = offset || 0;
  return bytes2str(jvm_carr.array).substr(off, count);
}

export function bytestr_to_array(bytecode_string: string): number[] {
  var rv : number[] = [];
  for (var i = 0; i < bytecode_string.length; i++) {
    rv.push(bytecode_string.charCodeAt(i) & 0xFF);
  }
  return rv;
}

export function array_to_bytestr(bytecode_array: number[]): string {
  // XXX: We'd like to use String.fromCharCode(bytecode_array...)
  //  but that fails on Webkit with arrays longer than 2^31. See issue #129 for details.
  var rv = '';
  for (var i = 0; i < bytecode_array.length; i++) {
    rv += String.fromCharCode(bytecode_array[i]);
  }
  return rv;
}

export interface Flags {
  public: boolean;
  private: boolean;
  protected: boolean;
  static: boolean;
  final: boolean;
  synchronized: boolean;
  super: boolean;
  volatile: boolean;
  transient: boolean;
  native: boolean;
  interface: boolean;
  abstract: boolean;
  strict: boolean;
}

export function parse_flags(flag_byte: number): Flags {
  return {
    "public": (flag_byte & 0x1) > 0,
    "private": (flag_byte & 0x2) > 0,
    "protected": (flag_byte & 0x4) > 0,
    "static": (flag_byte & 0x8) > 0,
    "final": (flag_byte & 0x10) > 0,
    "synchronized": (flag_byte & 0x20) > 0,
    "super": (flag_byte & 0x20) > 0,
    "volatile": (flag_byte & 0x40) > 0,
    "transient": (flag_byte & 0x80) > 0,
    "native": (flag_byte & 0x100) > 0,
    "interface": (flag_byte & 0x200) > 0,
    "abstract": (flag_byte & 0x400)> 0,
    "strict": (flag_byte & 0x800) > 0
  };
}

function escaper(c: string, ...args: any[]): string {
  switch (c) {
    case "\n":
      return "\\n";
    case "\r":
      return "\\r";
    case "\t":
      return "\\t";
    case "\v":
      return "\\v";
    case "\f":
      return "\\f";
    default:
      return c;
  }
}

export function escape_whitespace(str: string): string {
  return str.replace(/\s/g, escaper);
}

/**
 * <init> => "<init>"
 * foo => foo
 */
function format_function_name(name: string): string {
  if (name.indexOf('<') === 0 && name.indexOf('>') === (name.length - 1)) {
    name = '"' + name + '"';
  }
  return name;
}

/**
 * Helper function for format_extra_info.
 * Converts:
 * - <init>()V => "<init>":()V
 * - alloc(I)Lgnu/math/IntNum; => alloc:(I)Lgnu/math/IntNum;
 */
function format_method_sig(sig: string): string {
  var lpIdx = sig.indexOf('(');
  // assert(lpIdx !== -1);
  return format_function_name(sig.slice(0, lpIdx)) + ':' + sig.slice(lpIdx);
}

/**
 * Mainly:
 * [I => "[I"
 */
function format_class_name(name: string): string {
  if (name.indexOf('[') === 0 && name.length === 2) {
    name = '"' + name + '"';
  }
  return name;
}

// if :entry is a reference, display its referent in a comment
export function format_extra_info(entry: any): string {
  var type = entry.type;
  var info = typeof entry.deref === "function" ? entry.deref() : void 0;
  if (!info) {
    return "";
  }
  switch (type) {
    case 'Method':
    case 'InterfaceMethod':
      return "\t//  " + this.descriptor2typestr(info.class_desc) + "." + format_method_sig(info.sig);
    case 'Field':
      return "\t//  " + this.descriptor2typestr(info.class_desc) + "." + info.name + ":" + info.type;
    case 'NameAndType':
      return "//  " + format_function_name(info.name) + ":" + info.type;
    case 'class':
      return "\t//  " + format_class_name(this.descriptor2typestr(info));
    default:
      if (is_string(info)) {
        return "\t//  " + escape_whitespace(info);
      }
  }
}

// Lightweight wrapper around a buffer.
export class BytesArray {
  private start : number;
  private end : number;
  private _index : number;

  constructor(private buffer: NodeBuffer, start?: number, end?: number) {
    this.start = start != null ? start : 0;
    this.end = end != null ? end : this.buffer.length;
    this._index = 0;
  }

  public rewind(): void {
    this._index = 0;
  }

  public pos(): number {
    return this._index;
  }

  public skip(bytes_count: number): void {
    this._index += bytes_count;
  }

  public has_bytes(): boolean {
    return this.start + this._index < this.end;
  }

  public get_uint(bytes_count: number): number {
    var readIndex = this.start + this._index;
    this._index += bytes_count;
    switch (bytes_count) {
      case 1:
        return this.buffer.readUInt8(readIndex);
      case 2:
        return this.buffer.readUInt16BE(readIndex);
      case 4:
        return this.buffer.readUInt32BE(readIndex);
      default:
        this._index -= bytes_count;
        throw new Error('Cannot read a uint of size ' + bytes_count);
    }
  }

  public get_int(bytes_count: number): number {
    var bytes_to_set = 32 - bytes_count * 8;
    return this.get_uint(bytes_count) << bytes_to_set >> bytes_to_set;
  }

  public read(bytes_count: number): number[] {
    var rv : number[] = [];
    for (var i = this.start + this._index; i < this.start + this._index + bytes_count; i++) {
      rv.push(this.buffer.readUInt8(i));
    }
    this._index += bytes_count;
    return rv;
  }

  public peek(): number {
    return this.buffer.readUInt8(this.start + this._index);
  }

  public size(): number {
    return this.end - this.start - this._index;
  }

  public splice(len: number): BytesArray {
    var arr = new BytesArray(this.buffer, this.start + this._index, this.start + this._index + len);
    this._index += len;
    return arr;
  }

  public slice(len: number): NodeBuffer {
    var rv = this.buffer.slice(this.start + this._index, this.start + this._index + len);
    this._index += len;
    return rv;
  }
}

export function initial_value(type_str: string): any {
  if (type_str === 'J') return gLong.ZERO;
  var c = type_str[0];
  if (c === '[' || c === 'L') return null;
  return 0;
}

export function is_string(obj: any): boolean {
  return typeof obj === 'string' || obj instanceof String;
}

// Java classes are represented internally using slashes as delimiters.
// These helper functions convert between the two representations.
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

// Converts type descriptors into standardized internal type strings.
//   Ljava/lang/Class; => java/lang/Class   Reference types
//   [Ljava/lang/Class; is unchanged        Array types
//   C => char                              Primitive types
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

export function last(array: any[]): any {
  return array[array.length - 1];
}

export class SafeMap {
  private cache: any;
  private proto_cache: any

  constructor() {
    this.cache = Object.create(null);  // has no defined properties aside from __proto__
  }

  public get(key: string): any {
    if (this.cache[key] != null) {
      return this.cache[key];
    }
    if (key == '__proto__' && this.proto_cache !== undefined) {
      return this.proto_cache;
    }
    return undefined;
  }

  public has(key: string): boolean {
    return this.get(key) !== void 0;
  }

  public set(key: string, value: any): void {
    // non-strict comparison to allow for the possibility of `new String('__proto__')`
    if (key != '__proto__') {
      this.cache[key] = value;
    } else {
      this.proto_cache = value;
    }
  }
}
