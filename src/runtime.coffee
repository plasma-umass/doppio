
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
    @string_pool = {}
    class_data.constant_pool.each (i,c) =>
      if c.type is 'String'
        str = class_data.constant_pool.constant_pool[c.value].value
        cls = @class_lookup 'java/lang/String'
        #TODO: actually make a real string object here (as in `new String(str);`)
        str_obj = {'type':'java/lang/String', 'value':@init_array('char'), 'count':str.length}
        str_obj.value.array = str
        @string_pool[c.value] = str_obj


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
  get_obj: (oref) ->
    obj = @heap[oref]
    obj = @string_pool[oref] unless obj #megahack
    throw "undefined heap/string reference: #{oref}" unless obj
    obj
  heap_new: (cls) -> @push @init_object(cls)
  heap_put: (field_spec) ->
    val = if field_spec.sig.type in ['J','D'] then @pop2() else @pop()
    obj = @heap[@pop()]
    console.log "setting #{field_spec.sig.name} = #{val} on obj of type #{obj.type}"
    obj[field_spec.sig.name] = val
  heap_get: (field_spec, oref) ->
    obj = @get_obj(oref)
    name = field_spec.sig.name
    obj[name] = @init_field(@field_lookup(field_spec)) if obj[name] is undefined
    console.log "getting #{name} from obj of type #{obj.type}: #{obj[name]}"
    @push obj[name]
    @push null if field_spec.sig.type in ['J','D']

  # static stuff
  static_get: (field_spec) ->
    field = @field_lookup field_spec
    field.static_value = @init_field(field) unless field.static_value
    console.log field.static_value
    @push field.static_value

  init_object: (cls) ->
    @class_lookup cls
    @heap.push {'type':cls}
    @heap.length - 1

  init_array: (type) ->
    @heap.push {'type':"[#{type}]", 'array':[]}
    @heap.length - 1

  init_field: (field) ->
    if field.type.type is 'reference' and field.type.ref_type is 'class'
      @init_object field.type.referent.class_name
    else if field.type.type in ['int','float','double','long','boolean','char','short']
      0  # numbers default to zero/false
    else if field.type.type is 'reference' and field.type.ref_type is 'array'
      @init_array field.type.referent.type
    else
      throw "I don't know what to do with non-class static fields"

  class_lookup: (cls) ->
    unless @classes[cls]
      #TODO: fetch the relevant class file, make a ClassFile, put it in @classes[cls]
      @classes[cls] = load_external cls
    throw "class #{cls} not found!" unless @classes[cls]
    @classes[cls]

  method_lookup: (method_spec) ->
    c = @class_lookup(method_spec.class)
    while true
      ms = (m for m in c.methods when m.name is method_spec.sig.name)
      ms = (m for m in ms when m.raw_descriptor is method_spec.sig.type) unless ms.length == 1
      throw "too many method choices" if ms.length > 1
      break if ms[0] or not c['super_class']
      c = @class_lookup(c.super_class)
    throw "no such method found: #{method_spec.sig.name}" unless ms[0]
    console.log c['this_class']
    ms[0]

  field_lookup: (field_spec) ->
    c = @class_lookup(field_spec.class)
    while true
      field = _.find(c.fields, (f)-> f.name is field_spec.sig.name)
      break if field or not c['super_class']
      c = @class_lookup(c.super_class)
    throw "no such field found: #{field_spec.sig.name}" unless field
    field
