
_ = require '../vendor/_.js'
util = require './util'
types = require './types'
{vtrace} = require './logging'
{java_throw} = require './exceptions'
{log,debug,error} = require './logging'

"use strict"

# things assigned to root will be available outside this module
root = exports ? window.java_object ?= {}

class root.JavaArray
  constructor: (rs, @type, obj) ->
    @ref = rs.high_oref++
    @array = obj

  clone: (rs) ->
    # note: we don't clone the type, because they're effectively immutable
    new root.JavaArray rs, @type,  _.clone(@array)

  get_field_from_offset: (rs, offset) -> @array[offset.toInt()]
  set_field_from_offset: (rs, offset, value) -> @array[offset.toInt()] = value

  toString: ->
    if @array.length <= 10
      "<#{@type} [#{@array}] (*#{@ref})>"
    else
      "<#{@type} of length #{@array.length} (*#{@ref})>"


class root.JavaObject
  constructor: (rs, @type, @cls, obj={}) ->
    @ref = rs.high_oref++
    # Use default fields as a prototype.
    @fields = Object.create(@cls.get_default_fields(rs))
    for field of obj
      if obj.hasOwnProperty(field)
        @fields[field] = obj[field]
    return


  clone: (rs) ->
    # note: we don't clone the type, because they're effectively immutable
    new root.JavaObject rs, @type, @cls, _.clone(@fields)

  set_field: (rs, name, val) ->
    unless @fields[name] is undefined
      @fields[name] = val
    else
      java_throw rs, 'java/lang/NoSuchFieldError', name
    return

  get_field: (rs, name) ->
    return @fields[name] unless @fields[name] is undefined
    java_throw rs, 'java/lang/NoSuchFieldError', name

  get_field_from_offset: (rs, offset) ->
    f = @_get_field_from_offset rs, @cls, offset.toInt()
    if f.field.access_flags.static
      return rs.static_get({class:@type.toClassString(),name:f.field.name})
    @get_field rs, f.cls + '/' + f.field.name

  _get_field_from_offset: (rs, cls, offset) ->
    classname = cls.this_class.toClassString()
    until cls.fields[offset]?
      unless cls.super_class?
        java_throw rs, 'java/lang/NullPointerException', "field #{offset} doesn't exist in class #{classname}"
      cls = rs.class_lookup(cls.super_class)
    {field: cls.fields[offset], cls: cls.this_class.toClassString()}

  set_field_from_offset: (rs, offset, value) ->
    f = @_get_field_from_offset rs, @cls, offset.toInt()
    if f.field.access_flags.static
      rs.push value
      rs.static_put({class:@type.toClassString(),name:f.field.name})
    else
      @set_field rs, f.cls + '/' + f.field.name, value

  toString: ->
    if @type.toClassString() is 'java/lang/String'
      "<#{@type} '#{@jvm2js_str()}' (*#{@ref})>"
    else
      "<#{@type} (*#{@ref})>"

  # Convert a Java String object into an equivalent JS one.
  jvm2js_str: ->
    util.chars2js_str(@fields['java/lang/String/value'], @fields['java/lang/String/offset'], @fields['java/lang/String/count'])


class root.JavaClassObject extends root.JavaObject
  constructor: (rs, @$type, @file) ->
    type = types.c2t('java/lang/Class')
    super rs, type, rs.class_lookup(type)

  toString: -> "<Class #{@$type} (*#{@ref})>"

root.thread_name = (rs, thread) ->
  util.chars2js_str thread.get_field rs, 'java/lang/Thread/name'
