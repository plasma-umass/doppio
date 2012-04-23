
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'
util ?= require './util'
{log,debug,error} = util

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

show_state = (rs) ->
  cf = rs.curr_frame()
  s = ((if x?.ref? then x.ref else x) for x in cf.stack)
  l = ((if x?.ref? then x.ref else x) for x in cf.locals)
  debug "stack: [#{s}], locals: [#{l}]"

# main function that gets called from the frontend
root.run_class = (rs, class_name, cmdline_args, done_cb) ->
  main_spec = class: class_name, sig: 'main([Ljava/lang/String;)V'
  run = (fns...) ->
    try
      fns[0]()
      fns.shift()
      if fns.length > 0
        run fns...
      else
        done_cb?()
    catch e
      if e instanceof util.JavaException
        debug "\nUncaught Java Exception"
        show_state(rs)
        rs.push rs.main_thread, e.exception
        #util.log_level = 10
        rs.method_lookup(class: 'java/lang/Thread', sig: 'dispatchUncaughtException(Ljava/lang/Throwable;)V').run(rs)
      else if e instanceof util.HaltException
        console.error "\nExited with code #{e.exit_code}" unless e.exit_code is 0
      else if e instanceof util.YieldException
        e.condition ->
          rs.resuming_stack = 0  # <-- index into the meta_stack of the frame we're resuming
          run fns...
      else
        console.error "\nInternal JVM Error!"
        show_state(rs)
        #console.error e.stack
        throw e
      unless e instanceof util.YieldException
        done_cb?()
  run (-> rs.initialize(class_name,cmdline_args)),
      (-> rs.method_lookup(main_spec).run(rs))
