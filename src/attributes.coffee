"use strict"

# pull in external modules
util = require './util'
opcodes = require './opcodes'

# things assigned to root will be available outside this module
root = exports ? window.attributes ?= {}

class ExceptionHandler
  name: 'ExceptionHandler'
  parse: (bytes_array,constant_pool) ->
    @start_pc   = bytes_array.get_uint 2
    @end_pc     = bytes_array.get_uint 2
    @handler_pc = bytes_array.get_uint 2
    cti = bytes_array.get_uint 2
    @catch_type =
      if cti is 0
        "<any>"
      else
        constant_pool.get(cti).deref()

class Code
  name: 'Code'
  parse: (bytes_array,@constant_pool) ->
    @max_stack = bytes_array.get_uint 2
    @max_locals = bytes_array.get_uint 2
    @code_len = bytes_array.get_uint 4
    RELEASE? || throw "Code.parse error: Code length is zero" if @code_len == 0
    @_code_array = bytes_array.splice(@code_len)
    @opcodes = null
    except_len = bytes_array.get_uint 2
    @exception_handlers = (new ExceptionHandler for [0...except_len])
    for eh in @exception_handlers
      eh.parse bytes_array, constant_pool
    # yes, there are even attrs on attrs. BWOM... BWOM...
    @attrs = root.make_attributes(bytes_array,constant_pool)
    @run_stamp = 0

  parse_code: ->
    @opcodes = new Array @code_len
    while @_code_array.has_bytes()
      op_index = @_code_array.pos()
      c = @_code_array.get_uint 1
      wide = c == 196
      if wide # wide opcode needs to be handled specially
        c = @_code_array.get_uint 1
      RELEASE? || throw "unknown opcode code: #{c}" unless opcodes.opcodes[c]?
      op = Object.create opcodes.opcodes[c]
      op.take_args @_code_array, @constant_pool, wide
      @opcodes[op_index] = op
    @_code_array.rewind()
    return

  each_opcode: (fn) ->
    for i in [0..@code_len] when i of @opcodes
      fn(i, @opcodes[i])
    return

  get_attribute: (name) ->
    for attr in @attrs then if attr.name is name then return attr
    return null

class LineNumberTable
  name: 'LineNumberTable'
  parse: (bytes_array,constant_pool) ->
    @entries = []
    lnt_len = bytes_array.get_uint 2
    for i in [0...lnt_len] by 1
      spc = bytes_array.get_uint 2
      ln = bytes_array.get_uint 2
      @entries.push {'start_pc': spc,'line_number': ln}

  disassemblyOutput: ->
    rv = "  LineNumberTable:\n"
    rv += "   line #{entry.line_number}: #{entry.start_pc}\n" for entry in @entries
    rv

class SourceFile
  name: 'SourceFile'
  parse: (bytes_array,constant_pool) ->
    @filename = constant_pool.get(bytes_array.get_uint 2).value

class StackMapTable
  name: 'StackMapTable'
  parse: (bytes_array, constant_pool) ->
    @num_entries = bytes_array.get_uint 2
    @entries = (parse_entries(bytes_array, constant_pool) for i in [0...@num_entries] by 1)

  parse_entries = (bytes_array, constant_pool) ->
    frame_type = bytes_array.get_uint 1
    if 0 <= frame_type < 64
      { frame_type: frame_type, frame_name: 'same' }
    else if 64 <= frame_type < 128
      {
        frame_type: frame_type
        frame_name: 'same_locals_1_stack_item'
        stack: [parse_verification_type_info(bytes_array, constant_pool)]
      }
    else if 128 <= frame_type < 247
      # reserve for future use
    else if frame_type == 247
      {
        frame_type: frame_type
        frame_name: 'same_locals_1_stack_item_frame_extended'
        offset_delta: bytes_array.get_uint 2
        stack: [parse_verification_type_info(bytes_array, constant_pool)]
      }
    else if 248 <= frame_type < 251
      {
        frame_type: frame_type
        frame_name: 'chop'
        offset_delta: [bytes_array.get_uint 2]
      }
    else if frame_type == 251
      {
        frame_type: frame_type
        frame_name: 'same_frame_extended'
        offset_delta: [bytes_array.get_uint 2]
      }
    else if 252 <= frame_type < 255
      {
        frame_type: frame_type
        frame_name: 'append'
        offset_delta: bytes_array.get_uint 2
        locals: parse_verification_type_info(bytes_array, constant_pool) for i in [0...frame_type-251] by 1
      }
    else if frame_type == 255
      {
        frame_type: frame_type
        frame_name: 'full_frame'
        offset_delta: bytes_array.get_uint 2
        num_locals: num_locals = bytes_array.get_uint 2
        locals: parse_verification_type_info(bytes_array, constant_pool) for i in [0...num_locals] by 1
        num_stack_items: num_stack_items = bytes_array.get_uint 2
        stack: parse_verification_type_info(bytes_array, constant_pool) for i in [0...num_stack_items] by 1
      }

  parse_verification_type_info = (bytes_array, constant_pool) ->
    tag = bytes_array.get_uint 1
    if tag == 7
      cls = constant_pool.get(bytes_array.get_uint 2).deref()
      'class ' + (if /\w/.test cls[0] then util.descriptor2typestr(cls) else "\"#{cls}\"")
    else if tag == 8
      offset = bytes_array.get_uint 2
      'uninitialized ' + offset
    else
      tag_to_type = [ 'bogus', 'int', 'float', 'double', 'long', 'null', 'this', 'object', 'uninitialized' ]
      tag_to_type[tag]

  disassemblyOutput: ->
    rv = "  StackMapTable: number_of_entries = #{@num_entries}\n"
    for entry in @entries
      rv += "   frame_type = #{entry.frame_type} /* #{entry.frame_name} */\n"
      rv += "     offset_delta = #{entry.offset_delta}\n" if entry.offset_delta?
      rv += "     locals = [ #{entry.locals.join(', ')} ]\n" if entry.locals?
      rv += "     stack = [ #{entry.stack.join(', ')} ]\n" if entry.stack?
    rv

class LocalVariableTable
  name: 'LocalVariableTable'
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

  disassemblyOutput: ->
    rv = "  LocalVariableTable:\n   Start  Length  Slot  Name   Signature\n"
    for entry in @entries
      rv += "   #{entry.start_pc}      #{entry.length}      #{entry.ref}"
      rv += "#{entry.name}      #{entry.descriptor}\n"
    rv

class Exceptions
  name: 'Exceptions'
  parse: (bytes_array, constant_pool) ->
    @num_exceptions = bytes_array.get_uint 2
    exc_refs = (bytes_array.get_uint 2 for i in [0...@num_exceptions] by 1)
    @exceptions = (constant_pool.get(ref).deref() for ref in exc_refs)

class InnerClasses
  name: 'InnerClasses'
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
  name: 'ConstantValue'
  parse: (bytes_array, constant_pool) ->
    @ref = bytes_array.get_uint 2
    valref = constant_pool.get(@ref)
    @value = valref.deref?() or valref.value

class Synthetic
  name: 'Synthetic'
  parse: () ->  # NOP

class Deprecated
  name: 'Deprecated'
  parse: () ->  # NOP

class Signature
  name: 'Signature'
  parse: (bytes_array, constant_pool, attr_len) ->
    @raw_bytes = bytes_array.read attr_len
    ref = util.read_uint @raw_bytes
    @sig = constant_pool.get(ref).value

class RuntimeVisibleAnnotations
  name: 'RuntimeVisibleAnnotations'
  parse: (bytes_array, constant_pool, attr_len) ->
    # num_annotations = bytes_array.get_uint 2
    @raw_bytes = bytes_array.read attr_len

class AnnotationDefault
  name: 'AnnotationDefault'
  parse: (bytes_array, constant_pool, attr_len) ->
    @raw_bytes = bytes_array.read attr_len

class EnclosingMethod
  name: 'EnclosingMethod'
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
  for i in [0...num_attrs] by 1
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
