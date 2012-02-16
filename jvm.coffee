
# pull in underscore
_ ?= require './third_party/underscore-min.js'

# things assigned to root will be available outside this module
root = exports ? this 

read_uint = (bytes) -> 
  n = bytes.length-1
  # sum up the byte values shifted left to the right alignment.
  # Javascript is dumb when it comes to actual shifting, so you have to do it manually.
  # (see http://stackoverflow.com/questions/337355/javascript-bitwise-shift-of-long-long-number)
  _.reduce((bytes[i]&0xFF)*Math.pow(2,8*(n-i)) for i in [0..n], ((a,b) -> a+b), 0)

method_reference = (bytes_array,idx) ->
  class_ref = read_uint(bytes_array[idx...(idx+=2)])
  method_sig = read_uint(bytes_array[idx...(idx+=2)])
  return [{'method_reference':[class_ref,method_sig]}, idx]

class_reference = (bytes_array,idx) ->
  class_name = read_uint(bytes_array[idx...(idx+=2)])
  return [{'class_reference': class_name}, idx]

const_string = (bytes_array,idx) ->
  strlen = read_uint(bytes_array[idx...(idx+=2)])
  #TODO: this doesn't actually decode the real unicode repr. But it'll work for ascii...
  rawstr = (String.fromCharCode(c) for c in bytes_array[idx...(idx+=strlen)]).join('')
  return [rawstr,idx]

method_signature = (bytes_array,idx) ->
  meth_name = read_uint(bytes_array[idx...(idx+=2)])
  type_name = read_uint(bytes_array[idx...(idx+=2)])
  return [{'method_signature':[meth_name,type_name]},idx]

# returns the new offset so the rest of the parse can carry on
parse_constant_pool = (bytes_array,offset,cp_count) ->
  constant_tags = {10: method_reference, 7: class_reference, 1: const_string, 12: method_signature}
  constant_pool = [null]  # indexes from 1 to cp_count-1
  idx = offset
  for _ in [1...cp_count]
    tag = bytes_array[idx++]
    throw "invalid tag: #{tag}" unless 1 <= tag <= 12
    [val,idx] = constant_tags[tag](bytes_array,idx)
    constant_pool.push(val)
  return [constant_pool,idx]

parse_classfile = (bytes_array) ->
  idx = 0  # fancy closure hides the increments
  read_u2 = -> read_uint(bytes_array[idx...(idx+=2)])
  read_u4 = -> read_uint(bytes_array[idx...(idx+=4)])
  throw "Magic number invalid" if read_u4() != 0xCAFEBABE
  minor_version = read_u2()  # unused, but it increments idx
  throw "Major version invalid" unless 45 <= read_u2() <= 51
  class_data = {}
  # the constant pool is annoying to parse
  cp_count = read_u2()
  [class_data['constant_pool'],idx] = parse_constant_pool(bytes_array,idx,cp_count)
  # bitmask for {public,final,super,interface,abstract} class modifier
  class_data['access_flags'] = read_u2()
  # indices into constant_pool for this and super classes. super_class == 0 for Object
  class_data['this_class']   = read_u2()
  class_data['super_class']  = read_u2()
  # direct interfaces of this class
  isize = read_u2()
  class_data['interfaces'] = bytes_array[idx...(idx+=isize)]
  # fields of this class
  fsize = read_u2()
  class_data['fields'] = bytes_array[idx...(idx+=fsize)]
  # class methods
  msize = read_u2()
  class_data['methods'] = bytes_array[idx...(idx+=msize)]
  # class attributes
  asize = read_u2()
  class_data['attrs'] = bytes_array[idx...(idx+=asize)]
  return class_data

# main function that gets called from the frontend
root.run_jvm = (bytecode_string, print_func) ->
  bytes_array = (bytecode_string.charCodeAt(i) for i in [0...bytecode_string.length])
  print_func "Running the bytecode now...\n"
  try
    class_data = parse_classfile bytes_array
  catch error
    print_func "Error in header: #{error}\n"
  print_func "JVM run finished.\n"
  console.log class_data