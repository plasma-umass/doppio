
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

# main function that gets called from the frontend
root.run = (class_data, print_func, cmdline_args) ->
  console.log cmdline_args
  console.log class_data
  rs = new runtime.RuntimeState(class_data.constant_pool, print_func, [cmdline_args])
  main_method = _.find(class_data.methods, (m) -> m.name == 'main')
  print_func "State initialized.\n"
  main_method.run(rs)
  print_func "JVM run finished.\n"
