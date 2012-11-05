
_ = require '../third_party/_.js'
util = require './util'
types = require './types'
{vtrace} = require './logging'

# things assigned to root will be available outside this module
root = exports ? window.java_object ?= {}

class root.JavaObject
  constructor: (@type, rs, obj={}) ->
    @ref = rs.high_oref++
    if @type instanceof types.ArrayType
      @array = obj
    else
      @fields = obj

  clone: (rs) ->
    # note: we don't clone the type, because they're effectively immutable
    if @type instanceof types.ArrayType
      new root.JavaObject @type, rs, _.clone(@array)
    else
      new root.JavaObject @type, rs, _.clone(@fields)

  set_field: (name, val, type, for_class) ->
    type ?= val.type.toClassString()
    for_class ?= @type.toClassString()
    vtrace "setting #{type} #{name} = #{val} on obj of type #{for_class}"
    @fields[name] = val

  get_field: (name, type, for_class) ->
    for_class ?= @type.toClassString()
    vtrace "getting #{type} #{name} from obj of type #{for_class}"
    slot = @fields[name]
    if typeof slot is 'undefined'
      slot = util.initial_value type
    slot

  get_field_from_offset: (rs, offset) ->
    o = offset.toInt()
    if @type instanceof types.ArrayType
      return @array[o]
    f = rs.get_field_from_offset rs.class_lookup(@type), o
    if f.access_flags.static
      return rs.static_get({class:@type.toClassString(),name:f.name})
    @fields[f.name] ? 0

  set_field_from_offset: (rs, offset, value) ->
    o = offset.toInt()
    if @type instanceof types.ArrayType
      @array[o] = value
      return
    f = rs.get_field_from_offset rs.class_lookup(@type), o
    if f.access_flags.static
      rs.push value
      rs.static_put({class:@type.toClassString(),name:f.name})
    else
      @fields[f.name] = value

  # Convert a Java String object into an equivalent JS one.
  jvm2js_str: () ->
    util.chars2js_str(@fields.value, @fields.offset, @fields.count)

root.thread_name = (thread) ->
  util.chars2js_str thread.get_field 'name', '[C', 'java/lang/Thread'