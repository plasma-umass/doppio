
# pull in external modules
_ = require '../third_party/_.js'
runtime = require './runtime'
util = require './util'
{log,debug,error} = require './logging'
{HaltException,YieldException,JavaException} = require './exceptions'

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

run = (rs, fn, done_cb) ->
  try
    fn()
    done_cb?()
    return true
  catch e
    if e instanceof YieldException
      retval = null
      e.condition ->
        rs.meta_stack().resuming_stack = 0  # <-- index into the meta_stack of the frame we're resuming
        retval = run rs, fn, done_cb
      return retval
    else
      if e.toplevel_catch_handler?
        e.toplevel_catch_handler(rs)
      else
        error "\nInternal JVM Error: #{e?.stack}"
        rs.show_state()
      done_cb?()
      return false

# main function that gets called from the frontend
root.run_class = (rs, class_name, cmdline_args, done_cb, compile=false) ->
  main_spec = class: class_name, sig: 'main([Ljava/lang/String;)V'
  if run rs, (-> rs.initialize(class_name,cmdline_args))
    if compile
      # hacky way to test compiled code
      compiler = require './compiler'
      types = require './types'
      console.log "compiling #{class_name}"
      eval compiler.compile(rs.class_lookup(types.c2t(class_name)))
      console.log "running #{class_name}::main"
      gLong = require '../third_party/gLong.js'
      run rs, (-> eval "#{class_name.replace(/\//g,'_')}.main(rs,rs.pop())")
    else
      # normal case
      run rs, (-> rs.method_lookup(main_spec).run(rs)), done_cb
