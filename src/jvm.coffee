
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

# main function that gets called from the frontend
root.run = (class_data, print_func, cmdline_args) ->
  console.log cmdline_args
  console.log class_data
  rs = new runtime.RuntimeState(class_data, print_func, [cmdline_args])
  print_func "State initialized.\n"
  rs.method_by_name('main').run(rs)
  print_func "JVM run finished.\n"
