
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
    # we have a dud object because pointers should never be zero
    @heap = [null]
    # for interned strings and string literals
    @string_pool = {}
    @string_redirector = {}
    # map zip descriptor ints to descriptor objects.
    @zip_descriptors = [null]

  initialize: (class_name, initial_args) ->
    args = @set_obj(c2t('[Ljava/lang/String;'),(@init_string(a) for a in initial_args))
    @meta_stack = [new root.StackFrame(null,[],[args])]  # start with a bogus ground state
    @class_lookup c2t class_name

  # string stuff
  jvm2js_str: (jvm_str) ->
    @jvm_carr2js_str(jvm_str.fields.value, jvm_str.fields.offset, jvm_str.fields.count)
  jvm_carr2js_str: (arr_ref, offset, count) ->
    carr = @get_obj(arr_ref).array
    (util.bytes2str carr).substr(offset ? 0, count)
  string_redirect: (oref,cls) ->
    key = "#{cls}::#{oref}"
    cdata = @class_lookup(c2t(cls))
    unless @string_redirector[key]
      cstr = cdata.constant_pool.get(oref)
      throw new Error "can't redirect const string at #{oref}" unless cstr and cstr.type is 'Asciz'
      @string_redirector[key] = @init_string(cstr.value,true)
      trace "heapifying #{oref} -> #{@string_redirector[key]} : '#{cstr.value}'"
    trace "redirecting #{oref} -> #{@string_redirector[key]}"
    return @string_redirector[key]

  set_zip_descriptor: (zd_obj) ->
    @zip_descriptors.push zd_obj
    gLong.fromInt(@zip_descriptors.length - 1)
  get_zip_descriptor: (zd_long) ->
    @zip_descriptors[zd_long.toInt()]
  free_zip_descriptor: (zd_long) ->
    delete @zip_descriptors[zd_long.toInt()]

  curr_frame: () ->
    if @resuming_stack? then @meta_stack[@resuming_stack]
    else _.last(@meta_stack)

  cl: (idx) -> @curr_frame().locals[idx]
  put_cl: (idx,val) -> @curr_frame().locals[idx] = val
  # useful for category 2 values (longs, doubles)
  put_cl2: (idx,val) -> @put_cl(idx,val); @put_cl(idx+1,null)

  push: (args...) ->
    cs = @curr_frame().stack
    Array::push.apply cs, args

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
    if type instanceof types.ArrayType
      @heap.push type: type, array: obj, ref: @heap.length
    else
      @heap.push type: type, fields: obj, ref: @heap.length
    @heap.length - 1

  heap_newarray: (type,len) -> @set_obj(c2t("[#{type}"),(0 for [0...len]))
  heap_put: (field_spec) ->
    val = if field_spec.type in ['J','D'] then @pop2() else @pop()
    obj = @get_obj @pop()
    trace "setting #{field_spec.name} = #{val} on obj of type #{obj.type.toClassString()}"
    obj.fields[field_spec.name] = val
  heap_get: (field_spec, oref) ->
    obj = @get_obj(oref)
    name = field_spec.name
    obj.fields[name] ?= if field_spec.type is 'J' then gLong.fromInt(0) else 0
    trace "getting #{name} from obj of type #{obj.type.toClassString()}: #{obj.fields[name]}"
    @push obj.fields[name]
    @push null if field_spec.type in ['J','D']

  # static stuff
  static_get:(field_spec) ->
    f = @field_lookup(field_spec)
    obj = @get_obj @class_lookup(f.class_type, true)
    val = obj.fields[f.name]
    val ?= if field_spec.type is 'J' then gLong.fromInt(0) else 0
    trace "getting #{field_spec.name} from class #{field_spec.class}: #{val}"
    val
  static_put: (field_spec) ->
    val = if field_spec.type in ['J','D'] then @pop2() else @pop()
    f = @field_lookup(field_spec)
    obj = @get_obj @class_lookup(f.class_type, true)
    obj.fields[f.name] = val
    trace "setting #{field_spec.name} = #{val} on class #{field_spec.class}"

  # heap object initialization
  init_object: (cls, obj) ->
    type = c2t(cls)
    @class_lookup type
    @set_obj type, obj
  init_string: (str,intern=false) ->
    return @string_pool[str] if intern and @string_pool[str]? and typeof @string_pool[str] isnt 'function'
    c_ref = @set_obj c2t('[C'), (str.charCodeAt(i) for i in [0...str.length])
    s_ref = @set_obj c2t('java/lang/String'), {'value':c_ref, 'count':str.length}
    @string_pool[str] = s_ref if intern
    return s_ref

  # lookup methods
  class_lookup: (type,get_obj=false) ->
    c = @_class_lookup type
    unless c
      cls = (type.toClassString?() ? type.toString())
      java_throw @, 'java/lang/NoClassDefFoundError', cls
    if get_obj then c.obj else c.file
  dyn_class_lookup: (type, get_obj=false) ->
    c = @_class_lookup type
    unless c
      cls = (type.toClassString?() ? type.toString())
      java_throw @, 'java/lang/ClassNotFoundException', cls
    if get_obj then c.obj else c.file
  _class_lookup: (type) ->
    throw new Error "class_lookup needs a type object, got #{typeof type}: #{type}" unless type instanceof types.Type
    cls = type.toClassString?() ? type.toString()
    unless @classes[cls]?
      # fetch the relevant class file, put it in @classes[cls]
      trace "loading new class: #{cls}"
      if type instanceof types.ArrayType
        class_file =
          constant_pool: new ConstantPool
          access_flags: {}
          this_class: type
          super_class: c2t('java/lang/Object')
          interfaces: []
          fields: []
          methods: []
          attrs: []
        @classes[cls] = 
          file: class_file, 
          obj: @set_obj(c2t('java/lang/Class'), { $type: type, name: 0 })
        component = type.component_type
        if component instanceof types.ArrayType or component instanceof types.ClassType
          @_class_lookup component
      else if type instanceof types.PrimitiveType
        @classes[type] = {file: '<primitive>', obj: @set_obj(c2t('java/lang/Class'), { $type: type, name: 0 })}
      else
        class_file = @read_classfile cls
        return unless class_file?
        @classes[cls] =
          file: class_file
          obj:  @set_obj(c2t('java/lang/Class'), { $type: type, name: 0 })
        # Run class initialization code. We don't want to call this more than
        # once per class, so don't do dynamic lookup. See spec 5.5.
        if class_file.super_class
          @_class_lookup class_file.super_class
        class_file.methods['<clinit>()V']?.run(this)
        if cls is 'java/lang/System'  # zomg hardcode
          @method_lookup(class: cls, sig: 'initializeSystemClass()V').run(this)
    c = @classes[cls]
  # spec 5.4.3.3, 5.4.3.4
  method_lookup: (method_spec) ->
    type = c2t method_spec.class
    t = type
    while t
      cls = @class_lookup(t)
      method = cls.methods[method_spec.sig]
      return method if method?
      t = cls.super_class
    cls = @class_lookup(type)
    ifaces = (c2t(cls.constant_pool.get(i).deref()) for i in cls.interfaces)
    while ifaces.length > 0
      iface_name = ifaces.shift()
      ifc = @class_lookup iface_name
      method = ifc.methods[method_spec.sig]
      return method if method?
      Array::push.apply ifaces,
        (c2t(ifc.constant_pool.get(i).deref()) for i in ifc.interfaces)
    java_throw @, 'java/lang/NoSuchMethodError',
      "No such method found in #{method_spec.class}: #{method_spec.sig}"
  # spec 5.4.3.2
  field_lookup: (field_spec) ->
    filter_field = (c) -> _.find(c.fields, (f)-> f.name is field_spec.name)
    field = @_field_lookup field_spec.class, filter_field
    return field if field?
    java_throw @, 'java/lang/NoSuchFieldError',
      "No such field found in #{field_spec.class}: #{field_spec.name}"
  _field_lookup: (class_name, filter_fn) ->
    t = c2t class_name
    while t
      cls = @class_lookup(t)
      field = filter_fn cls
      return field if field?
      ifaces = (cls.constant_pool.get(i).deref() for i in cls.interfaces)
      for ifc in ifaces
        field = @_field_lookup ifc, filter_fn
        return field if field?
      t = cls.super_class
    null

  # casting and such
  is_subclass: (class1, class2) ->
    return true if class1['this_class'] is class2['this_class']
    return false unless class1['super_class']  # it's java/lang/Object, can't go further
    return @is_subclass(@class_lookup(class1.super_class),class2)
  is_subinterface: (iface1, iface2) ->
    return true if iface1['this_class'] is iface2['this_class']
    for i in iface1.interfaces
      super_iface =  @class_lookup c2t(iface1.constant_pool.get(i).deref())
      return true if @is_subinterface super_iface, iface2
    return false unless iface1['super_class']  # it's java/lang/Object, can't go further
    return @is_subinterface @class_lookup(iface1.super_class), iface2

  # Retrieves the heap object referenced by :oref, and returns a boolean
  # indicating if it can be casted to (i.e. is an instance of) :classname.
  check_cast: (oref, classname) ->
    @is_castable(@get_obj(oref).type,c2t(classname))

  # Returns a boolean indicating if :type1 is an instance of :type2.
  # :type1 and :type2 should both be instances of types.Type.
  is_castable: (type1, type2) ->
    if (type1 instanceof types.PrimitiveType) or (type2 instanceof types.PrimitiveType)
      return type1.name == type2.name  # since types are created on the fly, we can have different Type objects for the same type
    if type1 instanceof types.ArrayType
      if type2 instanceof types.ArrayType
        return @is_castable(type1.component_type, type2.component_type)
      c2 = @class_lookup(type2)
      return type2.class_name is 'java/lang/Object' unless c2.access_flags.interface
      return type2.class_name in ['java/lang/Cloneable','java/io/Serializable']
    # not an array
    return false if type2 instanceof types.ArrayType
    c1 = @class_lookup(type1)
    c2 = @class_lookup(type2)
    unless c1.access_flags.interface
      return @is_subclass(c1,c2) unless c2.access_flags.interface
      return @is_subinterface(c1,c2)  # does class c1 support interface c2?
    # c1 is an interface
    return type2.class_name is 'java/lang/Object' unless c2.access_flags.interface
    return @is_subinterface(c1,c2)
