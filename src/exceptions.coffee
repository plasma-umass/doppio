
# pull in external modules
_ = require '../third_party/_.js'
logging = require './logging'
types = require './types'

# things assigned to root will be available outside this module
root = exports ? window.exceptions ?= {}

class root.BranchException
  constructor: (@dst_pc) ->
  method_catch_handler: (rs, method) ->
    rs.goto_pc(@dst_pc)
    return false

class root.HaltException
  constructor: (@exit_code) ->
  toplevel_catch_handler: () ->
    console.error "\nExited with code #{@exit_code}" unless @exit_code is 0


class root.ReturnException
  constructor: (@values...) ->
  method_catch_handler: (rs, method, padding) ->
    cf = rs.meta_stack().pop()
    logging.vtrace "#{padding}stack: [#{logging.debug_vars cf.stack}], local: [#{logging.debug_vars cf.locals}] (end method #{method.name})"
    rs.push @values...
    return true

class root.YieldException
  constructor: (@condition) ->
  method_catch_handler: (rs, method) ->
    logging.trace "yielding from #{method.full_signature()}"
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
      logging.trace "caught exception as subclass of #{handler.catch_type}"
      cf.stack = []  # clear out anything on the stack; it was made during the try block
      rs.push @exception
      cf.pc = handler.handler_pc
      return false
    # abrupt method invocation completion
    logging.trace "exception not caught, terminating #{method.name}"
    rs.meta_stack().pop()
    throw @

  toplevel_catch_handler: (rs) ->
    logging.error "\nUncaught #{@exception.type.toClassString()}"
    msg = @exception.fields.detailMessage
    logging.error "\t#{msg.jvm2js_str()}" if msg?
    rs.show_state()
    rs.push rs.curr_thread, @exception
    rs.method_lookup(
      class: 'java/lang/Thread'
      sig: 'dispatchUncaughtException(Ljava/lang/Throwable;)V').run(rs)

# Simulate the throwing of a Java exception with message :msg. Not very DRY --
# code here is essentially copied from the opcodes themselves -- but
# constructing the opcodes manually is inelegant too.
root.java_throw = (rs, cls, msg) ->
  method_spec = class: cls, sig: '<init>(Ljava/lang/String;)V'
  v = rs.init_object cls # new
  rs.push(v,v,rs.init_string msg) # dup, ldc
  rs.method_lookup(method_spec).run(rs) # invokespecial
  throw new root.JavaException rs.pop() # athrow