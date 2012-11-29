
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
    first_field_owner = Object.create null
    while t?
      cls = rs.class_lookup t
      for f in cls.fields when not f.access_flags.static
        val = util.initial_value f.raw_descriptor

        if first_field_owner[f.name] isnt undefined
          # Field shadowing.
          if @fields[f.name] isnt undefined
            @fields[first_field_owner[f.name] + '/' + f.name] = @fields[f.name]
            delete @fields[f.name]
          @fields[t.toClassString() + '/' + f.name] = val
        else
          @fields[f.name] = val
          first_field_owner[f.name] = t.toClassString()
      t = cls.super_class

    # init fields from manually given object
    for k in Object.keys obj
      v = obj[k]
      if @fields[k] is undefined
        @fields[first_field_owner[k] + '/' + k] = v
      else
        @fields[k] = v

  clone: (rs) ->
    # note: we don't clone the type, because they're effectively immutable
    new root.JavaObject @type, rs, _.clone(@fields)

  set_field: (rs, name, val, for_class) ->
    unless @fields[name] is undefined
      # Fast path: Not shadowed.
      @fields[name] = val
    else
      lookup_string = for_class + '/' + name
      unless @fields[lookup_string] is undefined
        # Slow path: Shadowed.
        @fields[lookup_string] = val
      else
        # Error
        java_throw rs, 'java/lang/NoSuchFieldError', name
    return

  get_field: (rs, name, for_class) ->
    val = @fields[name]
    return val unless val is undefined
    lookup_string = for_class + '/' + name
    java_throw rs, 'java/lang/NoSuchFieldError', name if @fields[lookup_string] is undefined
    return @fields[lookup_string]

  get_field_from_offset: (rs, offset) ->
    f = rs.get_field_from_offset rs.class_lookup(@type), offset.toInt()
    if f.access_flags.static
      return rs.static_get({class:@type.toClassString(),name:f.name})
    @get_field rs, f.name

  set_field_from_offset: (rs, offset, value) ->
    f = rs.get_field_from_offset rs.class_lookup(@type), offset.toInt()
    if f.access_flags.static
      rs.push value
      rs.static_put({class:@type.toClassString(),name:f.name})
    else
      @set_field rs, f.name, value

  toString: ->
    if @type.toClassString() is 'java/lang/String'
      "<#{@type} '#{@jvm2js_str()}' (*#{@ref})>"
    else
      "<#{@type} (*#{@ref})>"

  # Convert a Java String object into an equivalent JS one.
  jvm2js_str: ->
    util.chars2js_str(@fields.value, @fields.offset, @fields.count)


class root.JavaClassObject extends root.JavaObject
  constructor: (rs, @$type, @file) ->
    super types.c2t('java/lang/Class'), rs

  toString: -> "<Class #{@$type} (*#{@ref})>"

root.thread_name = (rs, thread) ->
  util.chars2js_str thread.get_field rs, 'name', 'java/lang/Thread'
