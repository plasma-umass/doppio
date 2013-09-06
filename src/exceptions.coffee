"use strict"

# pull in external modules
_ = require '../vendor/underscore/underscore.js'
{error,debug} = require './logging'

# things assigned to root will be available outside this module
root = exports ? window.exceptions ?= {}

class root.HaltException
  constructor: (@exit_code) ->
  toplevel_catch_handler: () ->
    error "\nExited with code #{@exit_code}" unless @exit_code is 0

root.ReturnException = 'RETURNEXCEPTION'

class root.YieldException
  constructor: (@condition) ->

class root.YieldIOException extends root.YieldException
  # empty class

class root.JavaException
  constructor: (@exception) ->

  method_catch_handler: (rs, cf, top_of_stack) ->
    method = cf.method
    if not top_of_stack and method.has_bytecode
      cf.pc -= 3  # rewind the invoke opcode
      --cf.pc until cf.pc <= 0 or method.code.opcodes[cf.pc]?.name.match /^invoke/

    # Switch the native frame's runner to its error handler, if it exists.
    if cf.native
      if cf.error?
        cf.runner = ()=>cf.error @
        return true
      return false

    exception_handlers = method.code?.exception_handlers
    ecls = @exception.cls
    handler = _.find exception_handlers, (eh) ->
      # XXX: Kludge. If the class is not loaded, then it is not possible for this to be the correct exception handler
      eh.start_pc <= cf.pc < eh.end_pc and method.cls.loader.get_resolved_class(eh.catch_type, true)? and
        (eh.catch_type == "<any>" or ecls.is_castable method.cls.loader.get_resolved_class(eh.catch_type))
    if handler?
      debug "caught #{@exception.cls.get_type()} in #{method.full_signature()} as subclass of #{handler.catch_type}"
      cf.stack = [@exception]  # clear out anything on the stack; it was made during the try block
      cf.pc = handler.handler_pc
      return true
    # abrupt method invocation completion
    debug "exception not caught, terminating #{method.full_signature()}"
    return false

  toplevel_catch_handler: (rs) ->
    debug "\nUncaught #{@exception.cls.get_type()}"
    msg = @exception.get_field rs, 'Ljava/lang/Throwable;detailMessage'
    debug "\t#{msg.jvm2js_str()}" if msg?
    rs.push2 rs.curr_thread, @exception
    thread_cls = rs.get_bs_class('Ljava/lang/Thread;')
    thread_cls.method_lookup(rs,
      'dispatchUncaughtException(Ljava/lang/Throwable;)V').setup_stack(rs)
