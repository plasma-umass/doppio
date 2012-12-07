
# pull in external modules
_ = require '../vendor/_.js'
{trace,vtrace,error,debug} = require './logging'
types = require './types'

"use strict"

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

  method_catch_handler: (rs, method, top_of_stack) ->
    cf = rs.curr_frame()
    if not top_of_stack and method.has_bytecode
     cf.pc -= 3  # rewind the invoke opcode
     cf.pc -= 1 until method.code.opcodes[cf.pc]?.constructor.name.match /Invoke/ or cf.pc <= 0
    exception_handlers = method.code?.exception_handlers
    etype = @exception.type
    handler = _.find exception_handlers, (eh) ->
      eh.start_pc <= cf.pc < eh.end_pc and
        (eh.catch_type == "<any>" or types.is_castable rs, etype, types.c2t(eh.catch_type))
    if handler?
      debug "caught exception as subclass of #{handler.catch_type}"
      cf.stack = []  # clear out anything on the stack; it was made during the try block
      rs.push @exception
      cf.pc = handler.handler_pc
      return true
    # abrupt method invocation completion
    debug "exception not caught, terminating #{method.full_signature()}"
    return false

  toplevel_catch_handler: (rs) ->
    debug "\nUncaught #{@exception.type.toClassString()}"
    msg = @exception.get_field rs, 'java/lang/Throwable/detailMessage'
    debug "\t#{msg.jvm2js_str()}" if msg?
    rs.show_state()
    rs.push2 rs.curr_thread, @exception
    rs.method_lookup(
      class: 'java/lang/Thread'
      sig: 'dispatchUncaughtException(Ljava/lang/Throwable;)V').setup_stack(rs)


# Simulate the throwing of a Java exception with message :msg. Not very DRY --
# code here is essentially copied from the opcodes themselves -- but
# constructing the opcodes manually is inelegant too.
root.java_throw = (rs, cls, msg) ->
  method_spec = class: cls, sig: '<init>(Ljava/lang/String;)V'
  v = rs.init_object cls # new
  rs.push_array([v,v,rs.init_string msg]) # dup, ldc
  my_sf = rs.curr_frame()
  rs.method_lookup(method_spec).setup_stack(rs) # invokespecial
  my_sf.runner = ->
    my_sf.runner = (-> my_sf.method.run_bytecode(rs))  # don't re-throw the exception
    throw (new root.JavaException(rs.pop())) # athrow
  throw root.ReturnException
