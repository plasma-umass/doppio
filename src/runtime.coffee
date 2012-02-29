
ClassFile ?= require './class_file'

# things assigned to root will be available outside this module
root = exports ? this.runtime = {}

load_external = (cls) ->
  #python -m SimpleHTTPServer 8000
  cf_url = "http://localhost:8000/third_party/#{cls}.class"
  bytecode_string = ''
  $.ajax cf_url, {
    type: 'GET'
    dataType: 'text'
    async: false
    beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
    success: (data) -> bytecode_string = data
    error: (jqXHR, textStatus, errorThrown) -> 
      $('#output').text("AJAX error: #{errorThrown}")
      $('#go_button').text('Compile')
  }

  bytes_array = (bytecode_string.charCodeAt(i) & 0xff for i in [0...bytecode_string.length])
  new ClassFile bytes_array

class root.StackFrame
  constructor: (@locals,@stack) ->
    @pc = 0

class root.RuntimeState
  constructor: (class_data, @print, initial_args) ->
    @classes = {}
    @classes[class_data.this_class] = class_data
    @meta_stack = [new root.StackFrame(['fake','frame'],initial_args)]
    @heap = []

  curr_frame: () -> _.last(@meta_stack)

  cl: (idx) -> @curr_frame().locals[idx]
  put_cl: (idx,val) -> @curr_frame().locals[idx] = val
  # useful for category 2 values (longs, doubles)
  put_cl2: (idx,val) -> @put_cl(idx,val); @put_cl(idx+1,null)

  push: (args...) ->
    cs = @curr_frame().stack
    for v in args
      cs.push v

  pop: () -> @curr_frame().stack.pop()
  # useful for category 2 values (longs, doubles)
  pop2: () -> @pop(); @pop()

  # program counter manipulation
  curr_pc: ()   -> @curr_frame().pc
  goto_pc: (pc) -> @curr_frame().pc = pc
  inc_pc:  (n)  -> @curr_frame().pc += n

  # heap manipulation
  heap_new: (cls) ->
    obj = new Object
    obj.type = cls
    @heap.push obj
    @push(@heap.length - 1)
  heap_put: (field_spec) ->
    val = if field_spec.sig.type in ['J','D'] then @pop2() else @pop()
    obj = @heap[@pop()]
    obj[field_spec.sig.name] = val
  heap_get: (field_spec, oref) ->
    val = @heap[oref][field_spec.sig.name]
    @push val
    @push null if field_spec.sig.type in ['J','D']

  method_lookup: (cls,name) ->
    unless @classes[cls]
      #TODO: fetch the relevant class file, make a ClassFile, put it in @classes[cls]
      @classes[cls] = load_external cls
    throw "class #{cls} not found!" unless @classes[cls]
    _.find(@classes[cls].methods, (m)-> m.name is name)
