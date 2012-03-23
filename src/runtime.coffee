
ClassFile ?= require './class_file'

# things assigned to root will be available outside this module
root = exports ? this.runtime = {}
util ?= require './util'
types ?= require './types'
{log,debug,error,java_throw} = util
{c2t} = types

trace = (msg) -> log 9, msg

class root.StackFrame
  constructor: (@method,@locals,@stack) ->
    @pc = 0

class root.RuntimeState
  constructor: (@print, @async_input, @read_classfile) ->
    @classes = {}
    @heap = [null]
    # for interned strings and string literals
    @string_pool = {}
    @string_redirector = {}
    @class_objects = {}  # each java/lang/Class is like an interned string, only stored once

  initialize: (class_data, initial_args) ->
    @classes[class_data.this_class] = class_data
    args = @set_obj('[Ljava/lang/String;',(@init_string(a) for a in initial_args))
    @meta_stack = [new root.StackFrame(null,[],[args])]  # start with a bogus ground state
    @method_lookup({'class': class_data.this_class, 'sig': {'name': '<clinit>'}}).run(this)

  # string stuff
  jvm2js_str: (jvm_str) ->
    @jvm_carr2js_str(jvm_str.fields.value, jvm_str.fields.offset, jvm_str.fields.count)
  jvm_carr2js_str: (arr_ref, offset, count) ->
    carr = @get_obj(arr_ref).array
    (util.bytes2str carr).substr(offset ? 0, count)
  string_redirect: (oref,cls) ->
    key = "#{cls}::#{oref}"
    cdata = @class_lookup(cls)
    unless @string_redirector[key]
      cstr = cdata.constant_pool.get(oref)
      throw new Error "can't redirect const string at #{oref}" unless cstr and cstr.type is 'Asciz'
      @string_redirector[key] = @init_string(cstr.value,true)
      trace "heapifying #{oref} -> #{@string_redirector[key]} : '#{cstr.value}'"
    trace "redirecting #{oref} -> #{@string_redirector[key]}"
    return @string_redirector[key]

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
    java_throw @, 'java/lang/NullPointerException', '' unless @heap[oref]?
    @heap[oref]
  set_obj: (type, obj={}) ->
    if util.is_array type
      @heap.push type: type, array: obj, ref: @heap.length
    else
      @heap.push type: type, fields: obj, ref: @heap.length
    @heap.length - 1

  heap_newarray: (type,len) -> @set_obj("[#{type}",(0 for [0...len]))
  heap_put: (field_spec) ->
    val = if field_spec.sig.type in ['J','D'] then @pop2() else @pop()
    obj = @get_obj @pop()
    trace "setting #{field_spec.sig.name} = #{val} on obj of type #{obj.type}"
    obj.fields[field_spec.sig.name] = val
  heap_get: (field_spec, oref) ->
    obj = @get_obj(oref)
    name = field_spec.sig.name
    obj.fields[name] = 0 if obj.fields[name] is undefined
    trace "getting #{name} from obj of type #{obj.type}: #{obj.fields[name]}"
    @push obj.fields[name]
    @push null if field_spec.sig.type in ['J','D']

  # static stuff
  static_get: (field_spec) ->
    val = @field_lookup(field_spec).static_value ? 0
    trace "getting #{field_spec.sig.name} from class #{field_spec.class}: #{val}"
    val
  static_put: (field_spec) ->
    val = if field_spec.sig.type in ['J','D'] then @pop2() else @pop()
    field = @field_lookup field_spec
    field.static_value = val
    trace "setting #{field_spec.sig.name} = #{val} on class #{field_spec.class}"

  # heap object initialization
  init_object: (cls) ->
    @class_lookup cls
    @set_obj cls
  init_string: (str,intern=false) ->
    return @string_pool[str] if intern and @string_pool[str]? and typeof @string_pool[str] isnt 'function'
    c_ref = @set_obj('[C',(str.charCodeAt(i) for i in [0...str.length]))
    s_ref = @set_obj 'java/lang/String', {'value':c_ref, 'count':str.length}
    @string_pool[str] = s_ref if intern
    return s_ref
  init_class_object: (type) ->
    unless @class_objects[type]?
      @class_objects[type] = @set_obj 'java/lang/Class', { $type: type, name: 0 }
    return @class_objects[type]

  # lookup methods
  class_lookup: (cls) ->
    unless @classes[cls]
      # fetch the relevant class file, make a ClassFile, put it in @classes[cls]
      trace "loading new class: #{cls}"
      if util.is_array cls
        @classes[cls] =
          constant_pool: new ConstantPool
          access_flags: {}
          this_class: cls
          super_class: 'java/lang/Object'
          interfaces: []
          fields: []
          methods: []
          attrs: []
        component = util.unarray cls
        if util.is_array component or util.is_class component
          @class_lookup component
      else
        data = @read_classfile cls
        java_throw @, 'java/lang/NoClassDefFoundError', cls unless data?
        @classes[cls] = new ClassFile data
        #old_loglevel = util.log_level  # suppress logging for init stuff
        #util.log_level = util.ERROR
        # run class initialization code
        @method_lookup({class: cls, sig: {name: '<clinit>', type: '()V'}}).run(this)
        if cls is 'java/lang/System'  # zomg hardcode
          @method_lookup({'class': cls, 'sig': {'name': 'initializeSystemClass'}}).run(this)
        #util.log_level = old_loglevel  # resume logging
    throw "class #{cls} not found!" unless @classes[cls]
    @classes[cls]
  method_lookup: (method_spec) ->
    cls = @class_lookup(method_spec.class)
    filter_methods = (methods) ->
      ms = (m for m in methods when m.name is method_spec.sig.name)
      ms = (m for m in ms when m.raw_descriptor is method_spec.sig.type) unless ms.length == 1
      throw "too many method choices" if ms.length > 1
      ms[0]
    c = cls
    while true
      method = filter_methods c.methods
      break if method or not c['super_class']
      c = @class_lookup(c.super_class)
    return method if method?
    ifaces = cls.interfaces[0..] # make a copy
    while ifaces.length > 0
      iface = ifaces.shift()
      iface_name = cls.constant_pool.get(iface).deref()
      ifc = @class_lookup iface_name
      method = filter_methods ifc.methods
      break if method?
      ifaces.push.apply ifc.interfaces
    throw "no such method found in #{method_spec.class}: #{method_spec.sig.name}" unless method
    method
  field_lookup: (field_spec) ->
    c = @class_lookup(field_spec.class)
    while true
      field = _.find(c.fields, (f)-> f.name is field_spec.sig.name)
      break if field or not c['super_class']
      c = @class_lookup(c.super_class)
    throw "no such field found: #{field_spec.sig.name}" unless field
    field

  # casting and such
  is_subclass: (class1, class2) ->
    return true if class1['this_class'] is class2['this_class']
    return false unless class1['super_class']  # it's java/lang/Object, can't go further
    return @is_subclass(@class_lookup(class1.super_class),class2)
  has_interface: (cls, iface) ->
    for i in cls.interfaces
      iface_name = cls.constant_pool.get(i).deref()
      return true if iface_name is iface['this_class']
    return false

  # Retrieves the heap object referenced by :oref, and returns a boolean
  # indicating if it can be casted to (i.e. is an instance of) :classname.
  check_cast: (oref, classname) ->
    return @is_castable(c2t(@get_obj(oref).type),c2t(classname))

  # Returns a boolean indicating if :type1 is an instance of :type2.
  # :type1 and :type2 should both be instances of types.Type.
  is_castable: (type1, type2) ->
    if (type1 instanceof types.PrimitiveType) or (type2 instanceof types.PrimitiveType)
      return type1.name == type2.name  # since types are created on the fly, we can have different Type objects for the same type
    if type1 instanceof types.ArrayType
      if type2 instanceof types.ArrayType
        return @is_castable(type1.component_type, type2.component_type)
      c2 = @class_lookup(type2.class_name)
      return type2.class_name is 'java/lang/Object' unless c2.access_flags.interface
      return type2.class_name in ['java/lang/Cloneable','java/io/Serializable']
    # not an array
    return false if type2 instanceof types.ArrayType
    c1 = @class_lookup(type1.class_name)
    c2 = @class_lookup(type2.class_name)
    unless c1.access_flags.interface
      return @is_subclass(c1,c2) unless c2.access_flags.interface
      return @has_interface(c1,c2)
    # c1 is an interface
    return type2.class_name is 'java/lang/Object' unless c2.access_flags.interface
    return @is_subclass(c1,c2)  # technically they're interfaces, but we don't care
