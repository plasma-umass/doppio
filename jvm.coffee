
# pull in underscore
_ ?= require './third_party/underscore-min.js'

# things assigned to root will be available outside this module
root = exports ? this

root.parse_bytecode = (bytecode_string) -> 
  (bytecode_string.charCodeAt(i) & 0xFF for i in [0...bytecode_string.length])

read_uint = (bytes) -> 
  n = bytes.length-1
  # sum up the byte values shifted left to the right alignment.
  # Javascript is dumb when it comes to actual shifting, so you have to do it manually.
  # (see http://stackoverflow.com/questions/337355/javascript-bitwise-shift-of-long-long-number)
  _.reduce(bytes[i]*Math.pow(2,8*(n-i)) for i in [0..n], ((a,b) -> a+b), 0)

check_header = (bytes_array) ->
  throw "Bytecode too short" if bytes_array.length < 10
  throw "Magic number invalid" if read_uint(bytes_array[0...4]) != 0xCAFEBABE
  # minor_version = read_uint(bytes_array[4...6])
  throw "Major version invalid" unless 45 <= read_uint(bytes_array[6...8]) <= 51
  # constant_pool size (don't know why it's plus one, but it's in the spec)
  constant_pool_size = read_uint(bytes_array[8...10])-1
  constant_pool = bytes_array[10...10+constant_pool_size]
  access_flags = read_uint(bytes_array[10+constant_pool_size...12+constant_pool_size])
  this_class   = read_uint(bytes_array[12+constant_pool_size...14+constant_pool_size])
  super_class  = read_uint(bytes_array[14+constant_pool_size...16+constant_pool_size])
  # etc.

root.run_jvm = (bytes_array, print_func) ->
  print_func "Running the bytecode now...\n"
  try
    constant_pool = check_header bytes_array
  catch error
    print_func "Error in header: #{error}"
  print_func "JVM run finished.\n"