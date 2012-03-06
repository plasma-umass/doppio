
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

# main function that gets called from the frontend
root.run = (class_data, print_func, load_func, cmdline_args) ->
  rs = new runtime.RuntimeState(class_data, print_func, load_func, cmdline_args)
  main_spec = {'class': class_data.this_class, 'sig': {'name': 'main'}}
  try
    rs.method_lookup(main_spec).run(rs)
  catch e
    cf = rs.curr_frame()
    console.error "Runtime Exception!\n" +
      "stack: [#{cf.stack}], local: [#{cf.locals}], " +
      "heap: {" + ("#{k}: #{v.type}" for k, v of rs.heap).join(', ') + "}\n"
    throw e
