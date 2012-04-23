# Things assigned to root will be available outside this module.
root = exports ? this.runtime = {}
util ?= require './util'
types ?= require './types'
ClassFile ?= require './class_file'
{log,debug,error,java_throw} = util
{c2t} = types

trace = (msg) -> log 9, msg

initial_value = (type_str) ->
  if type_str is 'J' then gLong.ZERO
  else if type_str[0] in ['[','L'] then null
  else 0 

class root.StackFrame
  constructor: (@method,@locals,@stack) ->
    @pc = 0

# Contains all the mutable state of the Java program.
class root.RuntimeState
  constructor: (@print, @async_input, @read_classfile) ->
    @classes = {}
    @high_oref = 1
    @string_pool = {}
    @string_redirector = {}
    @zip_descriptors = [null]

  # Init the first class, and put the command-line args on the stack for use by
  # its main method.
  initialize: (class_name, initial_args) ->
    # initialize thread objects
    @meta_stack = [new root.StackFrame null,[],[]]
    @push (group = @init_object 'java/lang/ThreadGroup')
    @method_lookup({class: 'java/lang/ThreadGroup', sig: '<init>()V'}).run(this)
    @main_thread = @init_object 'java/lang/Thread',
      name: @init_carr 'main'
      priority: 1
      group: group
      threadLocals: null
    @push gLong.ZERO, null  # set up for static_put
    @static_put {class:'java/lang/Thread', name:'threadSeqNumber'}
    args = @set_obj(c2t('[Ljava/lang/String;'),(@init_string(a) for a in initial_args))
    # prepare meta_stack for main(String[] args)
    @meta_stack = [new root.StackFrame(null,[],[args])]
    @class_lookup c2t class_name

  # Convert a Java String object into an equivalent JS one.
  jvm2js_str: (jvm_str) ->
    @jvm_carr2js_str(jvm_str.fields.value, jvm_str.fields.offset, jvm_str.fields.count)
  # Convert :count chars starting from :offset in a Java character array into a
  # JS string
  jvm_carr2js_str: (jvm_arr, offset, count) ->
    carr = jvm_arr.array
    (util.bytes2str carr).substr(offset ? 0, count)
  # Convert references to strings in the constant pool to an interned String
  string_redirect: (oref,cls) ->
    key = "#{cls}::#{oref}"
    cdata = @class_lookup(c2t(cls))
    unless @string_redirector[key]
      cstr = cdata.constant_pool.get(oref)
      throw new Error "can't redirect const string at #{oref}" unless cstr and cstr.type is 'Asciz'
      @string_redirector[key] = @init_string(cstr.value,true)
      trace "heapifying #{oref} -> #{@string_redirector[key].ref} : '#{cstr.value}'"
    trace "redirecting #{oref} -> #{@string_redirector[key].ref}"
    return @string_redirector[key]

  # Used by ZipFile to return unique zip file descriptor IDs.
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
  # Category 2 values (longs, doubles) take two slots in Java. Since we only
  # need one slot to represent a double in JS, we pad it with a null.
  put_cl2: (idx,val) -> @put_cl(idx,val); @put_cl(idx+1,null)

  push: (args...) ->
    cs = @curr_frame().stack
    Array::push.apply cs, args
  pop: () -> @curr_frame().stack.pop()
  pop2: () -> @pop(); @pop() # For category 2 values.

  # Program counter manipulation.
  curr_pc: ()   -> @curr_frame().pc
  goto_pc: (pc) -> @curr_frame().pc = pc
  inc_pc:  (n)  -> @curr_frame().pc += n

  # Heap manipulation.
  set_obj: (type, obj={}) ->
    if type instanceof types.ArrayType
      {type: type, array: obj, ref: @high_oref++}
    else
      {type: type, fields: obj, ref: @high_oref++}

  heap_newarray: (type,len) ->
    if type == 'J'
      @set_obj(c2t("[J"),(gLong.ZERO for i in [0...len] by 1))
    else if type[0] == 'L'  # array of object
      @set_obj(c2t("[#{type}"),(null for i in [0...len] by 1))
    else  # numeric array
      @set_obj(c2t("[#{type}"),(0 for i in [0...len] by 1))
  heap_put: (field_spec) ->
    val = if field_spec.type in ['J','D'] then @pop2() else @pop()
    obj = @pop()
    trace "setting #{field_spec.name} = #{val} on obj of type #{obj.type.toClassString()}"
    obj.fields[field_spec.name] = val
  heap_get: (field_spec, obj) ->
    name = field_spec.name
    obj.fields[name] ?= initial_value field_spec.type
    trace "getting #{name} from obj of type #{obj.type.toClassString()}: #{obj.fields[name]}"
    @push obj.fields[name]
    @push null if field_spec.type in ['J','D']

  # static stuff
  static_get: (field_spec) ->
    f = @field_lookup(field_spec)
    obj = @class_lookup(f.class_type, true)
    val = obj.fields[f.name]
    val ?= initial_value f.type.toString()
    trace "getting #{field_spec.name} from class #{field_spec.class}: #{val}"
    val
  static_put: (field_spec) ->
    val = if field_spec.type in ['J','D'] then @pop2() else @pop()
    f = @field_lookup(field_spec)
    obj = @class_lookup(f.class_type, true)
    obj.fields[f.name] = val
    trace "setting #{field_spec.name} = #{val} on class #{field_spec.class}"

  # heap object initialization
  init_object: (cls, obj) ->
    type = c2t(cls)
    @class_lookup type
    @set_obj type, obj
  init_string: (str,intern=false) ->
    return @string_pool[str] if intern and @string_pool[str]? and typeof @string_pool[str] isnt 'function'
    carr = @init_carr str
    jvm_str = @set_obj c2t('java/lang/String'), {'value':carr, 'count':str.length}
    @string_pool[str] = jvm_str if intern
    return jvm_str
  init_carr: (str) -> @set_obj c2t('[C'), (str.charCodeAt(i) for i in [0...str.length])

  # Tries to obtain the class of type :type. Called by the bootstrap class loader.
  # Throws a NoClassDefFoundError on failure.
  class_lookup: (type,get_obj=false) ->
    c = @_class_lookup type
    unless c
      cls = (type.toClassString?() ? type.toString())
      java_throw @, 'java/lang/NoClassDefFoundError', cls
    if get_obj then c.obj else c.file
  # Tries to obtain the class of type :type. Called by reflective methods, e.g.
  # `Class.forName`, `ClassLoader.findSystemClass`, and `ClassLoader.loadClass`.
  # Throws a ClassNotFoundException on failure.
  dyn_class_lookup: (type, get_obj=false) ->
    c = @_class_lookup type
    unless c
      cls = (type.toClassString?() ? type.toString())
      java_throw @, 'java/lang/ClassNotFoundException', cls
    if get_obj then c.obj else c.file
  # Fetch the relevant class file. Returns `undefined` if it cannot be found.
  # Results are cached in `@classes`.
  _class_lookup: (type) ->
    throw new Error "class_lookup needs a type object, got #{typeof type}: #{type}" unless type instanceof types.Type
    cls = type.toClassString?() ? type.toString()
    unless @classes[cls]?
      trace "loading new class: #{cls}"
      if type instanceof types.ArrayType
        class_file = ClassFile.for_array_type type
        @classes[cls] =
          file: class_file
          obj:  @set_obj(c2t('java/lang/Class'), { $type: type })
        component = type.component_type
        if component instanceof types.ArrayType or component instanceof types.ClassType
          @_class_lookup component
      else if type instanceof types.PrimitiveType
        @classes[type] = {file: '<primitive>', obj: @set_obj(c2t('java/lang/Class'), { $type: type })}
      else
        class_file = @read_classfile cls
        return unless class_file?
        @classes[cls] =
          file: class_file
          obj:  @set_obj(c2t('java/lang/Class'), { $type: type })
        # Run class initialization code. Superclasses get init'ed first.  We
        # don't want to call this more than once per class, so don't do dynamic
        # lookup. See spec [2.17.4][1].
        # [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/Concepts.doc.html#19075
        if class_file.super_class
          @_class_lookup class_file.super_class
        class_file.methods['<clinit>()V']?.run(this)
        if cls is 'java/lang/System'  # zomg hardcode
          class_file.methods['initializeSystemClass()V'].run(this)
    @classes[cls]
  # Spec [5.4.3.3][1], [5.4.3.4][2].
  # [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#79473
  # [2]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#78621
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
  # Spec [5.4.3.2][1].
  # [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#77678
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
