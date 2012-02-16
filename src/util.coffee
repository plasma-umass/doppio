
# pull in external modules
_ ?= require './third_party/underscore-min.js'

# things assigned to root will be available outside this module
root = exports ? this 

root.read_uint = (bytes) -> 
  n = bytes.length-1
  # sum up the byte values shifted left to the right alignment.
  # Javascript is dumb when it comes to actual shifting, so you have to do it manually.
  # (see http://stackoverflow.com/questions/337355/javascript-bitwise-shift-of-long-long-number)
  _.reduce((bytes[i]&0xFF)*Math.pow(2,8*(n-i)) for i in [0..n], ((a,b) -> a+b), 0)

class root.Attribute
  parse: (bytes_array) ->
    @name_idx = read_uint(bytes_array.slice(0,2))
    throw "Invalid constant_pool reference" if @name_idx == 0
    attr_len = read_uint(bytes_array.slice(0,4))
    #TODO: make sure we need to mask here
    @info = (b&0xFF for b in bytes_array.slice(0,attr_len))
    return bytes_array