"use strict"

# Export a single 'ConstantPool' constructor.

# pull in external modules
gLong = require '../vendor/gLong.js'
util = require './util'

# All objects in the constant pool have the properties @type and @value.
# *Reference and NameAndType objects all have a @deref method, which resolves
# all child references to their values (i.e. discarding @type).

class SimpleReference
  constructor: (@constant_pool, @value) ->

  @size: 1

  @from_bytes: (bytes_array, constant_pool) ->
    value = bytes_array.get_uint 2
    ref = new @ constant_pool, value
    return ref

  deref: ->
    pool_obj = @constant_pool[@value]
    pool_obj.deref?() or pool_obj.value

class ClassReference extends SimpleReference
  constructor: (@constant_pool, @value) -> @type = 'class'

  # the ConstantPool stores class names without the L...; descriptor stuff
  deref: ->
    pool_obj = @constant_pool[@value]
    pool_obj.deref?() or util.typestr2descriptor(pool_obj.value)

class StringReference extends SimpleReference
  constructor: (@constant_pool, @value) -> @type = 'String'

class AbstractMethodFieldReference
  @size: 1

  @from_bytes: (bytes_array, constant_pool) ->
    class_ref = ClassReference.from_bytes bytes_array, constant_pool
    sig = SimpleReference.from_bytes bytes_array, constant_pool
    ref = new @ constant_pool, { class_ref: class_ref, sig: sig }
    return ref

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

  @size: 1

  @from_bytes: (bytes_array, constant_pool) ->
    meth_ref = StringReference.from_bytes bytes_array, constant_pool
    type_ref = StringReference.from_bytes bytes_array, constant_pool
    ref = new @ constant_pool, { meth_ref: meth_ref, type_ref: type_ref }
    return ref

  deref: ->
    {
      name: @value.meth_ref.deref()
      type: @value.type_ref.deref()
    }

class ConstString
  constructor: (@value) -> @type = 'Asciz'

  @size: 1

  @from_bytes: (bytes_array) ->
    strlen = bytes_array.get_uint 2
    value = util.bytes2str bytes_array.read(strlen)
    const_string = new @ value
    return const_string

class ConstInt32
  constructor: (@value) -> @type = 'int'

  @size: 1

  @from_bytes: (bytes_array) ->
    uint32 = bytes_array.get_uint 4
    value = -(1 + ~uint32)  # convert to signed integer ONLY FOR 32 BITS
    int32 = new @ value
    return int32

class ConstFloat
  constructor: (@value) -> @type = 'float'

  @size: 1

  @from_bytes: (bytes_array) ->
    uint32 = bytes_array.get_uint 4
    # We OR with 0 to convert to a signed int.
    value = util.intbits2float(uint32|0)
    float = new @ value
    return float

class ConstLong
  constructor: (@value) -> @type = 'long'

  @size: 2

  @from_bytes: (bytes_array) ->
    high = bytes_array.get_uint 4
    low = bytes_array.get_uint 4
    value = gLong.fromBits(low,high)
    long = new @ value
    return long

class ConstDouble
  constructor: (@value) -> @type = 'double'

  @size: 2

  @from_bytes: (bytes_array) ->
    #a hack since bitshifting in js is 32bit
    uint32_a = bytes_array.get_uint 4
    uint32_b = bytes_array.get_uint 4
    double = new @ util.longbits2double(uint32_a, uint32_b)
    return double

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
      pool_obj = constant_tags[tag].from_bytes(bytes_array, @constant_pool)
      @constant_pool[idx] = pool_obj
      idx += constant_tags[tag].size
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
