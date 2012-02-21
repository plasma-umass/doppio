
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

# main function that gets called from the frontend
root.run = (class_data, print_func) ->
  print_func "Running the bytecode now...\n"
  console.log class_data
  main = _.find(class_data.methods, (m) -> m.name == "main")
  rs = new runtime.RuntimeState(class_data.constant_pool, [9])
  main.run(rs) #maybe add some UI for args to main
  print_func "JVM run finished.\n"
