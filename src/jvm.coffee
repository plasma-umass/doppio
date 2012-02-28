
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

# main function that gets called from the frontend
root.run = (class_data, print_func, cmdline_args) ->
  rs = new runtime.RuntimeState(class_data, print_func, [cmdline_args])
  rs.method_lookup(class_data.this_class,'main').run(rs)
