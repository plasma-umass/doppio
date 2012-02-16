
# things assigned to root will be available outside this module
root = exports ? this 

method_reference = (bytes_array) ->
  class_ref = read_uint(bytes_array.splice(0,2))
  method_sig = read_uint(bytes_array.splice(0,2))
  return [{'method_reference':[class_ref,method_sig]}, bytes_array]

field_reference = (bytes_array) ->
  class_ref = read_uint(bytes_array.splice(0,2))
  field_sig = read_uint(bytes_array.splice(0,2))
  return [{'field_reference':[class_ref,field_sig]}, bytes_array]

class_reference = (bytes_array) ->
  class_name = read_uint(bytes_array.splice(0,2))
  return [{'class_reference': class_name}, bytes_array]

const_string = (bytes_array) ->
  strlen = read_uint(bytes_array.splice(0,2))
  #TODO: this doesn't actually decode the real unicode repr. But it'll work for ascii...
  rawstr = (String.fromCharCode(c) for c in bytes_array.splice(0,strlen)).join('')
  return [rawstr,bytes_array]

method_signature = (bytes_array) ->
  meth_name = read_uint(bytes_array.splice(0,2))
  type_name = read_uint(bytes_array.splice(0,2))
  return [{'method_signature':[meth_name,type_name]},bytes_array]

const_int32 = (bytes_array) ->
  uint32 = read_uint(bytes_array.splice(0,4))
  int32 = -(1 + ~uint32)  # convert to signed integer
  return [int32,bytes_array]

const_float = (bytes_array) ->
  uint32 = read_uint(bytes_array.splice(0,4))
  sign = (uint32 &       0x80000000)>>>31
  exponent = (uint32 &   0x7F800000)>>>23
  significand = uint32 & 0x007FFFFF
  single = Math.pow(-1,sign)*significand*Math.pow(2,-23)*Math.pow(2,exponent-127)
  return [single,bytes_array]

class root.ConstantPool
  constructor: () ->
    @constant_pool = [null]  # indexes from 1, so we'll pad the array
  
  parse: (bytes_array) ->
    #TODO: fill this in for the rest of the tags
    constant_tags = {
      10: method_reference, 7: class_reference, 1: const_string, 12: method_signature, 
      9:field_reference,4: const_float, 3: const_int32
    }
    cp_count = read_uint(bytes_array.splice(0,2))
    for _ in [1...cp_count]
      tag = bytes_array.shift()
      throw "invalid tag: #{tag}" unless 1 <= tag <= 12
      [val,bytes_array] = constant_tags[tag](bytes_array)
      @constant_pool.push val
    return bytes_array
  
  condense: () ->
    #TODO: straighten out the references in the array (preserving indices)
    return @constant_pool
