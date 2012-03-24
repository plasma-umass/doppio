
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
runtime ?= require './runtime'
util ?= require './util'
{log,debug,error} = util

# things assigned to root will be available outside this module
root = exports ? this.jvm = {}

show_state = (rs) ->
  cf = rs.curr_frame()
  debug "stack: [#{cf.stack}], local: [#{cf.locals}], heap:"
  i = Math.max(1,rs.heap.length-30)  # because the heap can get huge
  debug " ...omitted heap entries..." if i > 1
  while i < rs.heap.length
    obj = rs.heap[i]
    typestr = obj.type.toString()
    if typestr is '[C' and rs.heap[i+1] and rs.heap[i+1].type.toClassString() is 'java/lang/String'
      debug " #{i},#{i+1}: String \"#{rs.jvm2js_str(rs.heap[i+1])}\""
      ++i
    else if typestr is 'Ljava/lang/String;'
      try
        debug " #{i}: String \"#{rs.jvm2js_str(obj)}\""
      catch err
        debug " #{i}: String (null value)"
    else if typestr[0] is '['
      debug " #{i}: #{obj.type.component_type}[#{obj.array.length}]"
    else
      debug " #{i}: #{typestr}"
    ++i

show_stacktrace = (rs,e) ->
  e_type = rs.get_obj(e.exception.fields.cause).type
  detail_ref = e.exception.fields.detailMessage
  detail = if detail_ref then rs.jvm2js_str rs.get_obj detail_ref else ''
  rs.print "Exception in thread \"main\" #{e_type.toExternalString()}: #{detail}\n"
  stack = e.exception.fields.$stack
  for i in [stack.length-1..0] by -1
    entry = stack[i]
    rs.print "\tat #{entry.cls}.#{entry.method}(#{entry.file}:#{entry.line}, code #{entry.op})\n"

# main function that gets called from the frontend
root.run_class = (rs, class_data, cmdline_args, cb) ->
  main_spec = {'class': class_data.this_class.toClassString(), 'sig': {'name': 'main'}}
  rs.initialize(class_data,cmdline_args)
  run = ->
    try
      rs.method_lookup(main_spec).run(rs)
      cb?()
    catch e
      if e instanceof util.JavaException
        console.error "\nUncaught Java Exception"
        show_state(rs)
        show_stacktrace(rs,e)
        cb?()
      else if e instanceof util.HaltException
        console.error "\nExited with code #{e.exit_code}" unless e.exit_code is 0
        cb?()
      else if e instanceof util.YieldException
        e.condition ->
          rs.resuming_stack = 0  # <-- index into the meta_stack of the frame we're resuming
          run()
      else
        console.error "\nInternal JVM Error!"
        show_state(rs)
        console.error e.stack or e
        cb?()
        throw e  # so we get the JS traceback
  run()
