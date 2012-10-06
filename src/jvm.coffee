
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'
util ?= require './util'
{log,debug,error} = util

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

run = (rs, fn) ->
  try
    fn()
  catch e
    if e instanceof util.JavaException
      debug "\nUncaught Java Exception"
      rs.show_state()
      rs.push rs.curr_thread, e.exception
      rs.method_lookup(
        class: 'java/lang/Thread'
        sig: 'dispatchUncaughtException(Ljava/lang/Throwable;)V').run(rs)
    else if e instanceof util.HaltException
      console.error "\nExited with code #{e.exit_code}" unless e.exit_code is 0
    else if e instanceof util.YieldIOException or e instanceof util.YieldException
      return e.condition ->
        rs.meta_stack().resuming_stack = 0  # <-- index into the meta_stack of the frame we're resuming
        run rs, fn
    else
      console.log "\nInternal JVM Error!", e.stack
      rs.show_state()
    return false
  return true

# main function that gets called from the frontend
root.run_class = (rs, class_name, cmdline_args, done_cb) ->
  main_spec = class: class_name, sig: 'main([Ljava/lang/String;)V'
  return unless run rs, (-> rs.initialize(class_name,cmdline_args))
  return unless run rs, (-> rs.method_lookup(main_spec).run(rs))
  done_cb?()
