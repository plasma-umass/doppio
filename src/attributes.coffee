
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util'
opcodes ?= require './opcodes'

# things assigned to root will be available outside this module
root = this 

class ExceptionHandler
  parse: (bytes_array,constant_pool) ->
    @start_pc   = util.read_uint(bytes_array.splice(0,2))
    @end_pc     = util.read_uint(bytes_array.splice(0,2))
    @handler_pc = util.read_uint(bytes_array.splice(0,2))
    cti = util.read_uint(bytes_array.splice(0,2))
    @catch_type = if cti==0 then "<all>" else constant_pool.get(cti).deref()
    return bytes_array

class Code
  parse: (bytes_array,constant_pool) ->
    @max_stack = util.read_uint(bytes_array.splice(0,2))
    @max_locals = util.read_uint(bytes_array.splice(0,2))
    @code_len = util.read_uint(bytes_array.splice(0,4))
    throw "Attribute._parse_code: Code length is zero" if @code_len == 0
    code_array = new util.BytesArray bytes_array.splice(0, @code_len)
    @opcodes = @parse_code code_array, constant_pool
    except_len = util.read_uint(bytes_array.splice(0,2))
    @exception_handlers = (new ExceptionHandler for _ in [0...except_len])
    for eh in @exception_handlers
      bytes_array = eh.parse(bytes_array,constant_pool)
    # yes, there are even attrs on attrs. BWOM... BWOM...
    [@attrs,bytes_array] = root.make_attributes(bytes_array,constant_pool)
    return bytes_array

  parse_code: (bytes_array, constant_pool) ->
    rv = {}
    while bytes_array.has_bytes()
      op_index = bytes_array.index
      c = bytes_array.get_uint(1)
      op = Object.create(opcodes.opcodes[c])
      op.take_args(bytes_array, constant_pool)
      rv[op_index] = op
    return rv

  each_opcode: (fn) ->
    for i in [0..@code_len] when i of @opcodes
      fn(i, @opcodes[i])

class LineNumberTable extends Array
  parse: (bytes_array,constant_pool) ->
    lnt_len = util.read_uint(bytes_array.splice(0,2))
    for _ in [0...lnt_len]
      spc = util.read_uint(bytes_array.splice(0,2))
      ln = util.read_uint(bytes_array.splice(0,2))
      this.push {'start_pc': spc,'line_number': ln}
    return bytes_array

class SourceFile
  parse: (bytes_array,constant_pool) ->
    @name = constant_pool.get(util.read_uint(bytes_array.splice(0,2))).value
    return bytes_array

class StackMapTable
  parse: (bytes_array, constant_pool) ->
    parse_entries = ->
      frame_type = bytes_array.shift()
      if 0 <= frame_type < 64
        { frame_type: frame_type, frame_name: 'same' }
      else if 64 <= frame_type < 128
        { 
          frame_type: frame_type
          frame_name: 'same_locals_1_stack_item'
          verification_info: parse_verification_type_info()
        }
      else if frame_type == 247
        {
          frame_type: frame_type
          frame_name: 'same_locals_1_stack_item_extended'
          offset_delta: util.read_uint bytes_array.splice(0, 2)
          verification_info: parse_verification_type_info()
        }
      else if 248 <= frame_type < 251
        {
          frame_type: frame_type
          frame_name: 'chop'
          offset_delta: util.read_uint bytes_array.splice(0, 2)
        }
      else if frame_type == 251
        {
          frame_type: frame_type
          frame_name: 'same_frame_extended'
          offset_delta: util.read_uint bytes_array.splice(0, 2)
        }
      else if 252 <= frame_type < 255
        {
          frame_type: frame_type
          frame_name: 'append'
          offset_delta: util.read_uint bytes_array.splice(0, 2)
          locals: parse_verification_type_info() for i in [0...frame_type-251]
        }
      else if frame_type == 255
        {
          frame_type: frame_type
          frame_name: 'full_frame'
          offset_delta: util.read_uint bytes_array.splice(0, 2)
          num_locals: num_locals = util.read_uint bytes_array.splice(0, 2)
          locals: parse_verification_type_info() for i in [0...num_locals]
          num_stack_items: num_stack_items = util.read_uint bytes_array.splice(0, 2)
          stack: parse_verification_type_info() for i in [0...num_stack_items]
        }

    parse_verification_type_info = ->
      tag = bytes_array.shift()
      if tag == 7
        'class' + constant_pool.get(util.read_uint bytes_array.splice(0, 2)).deref()
      else
        tag_to_type = [ 'top', 'int', 'float', 'long', 'double', 'null', 'this', 'object', 'uninitialized' ]
        tag_to_type[tag]

    @num_entries = util.read_uint(bytes_array.splice(0, 2))
    @entries = (parse_entries() for i in [0...@num_entries])
    return bytes_array


class LocalVariableTable
  parse: (bytes_array, constant_pool) ->
    @num_entries = util.read_uint bytes_array.splice 0, 2
    @entries = (@parse_entries bytes_array, constant_pool for i in [0...@num_entries])
    return bytes_array

  parse_entries: (bytes_array, constant_pool) ->
    {
      start_pc: util.read_uint bytes_array.splice 0, 2
      length: util.read_uint bytes_array.splice 0, 2
      name: constant_pool.get(util.read_uint bytes_array.splice 0, 2).value
      descriptor: constant_pool.get(util.read_uint bytes_array.splice 0, 2).value
      ref: util.read_uint bytes_array.splice 0, 2
    }

class Exceptions
  parse: (bytes_array, constant_pool) ->
    @num_exceptions = util.read_uint bytes_array.splice 0, 2
    @exception_refs = (util.read_uint(bytes_array.splice(0,2)) for i in [0...@num_exceptions])
    return bytes_array

class InnerClasses
  parse: (bytes_array, constant_pool) ->
    num_classes = util.read_uint bytes_array.splice 0, 2
    @classes = (@parse_class bytes_array, constant_pool for i in [0...num_classes])
    return bytes_array

  parse_class: (bytes_array, constant_pool) ->
    {
      inner_info_index: util.read_uint bytes_array.splice 0, 2
      outer_info_index: util.read_uint bytes_array.splice 0, 2
      inner_name_index: util.read_uint bytes_array.splice 0, 2
      inner_access_flags: util.read_uint bytes_array.splice 0, 2
    }

class ConstantValue
  parse: (bytes_array, constant_pool) ->
    @ref = util.read_uint bytes_array.splice 0, 2
    @value = constant_pool.get(@ref).value
    return bytes_array

root.make_attributes = (bytes_array,constant_pool) ->
  #TODO: add classes for NYI attr types
  attr_types = {
    'Code': Code, 'LineNumberTable': LineNumberTable, 'SourceFile': SourceFile,
    'StackMapTable': StackMapTable, 'LocalVariableTable': LocalVariableTable,
    'ConstantValue': ConstantValue, 'Exceptions': Exceptions,
    'InnerClasses': InnerClasses, 'Synthetic': 'NYI'
  }
  num_attrs = util.read_uint(bytes_array.splice(0,2))
  attrs = []
  for _ in [0...num_attrs]
    name = constant_pool.get(util.read_uint(bytes_array.splice(0,2))).value
    attr_len = util.read_uint(bytes_array.splice(0,4))  # unused if the attr is defined
    if attr_types[name]?
      throw "NYI: attr_type #{name}" if attr_types[name] is 'NYI'
      attr = new attr_types[name]
      bytes_array = attr.parse(bytes_array,constant_pool)
      attrs.push attr
    else # we must silently ignore other attrs
      # console.log "ignoring #{attr_len} bytes for attr #{name}"
      bytes_array.splice(0, attr_len)
  return [attrs,bytes_array]

module?.exports = root.make_attributes
