
# pull in external modules
_ = require '../third_party/_.js'
gLong = require '../third_party/gLong.js'
util = require './util'
opcodes = require './opcodes'
attributes = require './attributes'
disassembler = require './disassembler'
types = require './types'
natives = require './natives'
runtime = require './runtime'
logging = require './logging'
{vtrace,trace,debug_vars} = logging
{java_throw} = require './exceptions'
{opcode_annotators} = disassembler
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
    @code = _.find(@attrs, (a) -> a.constructor.name == "Code")

class root.Field extends AbstractMethodField
  parse_descriptor: (raw_descriptor) ->
    @type = str2type raw_descriptor

  reflector: (rs) ->
    rs.init_object 'java/lang/reflect/Field', {
      # XXX this leaves out 'annotations'
      clazz: rs.class_lookup(@class_type,true)
      name: rs.init_string @name, true
      type: rs.class_lookup @type, true
      modifiers: @access_byte
      slot: @idx
      signature: rs.init_string @raw_descriptor
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

  reflector: (rs, is_constructor=false) ->
    typestr = if is_constructor then 'java/lang/reflect/Constructor' else 'java/lang/reflect/Method'
    rs.init_object typestr, {
      # XXX: missing checkedExceptions, annotations, parameterAnnotations, annotationDefault
      clazz: rs.class_lookup(@class_type, true)
      name: rs.init_string @name, true
      parameterTypes: rs.init_object "[Ljava/lang/Class;", (rs.class_lookup(f,true) for f in @param_types)
      returnType: rs.class_lookup @return_type, true
      modifiers: @access_byte
      slot: @idx
      signature: rs.init_string @raw_descriptor
    }

  take_params: (caller_stack) ->
    params = new Array @param_bytes
    start = caller_stack.length - @param_bytes
    for i in [0...@param_bytes] by 1
      params[i] = caller_stack[start + i]
    # this is faster than splice()
    caller_stack.length -= @param_bytes
    params

  run_manually: (func, rs) ->
    params = rs.curr_frame().locals.slice(0) # make a copy
    converted_params = []
    if not @access_flags.static
      converted_params.push params.shift()
    param_idx = 0
    for p in @param_types
      converted_params.push params[param_idx]
      param_idx += if (p.toString() in ['J', 'D']) then 2 else 1
    try
      rv = func rs, converted_params...
    catch e
      e.method_catch_handler?(rs, @)  # handles stack pop, if it's a JavaException
      throw e
    rs.meta_stack().pop()
    ret_type = @return_type.toString()
    unless ret_type == 'V'
      if ret_type == 'Z' then rs.push rv + 0 # cast booleans to a Number
      else rs.push rv
      rs.push null if ret_type in [ 'J', 'D' ]

  run_bytecode: (rs, padding) ->
    # main eval loop: execute each opcode, using the pc to iterate through
    code = @code.opcodes
    cf = rs.curr_frame()
    while true
      pc = cf.pc
      op = code[pc]
      unless RELEASE? or logging.log_level < logging.STRACE
        throw "#{@name}:#{pc} => (null)" unless op
        vtrace "#{padding}stack: [#{debug_vars cf.stack}], local: [#{debug_vars cf.locals}]"
        annotation =
          util.call_handler(opcode_annotators, op, pc, rs.class_lookup(@class_type).constant_pool) or ""
        vtrace "#{padding}#{@class_type.toClassString()}::#{@name}:#{pc} => #{op.name}" + annotation
      try
        op.execute rs
        cf.pc += 1 + op.byte_count  # move to the next opcode
      catch e
        if e.method_catch_handler?
          break if e.method_catch_handler(rs, @, padding)
        else
          throw e # JVM Error
    # Must explicitly return here, to avoid Coffeescript accumulating an array of cf.pc values
    return

  run: (runtime_state,virtual=false) ->
    sig = @full_signature()
    ms = runtime_state.meta_stack()
    if ms.resuming_stack?
      trace "resuming at ", sig
      ms.resuming_stack++
      if virtual
        cf = ms.curr_frame()
        unless cf.method is @
          ms.resuming_stack--
          return cf.method.run(runtime_state)
      if ms.resuming_stack == ms.length() - 1
        ms.resuming_stack = null
    else
      caller_stack = runtime_state.curr_frame().stack
      if virtual
        # dirty hack to bounce up the inheritance tree, to make sure we call the
        # method on the most specific type
        obj = caller_stack[caller_stack.length-@param_bytes]
        unless caller_stack.length-@param_bytes >= 0 and obj?
          java_throw runtime_state, 'java/lang/NullPointerException',
            "null 'this' in virtual lookup for #{sig}"
        return runtime_state.method_lookup({
            class: obj.type.toClassString(), 
            sig: @name + @raw_descriptor
          }).run(runtime_state)
      params = @take_params caller_stack
      ms.push(new runtime.StackFrame(this,params,[]))
    padding = (' ' for [2...ms.length()]).join('')
    # check for trapped and native methods, run those manually
    cf = runtime_state.curr_frame()
    if cf.resume? # we are resuming from a yield, and this was a manually run method
      trace "#{padding}resuming method #{sig}"
      @run_manually cf.resume, runtime_state
      cf.resume = null
      return
    if trapped_methods[sig]
      trace "#{padding}entering trapped method #{sig}"
      return @run_manually trapped_methods[sig], runtime_state
    if @access_flags.native
      if sig.indexOf('::registerNatives()V',1) >= 0 or sig.indexOf('::initIDs()V',1) >= 0
        ms.pop() # these are all just NOPs
        return
      if native_methods[sig]
        trace "#{padding}entering native method #{sig}"
        return @run_manually native_methods[sig], runtime_state
      try
        java_throw runtime_state, 'java/lang/Error', "native method NYI: #{sig}"
      finally
        runtime_state.meta_stack().pop()
    if @access_flags.abstract
      java_throw runtime_state, 'java/lang/Error', "called abstract method: #{sig}"

    # Finally, the normal case: running a Java method
    trace "#{padding}entering method #{sig}"
    @run_bytecode runtime_state, padding
