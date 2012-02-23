
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util'
ConstantPool ?= require './constant_pool'
make_attributes ?= require './attributes'
runtime ?= require './runtime'

class AbstractMethodField
  """ Subclasses need to implement parse_descriptor(String) """
  parse: (bytes_array,constant_pool) ->
    @access_flags = util.parse_flags(util.read_uint(bytes_array.splice(0,2)))
    @name = constant_pool.get(util.read_uint(bytes_array.splice(0,2))).value
    raw_descriptor = constant_pool.get(util.read_uint(bytes_array.splice(0,2))).value
    @parse_descriptor raw_descriptor
    [@attrs,bytes_array] = make_attributes(bytes_array,constant_pool)
    return bytes_array
  
  parse_field_type: (char_array) ->
    c = char_array.shift()
    switch c
      when 'B' then { type: 'byte' }
      when 'C' then { type: 'char' }
      when 'D' then { type: 'double' }
      when 'F' then { type: 'float' }
      when 'I' then { type: 'int' }
      when 'J' then { type: 'long' }
      when 'L' then {
        type: 'reference'
        ref_type: 'class'
        referent: {
          type: 'class' # not technically a legal type
          class_name: (c while (c = char_array.shift()) != ';').join('')
        }
      }
      when 'S' then { type: 'short' }
      when 'Z' then { type: 'boolean' }
      when '[' then {
        type: 'reference'
        ref_type: 'array'
        referent: @parse_field_type char_array
      }
      else
        char_array.unshift(c)
        return null

class Method extends AbstractMethodField
  get_code: ->
    return _.find(@attrs, (a) -> a.constructor.name == "Code")

  parse_descriptor: (raw_descriptor) ->
    raw_descriptor = raw_descriptor.split ''
    throw "Invalid descriptor #{raw_descriptor}" if raw_descriptor.shift() != '('
    @param_types = # apparently making this a one-liner makes this undefined. CS bug?
      while field = @parse_field_type raw_descriptor
        field
    throw "Invalid descriptor #{raw_descriptor}" if raw_descriptor.shift() != ')'
    @num_args = @param_types.length
    @num_args++ unless @access_flags.static # nonstatic methods get 'this'
    if raw_descriptor[0] == 'V'
      raw_descriptor.shift()
      @return_type = { type: 'void' }
    else
      @return_type = @parse_field_type raw_descriptor

  take_params: (caller_stack) ->
    params = []
    type_size = (t) -> (if t in ['double','long'] then 2 else 1)
    n_bytes = util.sum(type_size(p.type) for p in @param_types)
    n_bytes++ unless @access_flags.static
    caller_stack.splice(caller_stack.length-n_bytes,n_bytes)
  
  run: (runtime_state) ->
    caller_stack = runtime_state.curr_frame().stack
    params = @take_params caller_stack
    runtime_state.meta_stack.push(new runtime.StackFrame(params,[]))
    runtime_state.print "entering method #{@name}"
    code = @get_code().opcodes
    while true
      cf = runtime_state.curr_frame()
      op = code[runtime_state.curr_pc()]
      runtime_state.print "before #{op.name} -> stack: [#{cf.stack}], local: [#{cf.locals}]"
      op.execute runtime_state
      if op.name.match /.*return/
        s = runtime_state.meta_stack.pop().stack
        if op.name in ['ireturn','freturn','areturn']
          caller_stack.push s.pop()
        else if op.name in ['lreturn','dreturn']
          caller_stack.push s.pop()
          caller_stack.push undefined
        break
      runtime_state.inc_pc(1 + op.byte_count)  # just moves to the next opcode

class Field extends AbstractMethodField
  parse_descriptor: (raw_descriptor) ->
    @type = @parse_field_type raw_descriptor.split ''

class @ClassFile
  constructor: (bytes_array) ->
    read_u2 = -> util.read_uint(bytes_array.splice(0,2))
    read_u4 = -> util.read_uint(bytes_array.splice(0,4))
    throw "Magic number invalid" if read_u4() != 0xCAFEBABE
    @minor_version = read_u2()
    @major_version = read_u2()
    throw "Major version invalid" unless 45 <= @major_version <= 51
    @constant_pool = new ConstantPool
    bytes_array = @constant_pool.parse(bytes_array)
    # bitmask for {public,final,super,interface,abstract} class modifier
    @access_flags = util.parse_flags read_u2()
    @this_class  = @constant_pool.get(read_u2()).deref()
    @super_class = @constant_pool.get(read_u2()).deref()
    # direct interfaces of this class
    isize = read_u2()
    @interfaces = (read_u2() for _ in [0...isize])
    # fields of this class
    num_fields = read_u2()
    #TODO: replace the new Method call with something for fields (method_info and field_info look the same)
    @fields = (new Field for _ in [0...num_fields])
    for f in @fields
      bytes_array = f.parse(bytes_array,@constant_pool)
    # class methods
    num_methods = read_u2()
    @methods = (new Method for _ in [0...num_methods])
    for m in @methods
      bytes_array = m.parse(bytes_array,@constant_pool)
    # class attributes
    [@attrs,bytes_array] = make_attributes(bytes_array,@constant_pool)
    throw "Leftover bytes in classfile: #{bytes_array}" if bytes_array.length > 0

module?.exports = @ClassFile
