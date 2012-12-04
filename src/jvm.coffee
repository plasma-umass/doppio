
# pull in external modules
require './runtime'
{debug,error} = require './logging'
exceptions = require './exceptions'
util = require './util'
ClassFile = require '../src/ClassFile'
fs = node?.fs ? require 'fs'

"use strict"

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

root.classpath = []
root.jspath = []

root.read_classfile = (cls) ->
  for p in root.jspath
    filename = "#{p}/#{cls}.js"
    continue unless fs.existsSync filename
    return require "../#{filename}"
  for p in root.classpath
    filename = "#{p}/#{cls}.class"
    continue unless fs.existsSync filename
    data = util.bytestr_to_array fs.readFileSync(filename, 'binary')
    return new ClassFile data if data?

run_until_finished = (rs, setup_fn, done_cb) ->
  try
    setup_fn()
    sf = rs.curr_frame()
    while sf.runner?
      sf.runner()
      sf = rs.curr_frame()
    done_cb?()
    return true
  catch e
    if e instanceof exceptions.YieldIOException
      retval = null
      e.condition ->
        retval = run_until_finished rs, (->), done_cb
      return retval
    else
      tos = true
      if e.method_catch_handler? and rs.meta_stack().length() > 1
        until e.method_catch_handler(rs, rs.curr_frame().method, tos)
          tos = false
          if rs.meta_stack().length() == 1
            if e.toplevel_catch_handler?
              run_until_finished rs, (-> e.toplevel_catch_handler(rs)), done_cb
            else
              error "\nInternal JVM Error: #{e}"
              error e.stack if e?.stack?
              rs.show_state()
              done_cb?()
            return false
          else
            rs.meta_stack().pop()
        return run_until_finished rs, (->), done_cb

# main function that gets called from the frontend
root.run_class = (rs, class_name, cmdline_args, done_cb) ->
  return unless run_until_finished rs, (-> rs.init_threads())

  unless rs.system_initialized?
    return unless run_until_finished rs, (-> rs.init_system_class())
        
  main_spec = class: class_name, sig: 'main([Ljava/lang/String;)V'
  rs.init_args cmdline_args
  main_method = null
  return unless run_until_finished rs, (-> main_method = rs.method_lookup(main_spec))
  run_until_finished rs, (-> main_method.setup_stack(rs)), done_cb
