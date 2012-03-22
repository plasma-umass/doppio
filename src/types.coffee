
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
root.str2type = (type_str) -> root.carr2type type_str.split('')

root.carr2type = (carr) ->
  c = carr.shift()
  return null unless c?
  if c of internal2external
    new root.PrimitiveType internal2external[c]
  else if c == 'V'
    new root.VoidType
  else if c == 'L'
    new root.ClassType((c while (c = carr.shift()) != ';').join(''))
  else if c == '['
    new root.ArrayType root.carr2type carr
  else
    carr.unshift(c)
    throw new Error "Unrecognized type string: #{carr.join ''}"

# another convenience function, for converting class names to
# array types / class types
root.c2t = (type_str) ->
  if type_str[0] == '[' then root.str2type type_str
  else new root.ClassType type_str

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
  toString: -> 'V'

  toExternalString: -> 'void'
