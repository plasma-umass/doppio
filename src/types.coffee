# We have to deal with three different string representations of types. First,
# there's the 'external' type representation that we usually use with when
# writing in Java -- 'byte', 'char', etc. Then there's the 'internal' type
# representation which is more compact: all primitive types get shortened into a
# single character, and array types are denoted by a '[' prefixed to their
# component types. Non-array classes have their types are denoted by an 'L'
# prefix and a ';' suffix. This format allows multiple type strings to be
# concatenated together and still give an unambiguous parse.
#
# Finally, there are what we call 'class strings'. For ordinary (non-array)
# classes, this is just their class name, sans prefix and suffix. For array
# classes, this is identical to their 'internal' type representation.
#
# Rather confusing, I know.

root = exports ? window.types ?= {}
util = require './util'

"use strict"

root.internal2external =
  B: 'byte'
  C: 'char'
  D: 'double'
  F: 'float'
  I: 'int'
  J: 'long'
  S: 'short'
  V: 'void'
  Z: 'boolean'

external2internal = {}
external2internal[v]=k for k,v of root.internal2external

# consumes characters from the array until it finishes reading one full type.
root.carr2type = (carr) ->
  c = carr.shift()
  return null unless c?
  if c of root.internal2external
    new root.PrimitiveType root.internal2external[c]
  else if c == 'L'
    new root.ClassType((c while (c = carr.shift()) != ';').join(''))
  else if c == '['
    new root.ArrayType root.carr2type carr
  else
    carr.unshift(c)
    throw new Error "Unrecognized type string: #{carr.join ''}"

# fast path: generate type from string
root.str2type = (type_str) ->
  c = type_str[0]
  if c of root.internal2external
    new root.PrimitiveType root.internal2external[c]
  else if c == 'L'
    new root.ClassType(type_str[1...-1])
  else if c == '['
    new root.ArrayType root.str2type type_str[1...]
  else
    throw new Error "Unrecognized type string: #{type_str}"

# another convenience function, for converting class names to
# array types / class types
root.c2t = (type_str) ->
  if not UNSAFE? and type_str instanceof root.Type then throw "#{type_str} is already a Type"
  if type_str[0] == '[' then root.str2type type_str
  else new root.ClassType type_str

class root.Type
  toString: -> @valueOf()

class root.PrimitiveType extends root.Type
  type_cache = {}

  constructor: (name) ->
    return type_cache[name] if type_cache.hasOwnProperty name
    @name = name
    type_cache[name] = @

  valueOf: -> external2internal[@name]

  toExternalString: -> @name

class root.ArrayType extends root.Type
  constructor: (@component_type) ->

  valueOf: -> "[#{@component_type}"

  toClassString: -> @valueOf()

  toExternalString: -> util.ext_classname @valueOf()

class root.ClassType extends root.Type
  constructor: (@class_name) ->

  valueOf: -> "L#{@class_name};"

  toClassString: -> @class_name

  toExternalString: -> util.ext_classname @class_name

is_subclass = (rs, class1, class2) ->
  return true if class1['this_class'] is class2['this_class']
  return false unless class1['super_class']  # it's java/lang/Object, can't go further
  return is_subclass rs, rs.class_lookup(class1.super_class), class2

is_subinterface = (rs, iface1, iface2) ->
  return true if iface1['this_class'] is iface2['this_class']
  for i in iface1.interfaces
    super_iface =  rs.class_lookup root.c2t(iface1.constant_pool.get(i).deref())
    return true if is_subinterface rs, super_iface, iface2
  return false unless iface1['super_class']  # it's java/lang/Object, can't go further
  return is_subinterface rs, rs.class_lookup(iface1.super_class), iface2

# true if :obj can be casted to (i.e. is an instance of) :classname.
root.check_cast = (rs, obj, classname) ->
  root.is_castable(rs, obj.type, root.c2t(classname))

# Returns a boolean indicating if :type1 is an instance of :type2.
# :type1 and :type2 should both be instances of types.Type.
root.is_castable = (rs, type1, type2) ->
  if (type1 instanceof root.PrimitiveType) or (type2 instanceof root.PrimitiveType)
    return type1 == type2
  if type1 instanceof root.ArrayType
    if type2 instanceof root.ArrayType
      return root.is_castable(rs, type1.component_type, type2.component_type)
    c2 = rs.class_lookup(type2)
    return type2.class_name is 'java/lang/Object' unless c2.access_flags.interface
    return type2.class_name in ['java/lang/Cloneable','java/io/Serializable']
  # not an array
  return false if type2 instanceof root.ArrayType
  c1 = rs.class_lookup(type1)
  c2 = rs.class_lookup(type2)
  unless c1.access_flags.interface
    return is_subclass(rs,c1,c2) unless c2.access_flags.interface
    return is_subinterface(rs,c1,c2)  # does class c1 support interface c2?
  # c1 is an interface
  return type2.class_name is 'java/lang/Object' unless c2.access_flags.interface
  return is_subinterface(rs,c1,c2)
