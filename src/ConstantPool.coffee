
# Export a single 'ConstantPool' constructor.

# pull in external modules
_ = require '../vendor/_.js'
gLong = require '../vendor/gLong.js'
util = require './util'

"use strict"

# All objects in the constant pool have the properties @type and @value.
# *Reference and NameAndType objects all have a @deref method, which resolves
# all child references to their values (i.e. discarding @type).

class SimpleReference
  constructor: (@constant_pool, @value) ->

  @from_bytes: (bytes_array, constant_pool) ->
    value = bytes_array.get_uint 2
    ref = new @ constant_pool, value
    return [ref, 1, bytes_array]

  deref: ->
    pool_obj = @constant_pool[@value]
    pool_obj.deref?() or pool_obj.value

class ClassReference extends SimpleReference
  constructor: (@constant_pool, @value) -> @type = 'class'

class StringReference extends SimpleReference
  constructor: (@constant_pool, @value) -> @type = 'String'

class AbstractMethodFieldReference
  @from_bytes: (bytes_array, constant_pool) ->
    [class_ref,tmp,bytes_array] = ClassReference.from_bytes bytes_array, constant_pool
    [sig,tmp,bytes_array] = SimpleReference.from_bytes bytes_array, constant_pool
    ref = new @ constant_pool, { class_ref: class_ref, sig: sig }
    return [ref, 1, bytes_array]

  deref: ->
    sig = @value.sig.deref()
    {
      class: @value.class_ref.deref()
      sig: sig.name + sig.type
    }

class MethodReference extends AbstractMethodFieldReference
  constructor: (@constant_pool, @value) -> @type = 'Method'

class InterfaceMethodReference extends AbstractMethodFieldReference
  constructor: (@constant_pool, @value) -> @type = 'InterfaceMethod'

class FieldReference extends AbstractMethodFieldReference
  constructor: (@constant_pool, @value) -> @type = 'Field'

  deref: ->
    sig = @value.sig.deref()
    {
      class: @value.class_ref.deref()
      name: sig.name
      type: sig.type
    }

class MethodSignature
  constructor: (@constant_pool, @value) -> @type = 'NameAndType'

  @from_bytes: (bytes_array, constant_pool) ->
    [meth_ref,tmp,bytes_array] = StringReference.from_bytes bytes_array, constant_pool
    [type_ref,tmp,bytes_array] = StringReference.from_bytes bytes_array, constant_pool
    ref = new @ constant_pool, { meth_ref: meth_ref, type_ref: type_ref }
    return [ref, 1, bytes_array]

  deref: ->
    {
      name: @value.meth_ref.deref()
      type: @value.type_ref.deref()
    }

class ConstString
  constructor: (@value) -> @type = 'Asciz'

  @from_bytes: (bytes_array) ->
    strlen = bytes_array.get_uint 2
    value = util.bytes2str bytes_array.read(strlen)
    const_string = new @ value
    return [const_string, 1, bytes_array]

class ConstInt32
  constructor: (@value) -> @type = 'int'

  @from_bytes: (bytes_array) ->
    uint32 = bytes_array.get_uint 4
    value = -(1 + ~uint32)  # convert to signed integer ONLY FOR 32 BITS
    int32 = new @ value
    return [int32, 1, bytes_array]

class ConstFloat
  constructor: (@value) -> @type = 'float'

  @from_bytes: (bytes_array) ->
    uint32 = bytes_array.get_uint 4
    sign = (uint32 &       0x80000000)>>>31
    exponent = (uint32 &   0x7F800000)>>>23
    significand = uint32 & 0x007FFFFF
    if exponent is 0  # we must denormalize!
      value = Math.pow(-1,sign)*significand*Math.pow(2,-149)
    else
      value = Math.pow(-1,sign)*(1+significand*Math.pow(2,-23))*Math.pow(2,exponent-127)
    float = new @ value
    return [float, 1, bytes_array]

class ConstLong
  constructor: (@value) -> @type = 'long'

  @from_bytes: (bytes_array) ->
    high = bytes_array.get_uint 4
    low = bytes_array.get_uint 4
    value = gLong.fromBits(low,high)
    long = new @ value
    return [long, 2, bytes_array]

class ConstDouble
  constructor: (@value) -> @type = 'double'

  @from_bytes: (bytes_array) ->
    #a hack since bitshifting in js is 32bit
    uint32_a = bytes_array.get_uint 4
    uint32_b = bytes_array.get_uint 4
    sign     = (uint32_a & 0x80000000)>>>31
    exponent = (uint32_a & 0x7FF00000)>>>20
    significand = util.lshift(uint32_a & 0x000FFFFF, 32) + uint32_b
    if exponent is 0  # we must denormalize!
      value = Math.pow(-1,sign)*significand*Math.pow(2,-1074)
    else
      value = Math.pow(-1,sign)*(1+significand*Math.pow(2,-52))*Math.pow(2,exponent-1023)
    double = new @ value
    return [double, 2, bytes_array]

class ConstantPool
  parse: (bytes_array) ->
    constant_tags = {
      1: ConstString, 3: ConstInt32, 4: ConstFloat, 5: ConstLong,
      6: ConstDouble, 7: ClassReference, 8: StringReference, 9: FieldReference,
      10: MethodReference, 11: InterfaceMethodReference, 12: MethodSignature
    }
    @cp_count = bytes_array.get_uint 2
    # constant_pool works like an array, but not all indices have values
    @constant_pool = {}
    idx = 1  # CP indexing starts at zero
    while idx < @cp_count
      tag = bytes_array.get_uint 1
      throw "invalid tag: #{tag}" unless 1 <= tag <= 12
      [pool_obj,size,bytes_array] =
        constant_tags[tag].from_bytes(bytes_array, @constant_pool)
      @constant_pool[idx] = pool_obj
      idx += size
    return bytes_array

  get: (idx) -> @constant_pool[idx] ?
                  throw new Error("Invalid constant_pool reference: #{idx}")

  each: (fn) ->
    for i in [0..@cp_count] when i of @constant_pool
      fn(i, @constant_pool[i])

if module?
  module.exports = ConstantPool
else
  window.ConstantPool = ConstantPool
