"use strict"

_ = require '../vendor/underscore/underscore.js'
util = require './util'
{log,debug,error,trace,vtrace} = require './logging'
CustomClassLoader = undefined # XXX: Circular dependency hack.

# things assigned to root will be available outside this module
root = exports ? window.java_object ?= {}

class root.JavaArray
  constructor: (rs, @cls, obj) ->
    @ref = rs.high_oref++
    @array = obj

  clone: (rs) ->
    # note: we don't clone the type, because they're effectively immutable
    new root.JavaArray rs, @cls,  _.clone(@array)

  get_field_from_offset: (rs, offset) -> @array[offset.toInt()]
  set_field_from_offset: (rs, offset, value) -> @array[offset.toInt()] = value

  toString: ->
    if @array.length <= 10
      "<#{@cls.get_type()} [#{@array}] (*#{@ref})>"
    else
      "<#{@cls.get_type()} of length #{@array.length} (*#{@ref})>"

  serialize: (visited) ->
    return "<*#{@ref}>" if @ref of visited
    visited[@ref] = true
    {
      type: @cls.get_type()
      ref: @ref
      array: (f?.serialize?(visited) ? f for f in @array)
    }

class root.JavaObject
  constructor: (rs, @cls, obj={}) ->
    @ref = rs.high_oref++
    # Use default fields as a prototype.
    @fields = Object.create(@cls.get_default_fields())
    for field of obj
      if obj.hasOwnProperty(field)
        @fields[field] = obj[field]
    return

  clone: (rs) ->
    # note: we don't clone the type, because they're effectively immutable
    new root.JavaObject rs, @cls, _.clone(@fields)

  set_field: (rs, name, val) ->
    unless @fields[name] is undefined
      @fields[name] = val
    else
      rs.java_throw @cls.loader.get_initialized_class('Ljava/lang/NoSuchFieldError;'), name
    return

  get_field: (rs, name) ->
    return @fields[name] unless @fields[name] is undefined
    rs.java_throw @cls.loader.get_initialized_class('Ljava/lang/NoSuchFieldError;'), name

  get_field_from_offset: (rs, offset) ->
    f = @_get_field_from_offset rs, @cls, offset.toInt()
    if f.field.access_flags.static
      return f.cls_obj.static_get rs, f.field.name
    return @get_field rs, f.cls + f.field.name

  _get_field_from_offset: (rs, cls, offset) ->
    classname = cls.get_type()
    while cls?
      jco_ref = cls.get_class_object(rs).ref
      f = cls.get_fields()[offset - jco_ref]
      return {field: f, cls: cls.get_type(), cls_obj: cls} if f?
      cls = cls.get_super_class()
    rs.java_throw @cls.loader.get_initialized_class('Ljava/lang/NullPointerException;'),
      "field #{offset} doesn't exist in class #{classname}"

  set_field_from_offset: (rs, offset, value) ->
    f = @_get_field_from_offset rs, @cls, offset.toInt()
    if f.field.access_flags.static
      f.cls_obj.static_put rs, f.field.name, value
    else
      @set_field rs, f.cls + f.field.name, value

  toString: ->
    if @cls.get_type() is 'Ljava/lang/String;'
      "<#{@cls.get_type()} '#{@jvm2js_str()}' (*#{@ref})>"
    else
      "<#{@cls.get_type()} (*#{@ref})>"

  serialize: (visited) ->
    return "<*#{@ref}>" if @ref of visited
    visited[@ref] = true
    fields = {}
    fields[k] = v?.serialize?(visited) ? v for k,v of @fields
    {
      type: @cls.get_type()
      ref: @ref
      fields: fields
    }

  # Convert a Java String object into an equivalent JS one.
  jvm2js_str: ->
    util.chars2js_str(@fields['Ljava/lang/String;value'],
      @fields['Ljava/lang/String;offset'], @fields['Ljava/lang/String;count'])

class root.JavaClassObject extends root.JavaObject
  constructor: (rs, @$cls) ->
    super rs, rs.get_bs_cl().get_resolved_class('Ljava/lang/Class;')

  toString: -> "<Class #{@$cls.get_type()} (*#{@ref})>"

# Each JavaClassLoaderObject is a unique ClassLoader.
class root.JavaClassLoaderObject extends root.JavaObject
  constructor: (rs, @cls) ->
    super rs, @cls
    # XXX: Circular dependency hack.
    {CustomClassLoader} = require('./ClassLoader') unless CustomClassLoader?
    @$loader = new CustomClassLoader(rs.get_bs_cl(), @)

  serialize: (visited) ->
    return "<*#{@ref}>" if @ref of visited
    visited[@ref] = true
    fields = {}
    fields[k] = v?.serialize?(visited) ? v for k,v of @fields
    loaded = {}
    for type,cls of @$loader.loaded_classes
      loaded["#{type}(#{cls.getLoadState()})"] = cls.loader.serialize(visited)
    {
      type: @cls.get_type()
      ref: @ref
      fields: fields
      loaded: loaded
    }

root.thread_name = (rs, thread) ->
  util.chars2js_str thread.get_field rs, 'Ljava/lang/Thread;name'
