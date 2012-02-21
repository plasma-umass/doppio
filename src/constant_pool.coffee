
# Export a single 'ConstantPool' constructor.

# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util.js'

"""
All objects in the constant pool have the properties @type and @value.
*Reference and NameAndType objects all have a @deref method, which resolves
all child references to their values (i.e. discarding @type).
"""

class SimpleReference
  constructor: (@constant_pool, @value) ->

  @from_bytes: (bytes_array, constant_pool) ->
    value = util.read_uint(bytes_array.splice(0,2))
    ref = new @ constant_pool, value
    return [ref, 1, bytes_array]

  deref: ->
    pool_obj = @constant_pool[@value]
    pool_obj.deref?() or pool_obj.value

class ClassReference extends SimpleReference
  constructor: (@constant_pool, @value) -> @type = 'Class'

class StringReference extends SimpleReference
  constructor: (@constant_pool, @value) -> @type = 'String'

class AbstractMethodFieldReference
  @from_bytes: (bytes_array, constant_pool) ->
    [class_ref,tmp,bytes_array] = ClassReference.from_bytes bytes_array, constant_pool
    [sig,tmp,bytes_array] = SimpleReference.from_bytes bytes_array, constant_pool
    ref = new @ constant_pool, { class_ref: class_ref, sig: sig }
    return [ref, 1, bytes_array]

  deref: ->
    {
      class: @value.class_ref.deref()
      sig: @value.sig.deref()
    }

class MethodReference extends AbstractMethodFieldReference
  constructor: (@constant_pool, @value) -> @type = 'Method'

class InterfaceMethodReference extends AbstractMethodFieldReference
  constructor: (@constant_pool, @value) -> @type = 'InterfaceMethod'

class FieldReference extends AbstractMethodFieldReference
  constructor: (@constant_pool, @value) -> @type = 'Field'

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
    strlen = util.read_uint(bytes_array.splice(0,2))
    #TODO: this doesn't actually decode the real unicode repr. But it'll work for ascii...
    value = (String.fromCharCode(c) for c in bytes_array.splice(0,strlen)).join('')
    const_string = new @ value
    return [const_string, 1, bytes_array]

class ConstInt32
  constructor: (@value) -> @type = 'int'

  @from_bytes: (bytes_array) ->
    uint32 = util.read_uint(bytes_array.splice(0,4))
    value = -(1 + ~uint32)  # convert to signed integer ONLY FOR 32 BITS
    int32 = new @ value
    return [int32, 1, bytes_array]

class ConstFloat
  constructor: (@value) -> @type = 'float'

  @from_bytes: (bytes_array) ->
    uint32 = util.read_uint(bytes_array.splice(0,4))
    sign = (uint32 &       0x80000000)>>>31
    exponent = (uint32 &   0x7F800000)>>>23
    significand = uint32 & 0x007FFFFF
    value = Math.pow(-1,sign)*(1+significand*Math.pow(2,-23))*Math.pow(2,exponent-127)
    float = new @ value
    return [float, 1, bytes_array]

class ConstLong
  constructor: (@value) -> @type = 'long'

  @from_bytes: (bytes_array) ->
    int64 = util.read_uint(bytes_array.splice(0,8))
    # this makes me feel dirty. I hate Javscript's lack of (real) bitwise operators
    s = util.padleft(int64.toString(2),64,'0')
    if s[0] == '1'
      int64 = -(1 + util.bitwise_not(int64,64))
    value = int64
    long = new @ value
    return [long, 2, bytes_array]

class ConstDouble
  constructor: (@value) -> @type = 'double'

  @from_bytes: (bytes_array) ->
    #a hack since bitshifting in js is 32bit
    uint32_a = util.read_uint(bytes_array.splice(0,4))
    uint32_b = util.read_uint(bytes_array.splice(0,4))
    sign     = (uint32_a & 0x80000000)>>>31
    exponent = (uint32_a & 0x7FF00000)>>>20
    significand = util.lshift(uint32_a & 0x000FFFFF, 32) + uint32_b
    value = Math.pow(-1,sign)*(1+significand*Math.pow(2,-52))*Math.pow(2,exponent-1023)
    double = new @ value
    return [double, 2, bytes_array]

class @ConstantPool
  parse: (bytes_array) ->
    constant_tags = {
      1: ConstString, 3: ConstInt32, 4: ConstFloat, 5: ConstLong,
      6: ConstDouble, 7: ClassReference, 8: StringReference, 9: FieldReference,
      10: MethodReference, 11: InterfaceMethodReference, 12: MethodSignature
    }
    @cp_count = util.read_uint(bytes_array.splice(0,2))
    # constant_pool works like an array, but not all indices have values
    @constant_pool = {}
    idx = 1  # CP indexing starts at zero
    while idx < @cp_count
      tag = bytes_array.shift()
      throw "invalid tag: #{tag}" unless 1 <= tag <= 12
      [pool_obj,size,bytes_array] =
        constant_tags[tag].from_bytes(bytes_array, @constant_pool)
      @constant_pool[idx] = pool_obj
      idx += size
    return bytes_array
  
  get: (idx) -> @constant_pool[idx]

  each: (fn) ->
    for i in [0..@cp_count] when i of @constant_pool
      fn(i, @constant_pool[i])

module?.exports = @ConstantPool
