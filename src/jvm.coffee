
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'
util ?= require './util'
{log,debug,error} = util

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

show_state = (rs) ->
  cf = rs.curr_frame()
  if cf?
    s = ((if x?.ref? then x.ref else x) for x in cf.stack)
    l = ((if x?.ref? then x.ref else x) for x in cf.locals)
    debug "stack: [#{s}], locals: [#{l}]"
  else
    error "current frame is undefined. meta_stack looks like:", rs.meta_stack()

# main function that gets called from the frontend
root.run_class = (rs, class_name, cmdline_args, done_cb) ->
  main_spec = class: class_name, sig: 'main([Ljava/lang/String;)V'
  run = (fn) ->
    try
      fn()
    catch e
      if e instanceof util.JavaException
        debug "\nUncaught Java Exception"
        show_state(rs)
        rs.push rs.curr_thread, e.exception
        #util.log_level = 10
        rs.method_lookup(class: 'java/lang/Thread', sig: 'dispatchUncaughtException(Ljava/lang/Throwable;)V').run(rs)
      else if e instanceof util.HaltException
        console.error "\nExited with code #{e.exit_code}" unless e.exit_code is 0
      else if e instanceof util.YieldException
        return e.condition ->
          rs.meta_stack().resuming_stack = 0  # <-- index into the meta_stack of the frame we're resuming
          run fn
      else
        console.log "\nInternal JVM Error!", e.stack
        show_state(rs)
      return false
    return true

  return unless run (-> rs.initialize(class_name,cmdline_args))
  return unless run (-> rs.method_lookup(main_spec).run(rs))
  done_cb?()
