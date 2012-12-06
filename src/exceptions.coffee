
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

root.ReturnException = {}

class root.YieldException
  constructor: (@condition) ->
  method_catch_handler: (rs, method) ->
    trace "yielding from #{method.full_signature()}"
    throw @

class root.YieldIOException extends root.YieldException
  # empty class

class root.JavaException
  constructor: (@exception) ->

  method_catch_handler: (rs, method) ->
    cf = rs.curr_frame()
    exception_handlers = method.code?.exception_handlers
    etype = @exception.type
    handler = _.find exception_handlers, (eh) ->
      eh.start_pc <= cf.pc < eh.end_pc and
        (eh.catch_type == "<any>" or types.is_castable rs, etype, types.c2t(eh.catch_type))
    if handler?
      trace "caught exception as subclass of #{handler.catch_type}"
      cf.stack = []  # clear out anything on the stack; it was made during the try block
      rs.push @exception
      cf.pc = handler.handler_pc
      return
    # abrupt method invocation completion
    trace "exception not caught, terminating #{method.name}"
    rs.meta_stack().pop()
    throw @

  toplevel_catch_handler: (rs) ->
    debug "\nUncaught #{@exception.type.toClassString()}"
    msg = @exception.get_field rs, 'java/lang/Throwable/detailMessage'
    debug "\t#{msg.jvm2js_str()}" if msg?
    rs.show_state()
    rs.push2 rs.curr_thread, @exception
    rs.method_lookup(
      class: 'java/lang/Thread'
      sig: 'dispatchUncaughtException(Ljava/lang/Throwable;)V').run(rs)

# Simulate the throwing of a Java exception with message :msg. Not very DRY --
# code here is essentially copied from the opcodes themselves -- but
# constructing the opcodes manually is inelegant too.
root.java_throw = (rs, cls, msg) ->
  method_spec = class: cls, sig: '<init>(Ljava/lang/String;)V'
  v = rs.init_object cls # new
  rs.push_array([v,v,rs.init_string msg]) # dup, ldc
  rs.method_lookup(method_spec).run(rs) # invokespecial
  throw new root.JavaException rs.pop() # athrow
