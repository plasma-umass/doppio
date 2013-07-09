"use strict"

# pull in external modules
gLong = require '../vendor/gLong.js'
{trace,vtrace,error,debug} = require './logging'

# things assigned to root will be available outside this module
root = exports ? window.util ?= {}

root.INT_MAX = Math.pow(2, 31) - 1
root.INT_MIN = -root.INT_MAX - 1 # -2^31

root.FLOAT_POS_INFINITY = Math.pow(2,128)
root.FLOAT_NEG_INFINITY = -1*root.FLOAT_POS_INFINITY
root.FLOAT_POS_INFINITY_AS_INT = 0x7F800000
root.FLOAT_NEG_INFINITY_AS_INT = -8388608
# We use the JavaScript NaN as our NaN value, and convert it to
# a NaN value in the SNaN range when an int equivalent is requested.
root.FLOAT_NaN_AS_INT = 0x7fc00000

unless Math.imul?
  # polyfill from https://developer.mozilla.org/en-US/docs/JavaScript/Reference/Global_Objects/Math/imul
  Math.imul = (a, b) ->
    ah = (a >>> 16) & 0xffff
    al = a & 0xffff
    bh = (b >>> 16) & 0xffff
    bl = b & 0xffff
    # the shift by 0 fixes the sign on the high part, and the |0 prevents
    # overflow on the high part.
    return (al * bl) + (((ah * bl + al * bh) << 16) >>> 0)|0

# Creates and initializes *JavaScript* array to *val* in each element slot.
# Like memset, but for arrays.
root.arrayset = (len, val) ->
  array = new Array len
  array[i] = val for i in [0...len] by 1
  return array

root.int_mod = (rs, a, b) ->
  rs.java_throw rs.get_bs_class('Ljava/lang/ArithmeticException;'), '/ by zero' if b == 0
  a % b

root.int_div = (rs, a, b) ->
  rs.java_throw rs.get_bs_class('Ljava/lang/ArithmeticException;'), '/ by zero' if b == 0
  # spec: "if the dividend is the negative integer of largest possible magnitude
  # for the int type, and the divisor is -1, then overflow occurs, and the
  # result is equal to the dividend."
  return a if a == root.INT_MIN and b == -1
  (a / b) | 0

root.long_mod = (rs, a, b) ->
  rs.java_throw rs.get_bs_class('Ljava/lang/ArithmeticException;'), '/ by zero' if b.isZero()
  a.modulo(b)

root.long_div = (rs, a, b) ->
  rs.java_throw rs.get_bs_class('Ljava/lang/ArithmeticException;'), '/ by zero' if b.isZero()
  a.div(b)

root.float2int = (a) ->
  if a > root.INT_MAX then root.INT_MAX
  else if a < root.INT_MIN then root.INT_MIN
  else a|0

root.intbits2float = (int32) ->
  if Int32Array?
    i_view = new Int32Array [int32]
    f_view = new Float32Array i_view.buffer
    return f_view[0]

  # Fallback for older JS engines

  # Map +/- infinity to JavaScript equivalents
  if int32 == root.FLOAT_POS_INFINITY_AS_INT
    return Number.POSITIVE_INFINITY
  else if int32 == root.FLOAT_NEG_INFINITY_AS_INT
    return Number.NEGATIVE_INFINITY

  sign = (int32 &       0x80000000)>>>31
  exponent = (int32 &   0x7F800000)>>>23
  significand = int32 & 0x007FFFFF
  if exponent is 0  # we must denormalize!
    value = Math.pow(-1,sign)*significand*Math.pow(2,-149)
  else
    value = Math.pow(-1,sign)*(1+significand*Math.pow(2,-23))*Math.pow(2,exponent-127)

  # NaN check
  if value < root.FLOAT_NEG_INFINITY or value > root.FLOAT_POS_INFINITY
    value = NaN

  return value

root.longbits2double = (uint32_a, uint32_b) ->
  if Uint32Array?
    i_view = new Uint32Array 2
    i_view[0] = uint32_b
    i_view[1] = uint32_a
    d_view = new Float64Array i_view.buffer
    return d_view[0]

  sign     = (uint32_a & 0x80000000)>>>31
  exponent = (uint32_a & 0x7FF00000)>>>20
  significand = root.lshift(uint32_a & 0x000FFFFF, 32) + uint32_b

  # Special values!
  return 0 if exponent is 0 and significand is 0
  if exponent is 2047
    if significand is 0
      if sign is 1
        return Number.NEGATIVE_INFINITY
      return Number.POSITIVE_INFINITY
    else return NaN

  if exponent is 0  # we must denormalize!
    value = Math.pow(-1,sign)*significand*Math.pow(2,-1074)
  else
    value = Math.pow(-1,sign)*(1+significand*Math.pow(2,-52))*Math.pow(2,exponent-1023)
  return value

# Call this ONLY on the result of two non-NaN numbers.
root.wrap_float = (a) ->
  return Number.POSITIVE_INFINITY if a > 3.40282346638528860e+38
  return 0 if 0 < a < 1.40129846432481707e-45
  return Number.NEGATIVE_INFINITY if a < -3.40282346638528860e+38
  return 0 if 0 > a > -1.40129846432481707e-45
  a

root.cmp = (a,b) ->
  return 0  if a == b
  return -1 if a < b
  return 1  if a > b
  return null # this will occur if either a or b is NaN

# implements x<<n without the braindead javascript << operator
# (see http://stackoverflow.com/questions/337355/javascript-bitwise-shift-of-long-long-number)
root.lshift = (x,n) -> x*Math.pow(2,n)

root.read_uint = (bytes) ->
  n = bytes.length-1
  # sum up the byte values shifted left to the right alignment.
  sum = 0
  for i in [0..n] by 1
    sum += root.lshift(bytes[i],8*(n-i))
  sum

# Convert :count chars starting from :offset in a Java character array into a JS string
root.chars2js_str = (jvm_carr, offset, count) ->
  root.bytes2str(jvm_carr.array).substr(offset ? 0, count)

root.bytestr_to_array = (bytecode_string) ->
  (bytecode_string.charCodeAt(i) & 0xFF for i in [0...bytecode_string.length] by 1)

root.array_to_bytestr = (bytecode_array) ->
  # XXX: We'd like to use String.fromCharCode(bytecode_array...)
  #  but that fails on Webkit with arrays longer than 2^31. See issue #129 for details.
  return (String.fromCharCode(b) for b in bytecode_array).join ''

root.parse_flags = (flag_byte) -> {
  public:       flag_byte & 0x1
  private:      flag_byte & 0x2
  protected:    flag_byte & 0x4
  static:       flag_byte & 0x8
  final:        flag_byte & 0x10
  synchronized: flag_byte & 0x20
  super:        flag_byte & 0x20
  volatile:     flag_byte & 0x40
  transient:    flag_byte & 0x80
  native:       flag_byte & 0x100
  interface:    flag_byte & 0x200
  abstract:     flag_byte & 0x400
  strict:       flag_byte & 0x800
}

root.escape_whitespace = (str) ->
  str.replace /\s/g, (c) ->
    switch c
      when "\n" then "\\n"
      when "\r" then "\\r"
      when "\t" then "\\t"
      when "\v" then "\\v"
      when "\f" then "\\f"
      else c

# if :entry is a reference, display its referent in a comment
root.format_extra_info = (entry) ->
  type = entry.type
  info = entry.deref?()
  return "" unless info
  switch type
    when 'Method', 'InterfaceMethod'
      "\t//  #{info.class}.#{info.sig}"
    when 'Field'
      "\t//  #{info.class}.#{info.name}:#{info.type}"
    when 'NameAndType' then "//  #{info.name}:#{info.type}"
    else "\t//  " + root.escape_whitespace info if root.is_string info

class root.BytesArray
  constructor: (@raw_array, @start=0, @end=@raw_array.length) ->
    @_index = 0

  rewind: -> @_index = 0

  pos: -> @_index

  skip: (bytes_count) -> @_index += bytes_count

  has_bytes: -> @start + @_index < @end

  get_uint: (bytes_count) ->
    rv = root.read_uint @raw_array.slice(@start + @_index, @start + @_index + bytes_count)
    @_index += bytes_count
    return rv

  get_int: (bytes_count) ->
    bytes_to_set = 32 - bytes_count * 8
    @get_uint(bytes_count) << bytes_to_set >> bytes_to_set

  read: (bytes_count) ->
    rv = @raw_array[@start+@_index...@start+@_index+bytes_count]
    @_index += bytes_count
    rv

  peek: -> @raw_array[@start+@_index]

  size: -> @end - @start - @_index

  splice: (len) ->
    arr = new root.BytesArray @raw_array, @start+@_index, @start+@_index+len
    @_index += len
    arr

root.initial_value = (type_str) ->
  if type_str is 'J' then gLong.ZERO
  else if type_str[0] in ['[','L'] then null
  else 0

root.is_string = (obj) -> typeof obj == 'string' or obj instanceof String

# Java classes are represented internally using slashes as delimiters.
# These helper functions convert between the two representations.
root.ext_classname = (str) -> root.descriptor2typestr(str).replace /\//g, '.'
root.int_classname = (str) -> root.typestr2descriptor(str).replace /\./g, '/'

root.verify_int_classname = (str) ->
  array_nesting = str.match(/^\[*/)[0].length
  return false if array_nesting > 255
  str = str[array_nesting...] if array_nesting > 0
  if str[0] is 'L'
    return false if str[str.length-1] isnt ';'
    str = str[1...-1]
  return true if str of root.internal2external
  return false if str.match /\/{2,}/
  for part in str.split '/'
    return false if part.match /[^$_a-z0-9]/i
  return true

root.internal2external =
  B: 'byte'
  C: 'char'
  D: 'double'
  F: 'float'
  I: 'int'
  J: 'long'
  S: 'short'
  V: 'void'
  Z: 'boolean'

external2internal = {}
external2internal[v]=k for k,v of root.internal2external

# Get the component type of an array type string. Cut off the [L and ; for
# arrays of classes.
root.get_component_type = (type_str) -> type_str[1...]
root.is_array_type = (type_str) -> type_str[0] == '['
root.is_primitive_type = (type_str) -> type_str of root.internal2external
root.is_reference_type = (type_str) -> type_str[0] == 'L'
# Converts type descriptors into standardized internal type strings.
# Ljava/lang/Class; => java/lang/Class   Reference types
# [Ljava/lang/Class; is unchanged        Array types
# C => char                              Primitive types
root.descriptor2typestr = (type_str) ->
  c = type_str[0]
  if c of root.internal2external
    root.internal2external[c]
  else if c == 'L'
    type_str[1...-1]
  else if c == '['
    type_str
  else
    throw new Error "Unrecognized type string: #{type_str}"
# Takes a character array of concatenated type descriptors and returns/removes the first one.
root.carr2descriptor = (carr) ->
  c = carr.shift()
  return null unless c?
  if c of root.internal2external
    c
  else if c == 'L'
    "L#{(c while (c = carr.shift()) != ';').join('')};"
  else if c == '['
    "[#{root.carr2descriptor(carr)}"
  else
    carr.unshift c
    throw new Error "Unrecognized descriptor: #{carr.join ''}"
# Converts internal type strings into type descriptors. Reverse of descriptor2typestr.
root.typestr2descriptor = (type_str) ->
  c = type_str[0]
  if type_str of external2internal
    external2internal[type_str]
  else if c == '['
    type_str
  else
    "L#{type_str};"


# Parse Java's pseudo-UTF-8 strings. (spec 4.4.7)
root.bytes2str = (bytes, null_terminate=false) ->
  idx = 0
  char_array =
    while idx < bytes.length
      # cast to an unsigned byte
      x = bytes[idx++] & 0xff
      break if null_terminate and x is 0
      String.fromCharCode(
        if x <= 0x7f
          x
        else if x <= 0xdf
          y = bytes[idx++]
          ((x & 0x1f) << 6) + (y & 0x3f)
        else
          y = bytes[idx++]
          z = bytes[idx++]
          ((x & 0xf) << 12) + ((y & 0x3f) << 6) + (z & 0x3f)
      )
  char_array.join ''

root.last = (array) -> array[array.length-1]

class root.SafeMap

  constructor: ->
    @cache = Object.create null # has no defined properties aside from __proto__
    @proto_cache = undefined

  get: (key) ->
    return @cache[key] if @cache[key]? # don't use `isnt undefined` -- __proto__ is null!
    return @proto_cache if key.toString() is '__proto__' and @proto_cache isnt undefined
    undefined

  has: (key) -> @get(key) isnt undefined

  set: (key, value) ->
    # toString() converts key to a primitive, so strict comparison works
    unless key.toString() is '__proto__'
      @cache[key] = value
    else
      @proto_cache = value
