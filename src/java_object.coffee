
_ = require '../third_party/_.js'
util = require './util'
types = require './types'
{vtrace} = require './logging'

# things assigned to root will be available outside this module
root = exports ? window.java_object ?= {}

class root.JavaArray
  constructor: (@type, rs, obj) ->
    @ref = rs.high_oref++
    @array = obj

  clone: (rs) ->
    # note: we don't clone the type, because they're effectively immutable
    new root.JavaArray @type, rs, _.clone(@array)

  get_field_from_offset: (rs, offset) -> @array[offset.toInt()]
  set_field_from_offset: (rs, offset, value) -> @array[offset.toInt()] = value

  toString: ->
    if @array.length <= 10
      "<#{@type} [#{@array}]>"
    else
      "<#{@type} (length-#{@array.length})>"


class root.JavaObject
  constructor: (@type, rs, obj={}) ->
    @ref = rs.high_oref++
    @fields = obj

  clone: (rs) ->
    # note: we don't clone the type, because they're effectively immutable
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
    f = rs.get_field_from_offset rs.class_lookup(@type), offset.toInt()
    if f.access_flags.static
      return rs.static_get({class:@type.toClassString(),name:f.name})
    @fields[f.name] ? 0

  set_field_from_offset: (rs, offset, value) ->
    f = rs.get_field_from_offset rs.class_lookup(@type), offset.toInt()
    if f.access_flags.static
      rs.push value
      rs.static_put({class:@type.toClassString(),name:f.name})
    else
      @fields[f.name] = value

  toString: ->
    if @type.toClassString() is 'java/lang/String'
      "<#{@type} '#{@jvm2js_str()}'>"
    else
      "<#{@type} (*#{@ref})>"

  # Convert a Java String object into an equivalent JS one.
  jvm2js_str: ->
    util.chars2js_str(@fields.value, @fields.offset, @fields.count)

root.thread_name = (thread) ->
  util.chars2js_str thread.get_field 'name', '[C', 'java/lang/Thread'