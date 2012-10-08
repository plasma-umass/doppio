
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'
util ?= require './util'
{log,debug,error} = util

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

run = (rs, fn, done_cb) ->
  try
    fn()
    done_cb?()
    return true
  catch e
    if e instanceof util.JavaException
      error "\nUncaught #{e.exception.type.toClassString()}"
      msg = e.exception.fields.detailMessage
      error "\t#{rs.jvm2js_str msg}" if msg?
      rs.show_state()
      rs.push rs.curr_thread, e.exception
      rs.method_lookup(
        class: 'java/lang/Thread'
        sig: 'dispatchUncaughtException(Ljava/lang/Throwable;)V').run(rs)
    else if e instanceof util.HaltException
      console.error "\nExited with code #{e.exit_code}" unless e.exit_code is 0
    else if e instanceof util.YieldIOException or e instanceof util.YieldException
      retval = null
      e.condition ->
        rs.meta_stack().resuming_stack = 0  # <-- index into the meta_stack of the frame we're resuming
        retval = run rs, fn, done_cb
      return retval
    else
      error "\nInternal JVM Error: #{e?.stack}"
      rs.show_state()
    unless e instanceof util.YieldIOException or e instanceof util.YieldException
      done_cb?()
      return false

# main function that gets called from the frontend
root.run_class = (rs, class_name, cmdline_args, done_cb) ->
  main_spec = class: class_name, sig: 'main([Ljava/lang/String;)V'
  if run rs, (-> rs.initialize(class_name,cmdline_args))
    run rs, (-> rs.method_lookup(main_spec).run(rs)), done_cb
