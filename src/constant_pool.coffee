
# things assigned to root will be available outside this module
root = exports ? this 

method_reference = (bytes_array) ->
  class_ref = read_uint(bytes_array.splice(0,2))
  method_sig = read_uint(bytes_array.splice(0,2))
  return ['Method', [class_ref,method_sig], 1, bytes_array]

interface_method_reference = (bytes_array) ->
  class_ref = read_uint(bytes_array.splice(0,2))
  method_sig = read_uint(bytes_array.splice(0,2))
  return ['InterfaceMethod', [class_ref,iface_sig], 1, bytes_array]

field_reference = (bytes_array) ->
  class_ref = read_uint(bytes_array.splice(0,2))
  field_sig = read_uint(bytes_array.splice(0,2))
  return ['Field', [class_ref,field_sig], 1, bytes_array]

class_reference = (bytes_array) ->
  class_name_ref = read_uint(bytes_array.splice(0,2))
  return ['Class', class_name_ref, 1, bytes_array]

string_reference = (bytes_array) ->
  str_ref = read_uint(bytes_array.splice(0,2))
  return ['String', str_ref, 1, bytes_array]

const_string = (bytes_array) ->
  strlen = read_uint(bytes_array.splice(0,2))
  #TODO: this doesn't actually decode the real unicode repr. But it'll work for ascii...
  rawstr = (String.fromCharCode(c) for c in bytes_array.splice(0,strlen)).join('')
  return ['Asciz', rawstr, 1, bytes_array]

method_signature = (bytes_array) ->
  meth_name = read_uint(bytes_array.splice(0,2))
  type_name = read_uint(bytes_array.splice(0,2))
  return ['NameAndType', [meth_name,type_name],1,bytes_array]

const_int32 = (bytes_array) ->
  uint32 = read_uint(bytes_array.splice(0,4))
  int32 = -(1 + ~uint32)  # convert to signed integer ONLY FOR 32 BITS
  return ['int', int32, 1, bytes_array]

const_float = (bytes_array) ->
  uint32 = read_uint(bytes_array.splice(0,4))
  sign = (uint32 &       0x80000000)>>>31
  exponent = (uint32 &   0x7F800000)>>>23
  significand = uint32 & 0x007FFFFF
  single = Math.pow(-1,sign)*(1+significand*Math.pow(2,-23))*Math.pow(2,exponent-127)
  return ['float', single,1,bytes_array]

const_long = (bytes_array) ->
  int64 = read_uint(bytes_array.splice(0,8))
  # this makes me feel dirty. I hate Javscript's lack of (real) bitwise operators
  s = padleft(int64.toString(2),64,'0')
  if s[0] == '1'
    int64 = -(1 + bitwise_not(int64,64))
  return ['long', int64,2,bytes_array]

const_double = (bytes_array) ->
  #a hack since bitshifting in js is 32bit
  uint32_a = read_uint(bytes_array.splice(0,4))
  uint32_b = read_uint(bytes_array.splice(0,4))
  sign     = (uint32_a & 0x80000000)>>>31
  exponent = (uint32_a & 0x7FF00000)>>>20
  significand = lshift(uint32_a & 0x000FFFFF, 32) + uint32_b
  double = Math.pow(-1,sign)*(1+significand*Math.pow(2,-52))*Math.pow(2,exponent-1023)
  return ['double', double,2,bytes_array]

class root.ConstantPool
  parse: (bytes_array) ->
    constant_tags = {
      1: const_string, 3: const_int32, 4: const_float, 5: const_long,
      6: const_double, 7: class_reference, 8: string_reference, 9: field_reference,
      10: method_reference, 11: interface_method_reference, 12: method_signature
    }
    @cp_count = read_uint(bytes_array.splice(0,2))
    # constant_pool works like an array, but not all indices have values
    @constant_pool = {}
    idx = 1  # CP indexing starts at zero
    while idx < @cp_count
      tag = bytes_array.shift()
      throw "invalid tag: #{tag}" unless 1 <= tag <= 12
      [type,val,size,bytes_array] = constant_tags[tag](bytes_array)
      @constant_pool[idx] = { type: type, value: val }
      idx += size
    return bytes_array
  
  get: (idx) ->
    return @constant_pool[idx]

  deref: (idx) ->
    return @constant_pool[@constant_pool[idx].value]

  each: (fn) ->
    for i in [0..@cp_count] when i of @constant_pool
      fn(i, @constant_pool[i])
