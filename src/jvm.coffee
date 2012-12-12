
# pull in external modules
require './runtime'
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

# main function that gets called from the frontend
root.run_class = (rs, class_name, cmdline_args, done_cb) ->
  return unless rs.run_until_finished (-> rs.init_threads()), (->), true

  unless rs.system_initialized?
    return unless rs.run_until_finished (-> rs.init_system_class()), (->), true

  main_spec = class: class_name, sig: 'main([Ljava/lang/String;)V'
  rs.init_args cmdline_args
  main_method = rs.method_lookup main_spec
  done_cb ?= (->)  # make sure it exists, so we know when to delete the main thread
  rs.run_until_finished (-> main_method.setup_stack(rs)), done_cb
