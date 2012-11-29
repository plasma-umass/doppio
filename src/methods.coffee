
# pull in external modules
_ = require '../vendor/_.js'
util = require './util'
opcodes = require './opcodes'
attributes = require './attributes'
types = require './types'
natives = require './natives'
runtime = require './runtime'
logging = require './logging'
{vtrace,trace,debug_vars} = logging
{java_throw,ReturnException} = require './exceptions'
{opcode_annotators} = require './disassembler'
{str2type,carr2type,c2t} = types
{native_methods,trapped_methods} = natives

"use strict"

# things assigned to root will be available outside this module
root = exports ? this.methods = {}

class AbstractMethodField
  # Subclasses need to implement parse_descriptor(String)
  constructor: (@class_type) ->

  parse: (bytes_array,constant_pool,@idx) ->
    @access_byte = bytes_array.get_uint 2
    @access_flags = util.parse_flags @access_byte
    @name = constant_pool.get(bytes_array.get_uint 2).value
    @raw_descriptor = constant_pool.get(bytes_array.get_uint 2).value
    @parse_descriptor @raw_descriptor
    @attrs = attributes.make_attributes(bytes_array,constant_pool)

class root.Field extends AbstractMethodField
  parse_descriptor: (raw_descriptor) ->
    @type = str2type raw_descriptor

  reflector: (rs) ->
    # note: sig is the generic type parameter (if one exists), not the full
    # field type.
    sig = _.find(@attrs, (a) -> a.constructor.name == "Signature")?.sig
    rs.init_object 'java/lang/reflect/Field', {
      # XXX this leaves out 'annotations'
      clazz: rs.jclass_obj(@class_type)
      name: rs.init_string @name, true
      type: rs.jclass_obj @type
      modifiers: @access_byte
      slot: @idx
      signature: if sig? then rs.init_string sig else null
    }

class root.Method extends AbstractMethodField
  parse_descriptor: (raw_descriptor) ->
    [__,param_str,return_str] = /\(([^)]*)\)(.*)/.exec(raw_descriptor)
    param_carr = param_str.split ''
    @param_types = (field while (field = carr2type param_carr))
    @param_bytes = 0
    for p in @param_types
      @param_bytes += if p.toString() in ['D','J'] then 2 else 1
    @param_bytes++ unless @access_flags.static
    @num_args = @param_types.length
    @num_args++ unless @access_flags.static # nonstatic methods get 'this'
    @return_type = str2type return_str

  full_signature: -> "#{@class_type.toClassString()}::#{@name}#{@raw_descriptor}"

  parse: (bytes_array, constant_pool, idx) ->
    super bytes_array, constant_pool, idx
    sig = @full_signature()
    if (c = trapped_methods[sig])?
      @code = c
      @access_flags.native = true
    else if @access_flags.native
      if (c = native_methods[sig])?
        @code = c
      else if UNSAFE?
        @code = null # optimization: avoid copying around params if it is a no-op.
      else
        @code = (rs) =>
          unless sig.indexOf('::registerNatives()V',1) >= 0 or sig.indexOf('::initIDs()V',1) >= 0
            java_throw rs, 'java/lang/Error', "native method NYI: #{sig}"
    else
      @code = _.find(@attrs, (a) -> a.constructor.name == "Code")

  reflector: (rs, is_constructor=false) ->
    typestr = if is_constructor then 'java/lang/reflect/Constructor' else 'java/lang/reflect/Method'
    exceptions = _.find(@attrs, (a) -> a.constructor.name == 'Exceptions')?.exceptions ? []
    anns = _.find(@attrs, (a) -> a.constructor.name == 'RuntimeVisibleAnnotations')?.raw_bytes
    adefs = _.find(@attrs, (a) -> a.constructor.name == 'AnnotationDefault')?.raw_bytes
    sig =  _.find(@attrs, (a) -> a.constructor.name == 'Signature')?.sig
    rs.init_object typestr, {
      # XXX: missing parameterAnnotations
      clazz: rs.jclass_obj(@class_type)
      name: rs.init_string @name, true
      parameterTypes: rs.init_object "[Ljava/lang/Class;", (rs.jclass_obj(f) for f in @param_types)
      returnType: rs.jclass_obj @return_type
      exceptionTypes: rs.init_object "[Ljava/lang/Class;", (rs.jclass_obj(c2t(e)) for e in exceptions)
      modifiers: @access_byte
      slot: @idx
      signature: if sig? then rs.init_string sig else null
      annotations: if anns? then rs.init_object('[B', anns) else null
      annotationDefault: if adefs? then rs.init_object('[B', adefs) else null
    }

  take_params: (caller_stack) ->
    start = caller_stack.length - @param_bytes
    params = caller_stack.slice(start)
    # this is faster than splice()
    caller_stack.length -= @param_bytes
    params

  RELEASE? || padding = '' # used in debug mode to align instruction traces

  run_manually: (func, rs, params) ->
    converted_params = [rs]
    param_idx = 0
    if not @access_flags.static
      converted_params.push params[0]
      param_idx = 1
    for p in @param_types
      converted_params.push params[param_idx]
      param_idx += if (p.toString() in ['J', 'D']) then 2 else 1
    try
      rv = func converted_params...
    catch e
      e.method_catch_handler?(rs, @)  # handles stack pop, if it's a JavaException
      throw e
    rs.meta_stack().pop()
    ret_type = @return_type.toString()
    unless ret_type == 'V'
      if ret_type == 'Z' then rs.push rv + 0 # cast booleans to a Number
      else rs.push rv
      rs.push null if ret_type in [ 'J', 'D' ]

  run_bytecode: (rs) ->
    try
      @bytecode_loop(rs)
    catch e
      return if e is ReturnException
      throw e unless e.method_catch_handler? # JVM Error
      e.method_catch_handler(rs, @)
      @run_bytecode(rs)

  bytecode_loop: (rs) ->
    # main eval loop: execute each opcode, using the pc to iterate through
    code = @code.opcodes
    cf = rs.curr_frame()
    while true
      op = code[cf.pc]
      unless RELEASE? or logging.log_level < logging.STRACE
        pc = cf.pc
        throw "#{@name}:#{pc} => (null)" unless op
        vtrace "#{padding}stack: [#{debug_vars cf.stack}], local: [#{debug_vars cf.locals}]"
        annotation =
          util.call_handler(opcode_annotators, op, pc, rs.class_lookup(@class_type).constant_pool) or ""
        vtrace "#{padding}#{@class_type.toClassString()}::#{@name}:#{pc} => #{op.name}" + annotation

      cf.pc += 1 + op.byte_count if (op.execute rs) isnt false
    # Must explicitly return here, to avoid Coffeescript accumulating an array of cf.pc values
    return

  run: (runtime_state) ->
    ms = runtime_state.meta_stack()
    RELEASE? || padding = new Array(ms.length()).join ' '
    if ms.resuming_stack? # we are resuming from a yield
      ms.resuming_stack++
      if ms.resuming_stack == ms.length() - 1
        ms.resuming_stack = null
      cf = runtime_state.curr_frame()
      if cf.resume? # this was a manually run method
        trace "#{padding}resuming native method #{@full_signature()}"
        @run_manually cf.resume, runtime_state, []
        cf.resume = null
        return
      else
        trace "#{padding}resuming method #{@full_signature()}"
        @run_bytecode runtime_state
    else
      caller_stack = runtime_state.curr_frame().stack
      params = @take_params caller_stack

      if @access_flags.native
        if @code?
          trace "#{padding}entering native method #{@full_signature()}"
          ms.push(new runtime.StackFrame(this,[],[]))
          @run_manually @code, runtime_state, params
        return

      if @access_flags.abstract
        java_throw runtime_state, 'java/lang/Error', "called abstract method: #{@full_signature()}"

      # Finally, the normal case: running a Java method
      trace "#{padding}entering method #{@full_signature()}"
      ms.push(new runtime.StackFrame(this,params,[]))
      if @code.run_stamp < runtime_state.run_stamp
        @code.run_stamp = runtime_state.run_stamp
        @code.parse_code()
      @run_bytecode runtime_state
