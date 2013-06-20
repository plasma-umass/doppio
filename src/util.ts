import gLong = module('./gLong');
import logging = module('./logging')

// default module: util
export var INT_MAX = Math.pow(2, 31) - 1;
export var INT_MIN = -INT_MAX - 1;
export var FLOAT_POS_INFINITY = Math.pow(2, 128);
export var FLOAT_NEG_INFINITY = -1 * FLOAT_POS_INFINITY;
export var FLOAT_POS_INFINITY_AS_INT = 0x7F800000;
export var FLOAT_NEG_INFINITY_AS_INT = -8388608;
export var FLOAT_NaN_AS_INT = 0x7fc00000;

if (Math['imul'] == null) {
  Math['imul'] = function(a, b) {
    var ah, al, bh, bl;

    ah = (a >>> 16) & 0xffff;
    al = a & 0xffff;
    bh = (b >>> 16) & 0xffff;
    bl = b & 0xffff;
    return (al * bl) + (((ah * bl + al * bh) << 16) >>> 0) | 0;
  };
}

export function arrayset(len: number, val :number): number[] {
  var array = new Array(len);
  for (var i = 0; i < len; i++) {
    array[i] = val;
  }
  return array;
}

export function arraycpy(src: any[]): any[] {
  var array = new Array(src.length);
  for (var i = 0; i < src.length; i++) {
    array[i] = src[i];
  }
  return array;
}

export function int_mod(rs: any, a: number, b: number): number {
  if (b === 0) {
    rs.java_throw(rs.get_bs_class('Ljava/lang/ArithmeticException;'), '/ by zero');
  }
  return a % b;
}

export function int_div(rs: any, a: number, b: number): number {
  if (b === 0) {
    rs.java_throw(rs.get_bs_class('Ljava/lang/ArithmeticException;'), '/ by zero');
  }
  if (a === INT_MIN && b === -1) {
    return a;
  }
  return (a / b) | 0;
}

export function long_mod(rs: any, a: gLong, b: gLong): gLong {
  if (b.isZero()) {
    rs.java_throw(rs.get_bs_class('Ljava/lang/ArithmeticException;'), '/ by zero');
  }
  return a.modulo(b);
}

export function long_div(rs: any, a: gLong, b: gLong): gLong {
  if (b.isZero()) {
    rs.java_throw(rs.get_bs_class('Ljava/lang/ArithmeticException;'), '/ by zero');
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
  if (typeof Int32Array !== "undefined" && Int32Array !== null) {
    var i_view = new Int32Array([int32]);
    var f_view = new Float32Array(i_view.buffer);
    return f_view[0];
  }
  if (int32 === FLOAT_POS_INFINITY_AS_INT) {
    return Number.POSITIVE_INFINITY;
  } else if (int32 === FLOAT_NEG_INFINITY_AS_INT) {
    return Number.NEGATIVE_INFINITY;
  }
  var sign = (int32 & 0x80000000) >>> 31;
  var exponent = (int32 & 0x7F800000) >>> 23;
  var significand = int32 & 0x007FFFFF;
  var value;
  if (exponent === 0) {
    value = Math.pow(-1, sign) * significand * Math.pow(2, -149);
  } else {
    value = Math.pow(-1, sign) * (1 + significand * Math.pow(2, -23)) * Math.pow(2, exponent - 127);
  }
  if (value < FLOAT_NEG_INFINITY || value > FLOAT_POS_INFINITY) {
    value = NaN;
  }
  return value;
}

export function longbits2double(uint32_a: number, uint32_b: number): number {
  var value;

  if (typeof Uint32Array !== "undefined" && Uint32Array !== null) {
    var i_view = new Uint32Array(2);
    i_view[0] = uint32_b;
    i_view[1] = uint32_a;
    var d_view = new Float64Array(i_view.buffer);
    return d_view[0];
  }
  var sign = (uint32_a & 0x80000000) >>> 31;
  var exponent = (uint32_a & 0x7FF00000) >>> 20;
  var significand = lshift(uint32_a & 0x000FFFFF, 32) + uint32_b;
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
  if (exponent === 0)
    return Math.pow(-1, sign) * significand * Math.pow(2, -1074);
  return Math.pow(-1, sign) * (1 + significand * Math.pow(2, -52)) * Math.pow(2, exponent - 1023);
}

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
  return null;
}

export function lshift(x: number, n: number): number {
  return x * Math.pow(2, n);
}

export function read_uint(bytes: number[]): number {
  var n = bytes.length - 1;
  var sum = 0;
  for (var i = 0; i <= n; i++) {
    sum += lshift(bytes[i], 8 * (n - i));
  }
  return sum;
}

export function chars2js_str(jvm_carr: any, offset?: number, count?: number): string {
  var off = offset || 0;
  return bytes2str(jvm_carr.array).substr(off, count);
}

export function bytestr_to_array(bytecode_string: string): number[] {
  var rv = [];
  for (var i = 0; i < bytecode_string.length; i++) {
    rv.push(bytecode_string.charCodeAt(i) & 0xFF);
  }
  return rv;
}

export function array_to_bytestr(bytecode_array: number[]): string {
  var rv = '';
  for (var i = 0; i < bytecode_array.length; i++) {
    rv += String.fromCharCode(bytecode_array[i]);
  }
  return rv;
}

export function parse_flags(flag_byte: number): any {
  return {
    "public": flag_byte & 0x1,
    "private": flag_byte & 0x2,
    "protected": flag_byte & 0x4,
    "static": flag_byte & 0x8,
    "final": flag_byte & 0x10,
    "synchronized": flag_byte & 0x20,
    "super": flag_byte & 0x20,
    "volatile": flag_byte & 0x40,
    "transient": flag_byte & 0x80,
    "native": flag_byte & 0x100,
    "interface": flag_byte & 0x200,
    "abstract": flag_byte & 0x400,
    "strict": flag_byte & 0x800
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

export function format_extra_info(entry: any): string {
  var type = entry.type;
  var info = typeof entry.deref === "function" ? entry.deref() : void 0;
  if (!info) {
    return "";
  }
  switch (type) {
    case 'Method':
    case 'InterfaceMethod':
      return "\t//  " + info["class"] + "." + info.sig;
    case 'Field':
      return "\t//  " + info["class"] + "." + info.name + ":" + info.type;
    case 'NameAndType':
      return "//  " + info.name + ":" + info.type;
    default:
      if (is_string(info)) {
        return "\t//  " + escape_whitespace(info);
      }
  }
}

export class BytesArray {
  private start : number;
  private end : number;
  private _index : number;

  constructor(private raw_array: number[], start?: number, end?: number) {
    this.start = start != null ? start : 0;
    this.end = end != null ? end : this.raw_array.length;
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

  public has_bytes(): Boolean {
    return this.start + this._index < this.end;
  }

  public get_uint(bytes_count: number): number {
    var rv = read_uint(this.raw_array.slice(this.start + this._index, this.start + this._index + bytes_count));
    this._index += bytes_count;
    return rv;
  }

  public get_int(bytes_count: number): number {
    var bytes_to_set = 32 - bytes_count * 8;
    return this.get_uint(bytes_count) << bytes_to_set >> bytes_to_set;
  }

  public read(bytes_count: number): number[] {
    var rv = this.raw_array.slice(this.start + this._index, this.start + this._index + bytes_count);
    this._index += bytes_count;
    return rv;
  }

  public peek(): number {
    return this.raw_array[this.start + this._index];
  }

  public size(): number {
    return this.end - this.start - this._index;
  }

  public splice(len: number): BytesArray {
    var arr = new BytesArray(this.raw_array, this.start + this._index, this.start + this._index + len);
    this._index += len;
    return arr;
  }
}

export function initial_value(type_str: string): any {
  if (type_str === 'J') return gLong.ZERO;
  var c = type_str[0];
  if (c === '[' || c === 'L') return null;
  return 0;
}

export function is_string(obj: any): Boolean {
  return typeof obj === 'string' || obj instanceof String;
}

export function ext_classname(str: string): string {
  return descriptor2typestr(str).replace(/\//g, '.');
}

export function int_classname(str: string): string {
  return typestr2descriptor(str).replace(/\./g, '/');
}

export function verify_int_classname(str: string): Boolean {
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
  for (var part in parts) {
    if (part.match(/[^$_a-z0-9]/i)) {
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

export function get_component_type(type_str: string): string {
  return type_str.slice(1);
}

export function is_array_type(type_str: string): Boolean {
  return type_str[0] === '[';
}

export function is_primitive_type(type_str: string): Boolean {
  return internal2external[type_str] !== void 0;
}

export function is_reference_type(type_str: string): Boolean {
  return type_str[0] === 'L';
}

export function descriptor2typestr(type_str: string): string {
  var c = type_str[0];
  if (c in internal2external) return internal2external[c];
  if (c === 'L') return type_str.slice(1, -1);
  if (c === '[') return type_str;
  // no match
  throw new Error("Unrecognized type string: " + type_str);
}

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

export function typestr2descriptor(type_str: string): string {
  var c = type_str[0];
  if (external2internal[type_str] !== void 0) {
    return external2internal[type_str];
  } else if (c === '[') {
    return type_str;
  } else {
    return "L" + type_str + ";";
  }
}

export function bytes2str(bytes: string, null_terminate?: Boolean): string {
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
    this.cache = Object.create(null);
    this.proto_cache = void 0;
  }

  public get(key: string): any {
    if (this.cache[key] != null) {
      return this.cache[key];
    }
    if (key == '__proto__' && this.proto_cache !== void 0) {
      return this.proto_cache;
    }
    return void 0;
  }

  public has(key: string): Boolean {
    return this.get(key) !== void 0;
  }

  public set(key: string, value: any): void {
    if (key != '__proto__') {
      this.cache[key] = value;
    } else {
      this.proto_cache = value;
    }
  }
}
