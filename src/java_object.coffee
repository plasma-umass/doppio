
_ = require '../vendor/_.js'
util = require './util'
types = require './types'
{vtrace} = require './logging'
{java_throw} = require './exceptions'

"use strict"

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
    # Object.create(null) avoids interference with Object.prototype's properties
    @fields = Object.create null
    # init fields from this and inherited ClassFiles
    t = @type
    while t?
      cls = rs.class_lookup t
      for f in cls.fields when not f.access_flags.static
        val = util.initial_value f.raw_descriptor
        slot_val = @fields[f.name]
        if typeof slot_val isnt 'undefined'
          # Field shadowing.
          unless slot_val?.$first?
            @fields[f.name] = slot_val = {$first: slot_val}
          slot_val[t.toClassString()] = val
        else
          @fields[f.name] = val
      t = cls.super_class
    # init fields from manually given object
    for k in Object.keys obj
      v = obj[k]
      slot_val = @fields[k]
      if slot_val?.$first?
        slot_val.$first = v
      else
        @fields[k] = v

  clone: (rs) ->
    # note: we don't clone the type, because they're effectively immutable
    new root.JavaObject @type, rs, _.clone(@fields)

  set_field: (rs, name, val, for_class) ->
    slot_val = @fields[name]
    if slot_val is undefined
      java_throw rs, 'java/lang/NoSuchFieldError', name
    else unless slot_val?.$first?  # not shadowed
      @fields[name] = val
    else unless for_class? or slot_val[for_class]?
      slot_val.$first = val
    else
      slot_val[for_class] = val
    return

  get_field: (rs, name, for_class) ->
    slot_val = @fields[name]
    if slot_val is undefined
      java_throw rs, 'java/lang/NoSuchFieldError', name
    else unless slot_val?.$first?
      slot_val
    else unless for_class? or slot_val[for_class]?
      slot_val.$first
    else
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
    @ref = rs.high_oref++
    @type = types.c2t 'java/lang/Class'
    @fields = {}
    @init_fields(rs) unless defer_init

  init_fields: (rs) ->
    cls = rs.class_lookup @type
    for f in cls.fields when not f.access_flags.static
      @fields[f.name] = util.initial_value f.raw_descriptor

  # Used for setting a class' static fields
  set_static: (name, val) -> @fields[name] = val

  # Used for getting a class' static fields
  get_static: (name, type) -> @fields[name] ?= util.initial_value type

  toString: -> "<Class #{@$type} (*#{@ref})>"


root.thread_name = (rs, thread) ->
  util.chars2js_str thread.get_field rs, 'name', 'java/lang/Thread'
