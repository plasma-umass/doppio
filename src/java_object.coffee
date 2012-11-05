
util = require './util'
types = require './types'
{vtrace} = require './logging'

# things assigned to root will be available outside this module
root = exports ? window.java_object ?= {}

class root.JavaObject
  constructor: (@type, rs, obj={}) ->
    @ref = rs.high_oref++
    if type instanceof types.ArrayType
      @array = obj
    else
      @fields = obj

  set_field: (name, fclass, type, val) ->
    vtrace "setting #{type} #{name} = #{val} on obj of type #{fclass}"
    @fields[name] = val

  get_field: (rs, name, fclass, type) ->
    vtrace "getting #{type} #{name} from obj of type #{fclass}"
    slot = @fields[name]
    if typeof slot is 'undefined'
      slot = util.initial_value type
    slot

  # Convert a Java String object into an equivalent JS one.
  jvm2js_str: () ->
    util.chars2js_str(@fields.value, @fields.offset, @fields.count)
