
# pull in external modules
_ = require '../vendor/_.js'
util = require './util'
opcodes = require './opcodes'

"use strict"

# things assigned to root will be available outside this module
root = exports ? window.attributes ?= {}

class ExceptionHandler
  parse: (bytes_array,constant_pool) ->
    @start_pc   = bytes_array.get_uint 2
    @end_pc     = bytes_array.get_uint 2
    @handler_pc = bytes_array.get_uint 2
    cti = bytes_array.get_uint 2
    @catch_type = if cti==0 then "<any>" else constant_pool.get(cti).deref()

class Code
  parse: (bytes_array,constant_pool) ->
    @max_stack = bytes_array.get_uint 2
    @max_locals = bytes_array.get_uint 2
    @code_len = bytes_array.get_uint 4
    throw "Code.parse error: Code length is zero" if @code_len == 0
    code_array = bytes_array.splice(@code_len)
    @opcodes = @parse_code code_array, constant_pool
    except_len = bytes_array.get_uint 2
    @exception_handlers = (new ExceptionHandler for [0...except_len])
    for eh in @exception_handlers
      eh.parse bytes_array, constant_pool
    # yes, there are even attrs on attrs. BWOM... BWOM...
    @attrs = root.make_attributes(bytes_array,constant_pool)

  parse_code: (bytes_array, constant_pool) ->
    rv = new Array @code_len
    while bytes_array.has_bytes()
      op_index = bytes_array.pos()
      c = bytes_array.get_uint 1
      wide = c == 196
      if wide # wide opcode needs to be handled specially
        c = bytes_array.get_uint 1
      throw "unknown opcode code: #{c}" unless opcodes.opcodes[c]?
      op = Object.create opcodes.opcodes[c]
      op.take_args bytes_array, constant_pool, wide
      rv[op_index] = op
    return rv

  each_opcode: (fn) ->
    for i in [0..@code_len] when i of @opcodes
      fn(i, @opcodes[i])

class LineNumberTable
  parse: (bytes_array,constant_pool) ->
    @entries = []
    lnt_len = bytes_array.get_uint 2
    for [0...lnt_len]
      spc = bytes_array.get_uint 2
      ln = bytes_array.get_uint 2
      @entries.push {'start_pc': spc,'line_number': ln}

class SourceFile
  parse: (bytes_array,constant_pool) ->
    @name = constant_pool.get(bytes_array.get_uint 2).value

class StackMapTable
  parse: (bytes_array, constant_pool) ->
    parse_entries = ->
      frame_type = bytes_array.get_uint 1
      if 0 <= frame_type < 64
        { frame_type: frame_type, frame_name: 'same' }
      else if 64 <= frame_type < 128
        {
          frame_type: frame_type
          frame_name: 'same_locals_1_stack_item'
          stack: parse_verification_type_info()
        }
      else if 128 <= frame_type < 247
        # reserve for future use
      else if frame_type == 247
        {
          frame_type: frame_type
          frame_name: 'same_locals_1_stack_item_extended'
          offset_delta: bytes_array.get_uint 2
          stack: parse_verification_type_info()
        }
      else if 248 <= frame_type < 251
        {
          frame_type: frame_type
          frame_name: 'chop'
          offset_delta: bytes_array.get_uint 2
        }
      else if frame_type == 251
        {
          frame_type: frame_type
          frame_name: 'same_frame_extended'
          offset_delta: bytes_array.get_uint 2
        }
      else if 252 <= frame_type < 255
        {
          frame_type: frame_type
          frame_name: 'append'
          offset_delta: bytes_array.get_uint 2
          locals: parse_verification_type_info() for i in [0...frame_type-251] by 1
        }
      else if frame_type == 255
        {
          frame_type: frame_type
          frame_name: 'full_frame'
          offset_delta: bytes_array.get_uint 2
          num_locals: num_locals = bytes_array.get_uint 2
          locals: parse_verification_type_info() for i in [0...num_locals] by 1
          num_stack_items: num_stack_items = bytes_array.get_uint 2
          stack: parse_verification_type_info() for i in [0...num_stack_items] by 1
        }

    parse_verification_type_info = ->
      tag = bytes_array.get_uint 1
      if tag == 7
        cls = constant_pool.get(bytes_array.get_uint 2).deref()
        'class ' + (if /\w/.test cls[0] then cls else "\"#{cls}\"")
      else
        tag_to_type = [ 'bogus', 'int', 'float', 'double', 'long', 'null', 'this', 'object', 'uninitialized' ]
        tag_to_type[tag]

    @num_entries = bytes_array.get_uint 2
    @entries = (parse_entries() for i in [0...@num_entries] by 1)


class LocalVariableTable
  parse: (bytes_array, constant_pool) ->
    @num_entries = bytes_array.get_uint 2
    @entries = (@parse_entries bytes_array, constant_pool for i in [0...@num_entries] by 1)

  parse_entries: (bytes_array, constant_pool) ->
    {
      start_pc: bytes_array.get_uint 2
      length: bytes_array.get_uint 2
      name: constant_pool.get(bytes_array.get_uint 2).value
      descriptor: constant_pool.get(bytes_array.get_uint 2).value
      ref: bytes_array.get_uint 2
    }

class Exceptions
  parse: (bytes_array, constant_pool) ->
    @num_exceptions = bytes_array.get_uint 2
    exc_refs = (bytes_array.get_uint 2 for i in [0...@num_exceptions] by 1)
    @exceptions = (constant_pool.get(ref).deref() for ref in exc_refs)

class InnerClasses
  parse: (bytes_array, constant_pool) ->
    num_classes = bytes_array.get_uint 2
    @classes = (@parse_class bytes_array, constant_pool for i in [0...num_classes] by 1)

  parse_class: (bytes_array, constant_pool) ->
    {
      inner_info_index: bytes_array.get_uint 2
      outer_info_index: bytes_array.get_uint 2
      inner_name_index: bytes_array.get_uint 2
      inner_access_flags: bytes_array.get_uint 2
    }

class ConstantValue
  parse: (bytes_array, constant_pool) ->
    @ref = bytes_array.get_uint 2
    @value = constant_pool.get(@ref).value

class Synthetic
  parse: () ->  # NOP

class Deprecated
  parse: () ->  # NOP

class Signature
  parse: (bytes_array, constant_pool) ->
    ref = bytes_array.get_uint 2
    @sig = constant_pool.get(ref).value

class RuntimeVisibleAnnotations
  parse: (bytes_array, constant_pool, attr_len) ->
    # num_annotations = bytes_array.get_uint 2
    @raw_bytes = bytes_array.read attr_len

class AnnotationDefault
  parse: (bytes_array, constant_pool, attr_len) ->
    @raw_bytes = bytes_array.read attr_len

class EnclosingMethod
  parse: (bytes_array, constant_pool) ->
    @enc_class = constant_pool.get(bytes_array.get_uint 2).deref()
    method_ref = bytes_array.get_uint 2
    if method_ref > 0
      @enc_method = constant_pool.get(method_ref).deref()


root.make_attributes = (bytes_array,constant_pool) ->
  attr_types = {
    'Code': Code, 'LineNumberTable': LineNumberTable, 'SourceFile': SourceFile,
    'StackMapTable': StackMapTable, 'LocalVariableTable': LocalVariableTable,
    'ConstantValue': ConstantValue, 'Exceptions': Exceptions,
    'InnerClasses': InnerClasses, 'Synthetic': Synthetic,
    'Deprecated': Deprecated, 'Signature': Signature,
    'RuntimeVisibleAnnotations': RuntimeVisibleAnnotations,
    'AnnotationDefault': AnnotationDefault,
    'EnclosingMethod': EnclosingMethod,
    # NYI: LocalVariableTypeTable
  }
  num_attrs = bytes_array.get_uint 2
  attrs = []
  for [0...num_attrs]
    name = constant_pool.get(bytes_array.get_uint 2).value
    attr_len = bytes_array.get_uint 4
    if attr_types[name]?
      attr = new attr_types[name]
      old_len = bytes_array.size()
      attr.parse bytes_array, constant_pool, attr_len
      new_len = bytes_array.size()
      if old_len - new_len != attr_len
        #throw new Error "#{name} attribute didn't consume all bytes"
        bytes_array.skip attr_len - old_len + new_len
      attrs.push attr
    else # we must silently ignore other attrs
      # console.log "ignoring #{attr_len} bytes for attr #{name}"
      bytes_array.skip attr_len
  return attrs
