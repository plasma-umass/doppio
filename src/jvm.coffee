
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'
util ?= require './util'

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

# main function that gets called from the frontend
root.run = (class_data, print_func, load_func, cmdline_args) ->
  rs = new runtime.RuntimeState(class_data, print_func, load_func, cmdline_args)
  main_spec = {'class': class_data.this_class, 'sig': {'name': 'main'}}
  try
    rs.method_lookup(main_spec).run(rs)
  catch e
    if e instanceof util.JavaException
      console.error "\nUncaught Java Exception"
    else
      console.error "\nInternal JVM Error!"

    cf = rs.curr_frame()
    heap_str = ("#{i}: #{rs.heap[i].type}" for i in [1...rs.heap.length]).join(', ')
    console.error "stack: [#{cf.stack}], local: [#{cf.locals}], " +
      "heap: {#{heap_str}}"
    if e instanceof util.JavaException
      e_type = rs.get_obj(e.exception.cause).type
      detail = rs.jvm2js_str(rs.get_obj(e.exception.detailMessage))
      console.error "Exception in thread \"main\" #{e_type}: #{detail}"
      for entry in e.stack
        console.error "\tat #{entry.cls}.#{entry.method}(#{entry.file}:#{entry.line}, code #{entry.op})"
    else
      console.error e
