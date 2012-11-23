# Things assigned to root will be available outside this module.
root = exports ? window.runtime ?= {}

_ = require '../vendor/_.js'
gLong = require '../vendor/gLong.js'
util = require './util'
types = require './types'
ClassFile = require './ClassFile'
{log,vtrace,trace,debug,error} = require './logging'
{java_throw,YieldException} = require './exceptions'
{JavaObject,JavaClassObject,JavaArray,thread_name} = require './java_object'
{c2t} = types
{Method} = require './methods'

"use strict"

class root.CallStack
  constructor: (initial_stack) ->
    @_cs = [new root.StackFrame(new Method(c2t '$bootstrap'),[],[])]
    if initial_stack?
      @_cs[0].stack = initial_stack
    @resuming_stack = null

  length: -> @_cs.length
  push: (sf) -> @_cs.push sf
  pop: -> @_cs.pop()

  curr_frame: ->
    if @resuming_stack? then @_cs[@resuming_stack]
    else _.last(@_cs)

  get_caller: (frames_to_skip) -> @_cs[@_cs.length-1-frames_to_skip]

class root.StackFrame
  constructor: (@method,@locals,@stack) ->
    @pc = 0

class ClassState
  constructor: (@loader) ->
    @fields = null

# Contains all the mutable state of the Java program.
class root.RuntimeState
  constructor: (@print, @async_input, @read_classfile) ->
    @startup_time = gLong.fromNumber (new Date).getTime()
    # dict of mutable states of loaded classes
    @class_states = Object.create null
    @class_states['L$bootstrap;'] = new ClassState null
    # dict of java.lang.Class objects (which are interned)
    @jclass_obj_pool = Object.create null
    # dict of ClassFiles that have been loaded
    @loaded_classes = Object.create null

    @high_oref = 1
    @string_pool = new util.SafeMap
    @lock_refs = {}  # map from monitor -> thread object
    @lock_counts = {}  # map from monitor -> count
    @waiting_threads = {}  # map from monitor -> list of waiting thread objects
    @thread_pool = []
    # initialize thread objects
    @curr_thread = {$meta_stack: new root.CallStack()}
    @push (group = @init_object 'java/lang/ThreadGroup')
    @method_lookup({class: 'java/lang/ThreadGroup', sig: '<init>()V'}).run(this)

    ct = @init_object 'java/lang/Thread',
      name: @init_carr 'main'
      priority: 1
      group: group
      threadLocals: null
    ct.$meta_stack = @meta_stack()
    @curr_thread = ct
    @curr_thread.$isAlive = true
    @thread_pool.push @curr_thread

  meta_stack: -> @curr_thread.$meta_stack

  # Init the first class, and put the command-line args on the stack for use by
  # its main method.
  initialize: (class_name, initial_args) ->
    unless @system_initialized?
      # initialize the system class
      @class_lookup(c2t 'java/lang/System').methods['initializeSystemClass()V'].run(this)
      @system_initialized = true
      debug "### finished system class initialization ###"

    # load the main class (which calls <clinit>, if needed)
    @class_lookup c2t class_name

    # prepare the call stack for main(String[] args)
    args = new JavaArray c2t('[Ljava/lang/String;'), @, (@init_string(a) for a in initial_args)
    @curr_thread.$meta_stack = new root.CallStack [args]
    debug "### finished runtime state initialization ###"

  show_state: () ->
    cf = @curr_frame()
    if cf?
      s = ((if x?.ref? then x.ref else x) for x in cf.stack)
      l = ((if x?.ref? then x.ref else x) for x in cf.locals)
      debug "showing current state: method '#{cf.method?.name}', stack: [#{s}], locals: [#{l}]"
    else
      debug "current frame is undefined. meta_stack: #{@meta_stack()}"

  wait: (monitor, yieldee) ->
    # add current thread to wait queue
    if @waiting_threads[monitor]?
      @waiting_threads[monitor].push @curr_thread
    else
      @waiting_threads[monitor] = [@curr_thread]
    # yield execution, to the locking thread if possible
    unless yieldee?
      yieldee = @lock_refs[monitor]
    @yield yieldee

  yield: (yieldee) ->
    unless yieldee?
      yieldee = (y for y in @thread_pool when y isnt @curr_thread).pop()
      unless yieldee?
        java_throw @, 'java/lang/Error', "tried to yield when no other thread was available"
    debug "TE: yielding #{thread_name @, @curr_thread} to #{thread_name @, yieldee}"
    my_thread = @curr_thread
    @curr_frame().resume = -> @curr_thread = my_thread
    rs = this
    throw new YieldException (cb) ->
      my_thread.$resume = cb
      rs.curr_thread = yieldee
      debug "TE: about to resume #{thread_name @, yieldee}"
      yieldee.$resume()

  curr_frame: -> @meta_stack().curr_frame()

  cl: (idx) -> @curr_frame().locals[idx]
  put_cl: (idx,val) -> @curr_frame().locals[idx] = val
  # Category 2 values (longs, doubles) take two slots in Java. Since we only
  # need one slot to represent a double in JS, we pad it with a null.
  put_cl2: (idx,val) -> @put_cl(idx,val); @put_cl(idx+1,null)

  push: (arg) -> @curr_frame().stack.push(arg)
  push2: (arg1, arg2) -> @curr_frame().stack.push(arg1, arg2)
  push_array: (args) ->
    cs = @curr_frame().stack
    Array::push.apply(cs, args)
  pop: () -> @curr_frame().stack.pop()
  pop2: () -> @pop(); @pop() # For category 2 values.

  # Program counter manipulation.
  curr_pc: ()   -> @curr_frame().pc
  goto_pc: (pc) -> @curr_frame().pc = pc
  inc_pc:  (n)  -> @curr_frame().pc += n

  # Heap manipulation.
  check_null: (obj) ->
    java_throw @, 'java/lang/NullPointerException', '' unless obj?
    obj
  set_obj: (type, obj={}) ->
    if type instanceof types.ArrayType
      new JavaArray type, @, obj
    else
      new JavaObject type, @, obj

  heap_newarray: (type,len) ->
    if len < 0
      java_throw @, 'java/lang/NegativeArraySizeException', "Tried to init [#{type} array with length #{len}"
    if type == 'J'
      new JavaArray c2t("[J"), @, (gLong.ZERO for i in [0...len] by 1)
    else if type[0] == 'L'  # array of object
      new JavaArray c2t("[#{type}"), @, (null for i in [0...len] by 1)
    else  # numeric array
      new JavaArray c2t("[#{type}"), @, (0 for i in [0...len] by 1)

  heap_put: (field_spec) ->
    val = if field_spec.type in ['J','D'] then @pop2() else @pop()
    obj = @pop()
    field = @field_lookup(field_spec)
    obj.set_field @, field_spec.name, val, field.class_type.toClassString()

  heap_get: (field_spec, obj) ->
    field = @field_lookup(field_spec)
    val = obj.get_field @, field_spec.name, field.class_type.toClassString()
    @push val
    @push null if field_spec.type in ['J','D']

  # static stuff
  static_get: (field_spec) ->
    f = @field_lookup(field_spec)
    @class_states[f.class_type].fields[f.name] ?= util.initial_value f.raw_descriptor

  static_put: (field_spec) ->
    val = if field_spec.type in ['J','D'] then @pop2() else @pop()
    f = @field_lookup(field_spec)
    @class_states[f.class_type].fields[f.name] = val

  # heap object initialization
  init_object: (cls, obj) ->
    type = c2t(cls)
    @class_lookup type
    @set_obj type, obj
  init_string: (str,intern=false) ->
    return s if intern and (s = @string_pool.get str)?
    carr = @init_carr str
    jvm_str = new JavaObject c2t('java/lang/String'), @, {'value':carr, 'count':str.length}
    @string_pool.set(str, jvm_str) if intern
    return jvm_str
  init_carr: (str) ->
    new JavaArray c2t('[C'), @, (str.charCodeAt(i) for i in [0...str.length] by 1)

  # Returns a java.lang.Class object for JVM bytecode to do reflective stuff.
  # Loads the underlying class, but does not initialize it (and therefore does
  # not ensure that its ancestors and interfaces are present.)
  jclass_obj: (type, dyn=false) ->
    if @jclass_obj_pool[type] is undefined
      file = @load_class type, dyn
      @jclass_obj_pool[type] = new JavaClassObject @, type, file
    @jclass_obj_pool[type]

  # Returns a ClassFile object. Loads the underlying class, but does not
  # initialize it. :dyn should be set if the class may not have been present at
  # compile time, e.g. if we are loading a class as a result of a
  # Class.forName() call.
  load_class: (type, dyn) ->
    unless @loaded_classes[type]?
      if type instanceof types.ArrayType
        @loaded_classes[type] = ClassFile.for_array_type type
        @load_class type.component_type, dyn
        # defining class loader of an array type is that of its component type
        @class_states[type] = new ClassState @class_states[type.component_type]?.loader ? null
      else if type instanceof types.PrimitiveType
        @loaded_classes[type] = '<primitive>'
      else
        # a class gets loaded with the loader of the class that is triggering
        # this class resolution
        defining_class_state = @class_states[@curr_frame().method.class_type]
        if loader = defining_class_state.loader?
          rs.push2 loader, rs.init_string util.ext_classname type.toClassString()
          rs.method_lookup(
            class: loader.type.toClassString()
            sig: 'loadClass(Ljava/lang/String;)Ljava/lang/Class;').run @
        else
          # bootstrap class loader
          @class_states[type] = new ClassState null
          cls = type.toClassString()
          class_file = @read_classfile cls
          unless class_file?
            if dyn
              java_throw @, 'java/lang/ClassNotFoundException', cls
            else
              java_throw @, 'java/lang/NoClassDefFoundError', cls
          @loaded_classes[type] = class_file
    @loaded_classes[type]

  # Loads and initializes :type, and returns a ClassFile object. Should only be
  # called _immediately_ before a method invocation or field access. See section
  # 5.5 of the SE7 spec.
  class_lookup: (type, dyn) ->
    UNSAFE? || throw new Error "class_lookup needs a type object, got #{typeof type}: #{type}" unless type instanceof types.Type
    UNSAFE? || throw new Error "class_lookup was passed a PrimitiveType" if type instanceof types.PrimitiveType
    class_file = @load_class type, dyn
    unless @class_states[type].fields?
      trace "initializing class: #{type.toClassString()}"
      @class_states[type].fields = Object.create null
      if type instanceof types.ArrayType
        component = type.component_type
        if component instanceof types.ArrayType or component instanceof types.ClassType
          @class_lookup component, dyn
      else if type instanceof types.ClassType
        c = @class_states[type]
        # Run class initialization code. Superclasses get init'ed first.  We
        # don't want to call this more than once per class, so don't do dynamic
        # lookup. See spec [2.17.4][1].
        # [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/Concepts.doc.html#19075
        if class_file.super_class
          @class_lookup class_file.super_class, dyn

        # flag to let us know if we need to resume into <clinit> after a yield
        @class_states[type].$in_progress = true
        class_file.methods['<clinit>()V']?.run(this)
        delete c.$in_progress  # no need to keep this around
    else if @meta_stack().resuming_stack?
      c = @class_states[type]
      if class_file.super_class
        @class_lookup class_file.super_class, dyn
      if c.$in_progress?  # need to resume <clinit>
        trace "resuming an $in_progress class initialization"
        delete c.$in_progress
        class_file.methods['<clinit>()V']?.run(this)
    class_file

  # called by user-defined classloaders
  define_class: (cls, data, loader) ->
    # replicates some logic from class_lookup
    class_file = new ClassFile(data)
    type = c2t cls
    @class_states[type] = new ClassState loader
    if class_file.super_class
      @class_lookup class_file.super_class
    type = c2t(util.int_classname cls)
    @loaded_classes[type] = class_file
    @jclass_obj_pool[type] = new JavaClassObject @, type, class_file

  method_lookup: (method_spec) ->
    type = c2t method_spec.class
    cls = @class_lookup(type)
    method = cls.method_lookup(this, method_spec)
    return method if method?
    java_throw @, 'java/lang/NoSuchMethodError',
      "No such method found in #{method_spec.class}: #{method_spec.sig}"

  field_lookup: (field_spec) ->
    cls = @class_lookup c2t field_spec.class
    field = cls.field_lookup this, field_spec
    return field if field?
    java_throw @, 'java/lang/NoSuchFieldError',
      "No such field found in #{field_spec.class}: #{field_spec.name}"

  get_field_from_offset: (cls, offset) ->
    classname = cls.this_class.toClassString()
    until cls.fields[offset]?
      unless cls.super_class?
        java_throw @, 'java/lang/NullPointerException', "field #{offset} doesn't exist in class #{classname}"
      cls = @class_lookup(cls.super_class)
    cls.fields[offset]
