
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util.js'

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

# main function that gets called from the frontend
root.run = (class_data, print_func) ->
  print_func "Running the bytecode now...\n"
  console.log class_data
  # try to look at the opcodes
  #for m in class_data.methods
    #m.run()
  print_func "JVM run finished.\n"
