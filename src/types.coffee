
root = exports ? this.types = {}

internal2external =
  B: 'byte'
  C: 'char'
  D: 'double'
  F: 'float'
  I: 'int'
  J: 'long'
  S: 'short'
  Z: 'boolean'

external2internal = {}
external2internal[v]=k for k,v of internal2external

# convenience function for generating type from string
root.t = (type_str) ->
  if type_str of internal2external
    return new root.PrimitiveType internal2external[type_str]
  else if type_str == 'V'
    return new root.VoidType
  else if type_str[0] == '[' # array
    return new root.ArrayType root.t type_str[1..]
  else if type_str[0] == 'L' # class
    return new root.ClassType type_str[1...type_str.length-1]
  else
    throw new Error "Unrecognized type string: #{type_str}"

# another convenience function, for converting class names to
# array types / class types
root.c2t = (type_str) ->
  if type_str[0] == '[' then root.t type_str
  else new types.ClassType type_str

class root.Type
  valueOf: -> @toString()

class root.PrimitiveType extends root.Type
  constructor: (@name) ->

  toString: -> external2internal[@name]

  toExternalString: -> @name

class root.ArrayType extends root.Type
  constructor: (@component_type) ->

  toString: -> "[#{@component_type}"

  toClassString: -> @toString()

  toExternalString: -> util.ext_classname @toString()

class root.ClassType extends root.Type
  constructor: (@class_name) ->

  toString: -> "L#{@class_name};"

  toClassString: -> @class_name

  toExternalString: -> util.ext_classname @class_name

class root.VoidType extends root.Type
