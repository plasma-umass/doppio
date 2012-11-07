
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
      "<#{@type} [#{@array}] (*#{@ref})>"
    else
      "<#{@type} of length #{@array.length} (*#{@ref})>"


class root.JavaObject
  constructor: (@type, rs, obj={}) ->
    @ref = rs.high_oref++
    # init fields from this and inherited ClassFiles
    cls = rs.class_lookup @type, true
    @fields = cls.construct_fields(rs, @type)
    # init fields from manually given object
    for k,v of obj
      slot_val = @fields[k]
      if slot_val?.$first?
        slot_val.$first = v
      else
        @fields[k] = v

  clone: (rs) ->
    # note: we don't clone the type, because they're effectively immutable
    new root.JavaObject @type, rs, _.clone(@fields)

  set_field: (name, val, for_class) ->
    slot_val = @fields[name]
    unless slot_val?.$first?  # not shadowed
      @fields[name] = val
      return
    # shadowed
    unless for_class? or slot_val[for_class]?
      slot_val.$first = val
    else
      slot_val[for_class] = val

  get_field: (name, for_class) ->
    slot_val = @fields[name]
    return slot_val unless slot_val?.$first?
    return slot_val.$first unless for_class? or slot_val[for_class]?
    slot_val[for_class]

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
      "<#{@type} '#{@jvm2js_str()}' (*#{@ref})>"
    else
      "<#{@type} (*#{@ref})>"

  # Convert a Java String object into an equivalent JS one.
  jvm2js_str: ->
    util.chars2js_str(@fields.value, @fields.offset, @fields.count)


class root.JavaClassObject extends root.JavaObject
  constructor: (rs, @$type, defer_init=false) ->
    @type = types.c2t 'java/lang/Class'
    @fields = {}
    @init_fields unless defer_init
    @get_fields = (->)

  construct_fields: (rs, t) ->
    if @fields_init? then return new @get_fields()
    fields_proto = {}
    # init fields from this and inherited ClassFiles
    while t?
      cls = rs.class_lookup t
      for f in cls.fields when not f.access_flags.static
        val = util.initial_value f.raw_descriptor
        slot_val = fields_proto[f.name]
        if typeof slot_val isnt 'undefined'
          # Field shadowing.
          unless slot_val?.$first?
            fields_proto[f.name] = slot_val = {$first: slot_val}
          slot_val[t.toClassString()] = val
        else
          fields_proto[f.name] = val
      t = cls.super_class
    Object.freeze(fields_proto)
    @get_fields.prototype = fields_proto
    @fields_init = true
    return @construct_fields(rs, t)

  init_fields: (rs) ->
    cls = rs.class_lookup @type
    for f in cls.fields when not f.access_flags.static
      @fields[f.name] = util.initial_value f.raw_descriptor

  # Used for setting a class' static fields
  set_static: (name, val) -> @fields[name] = val

  # Used for getting a class' static fields
  get_static: (name, type) -> @fields[name] ?= util.initial_value type

  toString: -> "<Class #{@$type} (*#{@ref})>"


root.thread_name = (thread) ->
  util.chars2js_str thread.get_field 'name', 'java/lang/Thread'