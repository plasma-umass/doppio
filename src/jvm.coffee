
# pull in external modules
require './runtime'
util = require './util'
ClassData = require '../src/ClassData'
{ReferenceClassData} = ClassData
fs = node?.fs ? require 'fs'
{trace} = require '../src/logging'
"use strict"

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

root.classpath = []

root.read_classfile = (cls, cb) ->
  for p in root.classpath
    filename = "#{p}/#{cls}.class"
    continue unless fs.existsSync filename
    try
      data = util.bytestr_to_array fs.readFileSync(filename, 'binary')
      cb(new ReferenceClassData data) if data?
      return
    catch e
      cb(null) # Signifies an error occurred.

# main function that gets called from the frontend
root.run_class = (rs, class_name, cmdline_args, done_cb) ->
  main_spec = class: class_name, sig: 'main([Ljava/lang/String;)V'
  main_method = null
  run_main = ->
    trace "run_main"
    rs.run_until_finished (->
      rs.async_op (resume_cb, except_cb) ->
        rs.initialize_class class_name, null, ((cls)->
          rs.init_args cmdline_args
          # wrap it in run_until_finished to handle any exceptions correctly
          rs.run_until_finished (-> main_method = rs.method_lookup cls, main_spec), true, (success) ->
            return unless success and main_method?
            rs.run_until_finished (-> main_method.setup_stack(rs)), false, (success) ->
              done_cb?() if success
        ), except_cb
    )

  run_program = ->
    trace "run_program"
    rs.run_until_finished (-> rs.init_threads()), true, (success) ->
      return unless success
      if rs.system_initialized?
        run_main()
      else
        rs.run_until_finished (-> rs.init_system_class()), true, (success) ->
          return unless success
          run_main()

  rs.run_until_finished (->
    rs.async_op (resume_cb, except_cb) ->
      rs.preinitialize_core_classes run_program, except_cb
  ), true, (->)
