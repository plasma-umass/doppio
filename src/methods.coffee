
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
gLong ?= require '../third_party/gLong.js'
util ?= require './util'
opcodes ?= require './opcodes'
make_attributes ?= require './attributes'
disassembler ?= require './disassembler'
types ?= require './types'
natives ?= require './natives'
{log,vtrace,trace,debug,error} = util
{opcode_annotators} = disassembler
{str2type,carr2type,c2t} = types
{native_methods,trapped_methods} = natives

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
    @attrs = make_attributes(bytes_array,constant_pool)
    @code = _.find(@attrs, (a) -> a.constructor.name == "Code")

class root.Field extends AbstractMethodField
  parse_descriptor: (@raw_descriptor) ->
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
  parse_descriptor: (@raw_descriptor) ->
    [__,param_str,return_str] = /\(([^)]*)\)(.*)/.exec(@raw_descriptor)
    param_carr = param_str.split ''
    @param_types = (field while (field = carr2type param_carr))
    @param_bytes = 0
    for p in @param_types
      @param_bytes += if p.toString() in ['D','J'] then 2 else 1
    @param_bytes++ unless @access_flags.static
    @num_args = @param_types.length
    @num_args++ unless @access_flags.static # nonstatic methods get 'this'
    @return_type = str2type return_str

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
  
  # used by run and run_manually to print arrays for debugging.
  pa = (a) -> a.map (e)->
    return '!' unless e?
    return "*#{e.ref}" if e.ref?
    return "#{e}L" if e instanceof gLong
    e

  run_manually: (func, rs) ->
    params = rs.curr_frame().locals.slice(0) # make a copy
    converted_params = []
    if not @access_flags.static
      converted_params.push params.shift()
    param_idx = 0
    for p, idx in @param_types
      converted_params.push params[param_idx]
      param_idx += if (@param_types[idx].toString() in ['J', 'D']) then 2 else 1
    try
      rv = func rs, converted_params...
    catch e
      # func may throw a JavaException (if it cannot handle it internally).  In
      # this case, pop the stack anyway but don't push a return value.
      # YieldExceptions should just terminate the function without popping the
      # stack.
      if e instanceof util.JavaException
        rs.meta_stack().pop()
      else if e instanceof util.YieldException or e instanceof util.YieldIOException
        trace "yielding from #{@class_type.toClassString()}::#{@name}#{@raw_descriptor}"
      throw e
    rs.meta_stack().pop()
    unless @return_type.toString() == 'V'
      if @return_type.toString() == 'Z' then rs.push rv + 0 # cast booleans to a Number
      else rs.push rv
      rs.push null if @return_type.toString() in [ 'J', 'D' ]

  run_bytecode: (rs, padding) ->
    # main eval loop: execute each opcode, using the pc to iterate through
    code = @code.opcodes
    while true
      try
        pc = rs.curr_pc()
        op = code[pc]
        unless RELEASE? or util.log_level < util.STRACE
          throw "#{@name}:#{pc} => (null)" unless op
          cf = rs.curr_frame()
          vtrace "#{padding}stack: [#{pa cf.stack}], local: [#{pa cf.locals}]"
          annotation =
            util.lookup_handler(opcode_annotators, op, pc, rs.class_lookup(@class_type).constant_pool) or ""
          vtrace "#{padding}#{@class_type.toClassString()}::#{@name}:#{pc} => #{op.name}" + annotation
        op.execute rs
        rs.inc_pc(1 + op.byte_count)  # move to the next opcode
      catch e
        if e instanceof util.BranchException
          rs.goto_pc e.dst_pc
          continue
        else if e instanceof util.ReturnException
          rs.meta_stack().pop()
          rs.push e.values...
          break
        else if e instanceof util.YieldException or e instanceof util.YieldIOException
          trace "yielding from #{@class_type.toClassString()}::#{@name}#{@raw_descriptor}"
          throw e  # leave everything as-is
        else if e instanceof util.JavaException
          exception_handlers = @code.exception_handlers
          handler = _.find exception_handlers, (eh) ->
            eh.start_pc <= pc < eh.end_pc and
              (eh.catch_type == "<any>" or types.is_castable rs, e.exception.type, c2t(eh.catch_type))
          if handler?
            trace "caught exception as subclass of #{handler.catch_type}"
            rs.curr_frame().stack = []  # clear out anything on the stack; it was made during the try block
            rs.push e.exception
            rs.goto_pc handler.handler_pc
            continue
          else # abrupt method invocation completion
            trace "exception not caught, terminating #{@name}"
            rs.meta_stack().pop()
            throw e
        throw e # JVM Error
    # Must explicitly return here, to avoid Coffeescript accumulating an array of
    #  the return values of rs.inc_pc
    return

  run: (runtime_state,virtual=false) ->
    sig = "#{@class_type.toClassString()}::#{@name}#{@raw_descriptor}"
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
          util.java_throw runtime_state, 'java/lang/Error',
            "undef'd object: (#{caller_stack})[-#{@param_bytes}] (#{sig})"
        m_spec = {class: obj.type.toClassString(), sig: @name + @raw_descriptor}
        m = runtime_state.method_lookup(m_spec)
        #throw "abstract method got called: #{@name}#{@raw_descriptor}" if m.access_flags.abstract
        return m.run(runtime_state)
      params = @take_params caller_stack
      ms.push(new runtime.StackFrame(this,params,[]))
    padding = (' ' for [2...ms.length()]).join('')
    # check for trapped and native methods, run those manually
    cf = runtime_state.curr_frame()
    if cf.resume? # we are resuming from a yield, and this was a manually run method
      trace "#{padding}resuming method #{sig}"
      @run_manually cf.resume, runtime_state
      cf.resume = null
    else if trapped_methods[sig]
      trace "#{padding}entering trapped method #{sig}"
      @run_manually trapped_methods[sig], runtime_state
    else if @access_flags.native
      if sig.indexOf('::registerNatives()V',1) >= 0 or sig.indexOf('::initIDs()V',1) >= 0
        @run_manually ((rs)->), runtime_state # these are all just NOPs
      else if native_methods[sig]
        trace "#{padding}entering native method #{sig}"
        @run_manually native_methods[sig], runtime_state
      else
        try
          util.java_throw runtime_state, 'java/lang/Error', "native method NYI: #{sig}"
        finally
          runtime_state.meta_stack().pop()
    else if @access_flags.abstract
      util.java_throw runtime_state, 'java/lang/Error', "called abstract method: #{sig}"
    else
      trace "#{padding}entering method #{sig}"
      @run_bytecode runtime_state, padding
    cf = runtime_state.curr_frame()
    vtrace "#{padding}stack: [#{pa cf.stack}], local: [#{pa cf.locals}] (method end)"
