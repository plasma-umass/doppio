# Things assigned to root will be available outside this module.
root = exports ? window.runtime ?= {}

_ = require '../vendor/_.js'
gLong = require '../vendor/gLong.js'
util = require './util'
types = require './types'
ClassFile = require './ClassFile'
{log,vtrace,trace,debug,error} = require './logging'
{java_throw,YieldIOException,ReturnException} = require './exceptions'
{JavaObject,JavaClassObject,JavaArray,thread_name} = require './java_object'
{c2t} = types
{Method} = require './methods'

"use strict"

class root.CallStack
  constructor: (initial_stack) ->
    @_cs = [root.StackFrame.fake_frame('$bootstrap')]
    if initial_stack?
      @_cs[0].stack = initial_stack

  length: -> @_cs.length
  push: (sf) -> @_cs.push sf
  pop: -> @_cs.pop()

  curr_frame: -> util.last(@_cs)

  get_caller: (frames_to_skip) -> @_cs[@_cs.length-1-frames_to_skip]

class root.StackFrame
  constructor: (@method,@locals,@stack) ->
    @pc = 0
    @runner = null
    @name = @method.full_signature()

  @fake_frame: (name) ->
    sf = new root.StackFrame(new Method(c2t(name)), [], [])
    sf.fake = true
    return sf

class ClassState
  constructor: (@loader) ->
    @fields = null

# Contains all the mutable state of the Java program.
class root.RuntimeState

  run_count = 0

  constructor: (@print, @async_input, @read_classfile) ->
    @startup_time = gLong.fromNumber (new Date).getTime()
    @run_stamp = ++run_count
    # dict of mutable states of loaded classes
    @class_states = Object.create null
    @class_states['$bootstrap'] = new ClassState null
    # dict of java.lang.Class objects (which are interned)
    @jclass_obj_pool = Object.create null
    # dict of ClassFiles that have been loaded
    @loaded_classes = Object.create null

    @mem_start_addrs = [1]
    @mem_blocks = {}

    @high_oref = 1
    @string_pool = new util.SafeMap
    @lock_refs = {}  # map from monitor -> thread object
    @lock_counts = {}  # map from monitor -> count
    @waiting_threads = {}  # map from monitor -> list of waiting thread objects
    @thread_pool = []
    @curr_thread = {$meta_stack: new root.CallStack()}

  init_threads: ->
    # initialize thread objects
    my_sf = @curr_frame()
    @push (group = @init_object 'java/lang/ThreadGroup')
    @method_lookup({class: 'java/lang/ThreadGroup', sig: '<init>()V'}).setup_stack(this)
    my_sf.runner = =>
      ct = null
      my_sf.runner = =>
        my_sf.runner = null
        ct.$meta_stack = @meta_stack()
        @curr_thread = ct
        @curr_thread.$isAlive = true
        @thread_pool.push @curr_thread
        # hack to make auto-named threads match native Java
        @class_states['java/lang/Thread'].fields.threadInitNumber = 1
        debug "### finished thread init ###"
      ct = @init_object 'java/lang/Thread',
        'java/lang/Thread/name': @init_carr 'main'
        'java/lang/Thread/priority': 1
        'java/lang/Thread/group': group
        'java/lang/Thread/threadLocals': null

  meta_stack: -> @curr_thread.$meta_stack

  # Init the first class, and put the command-line args on the stack for use by
  # its main method.

  init_system_class: ->
    # initialize the system class
    my_sf = @curr_frame()
    @class_lookup(c2t 'java/lang/System').methods['initializeSystemClass()V'].setup_stack(this)
    my_sf.runner = ->
      my_sf.runner = null
      @system_initialized = true
      debug "### finished system class initialization ###"

  init_args: (initial_args) ->
    # prepare the call stack for main(String[] args)
    args = new JavaArray @, c2t('[Ljava/lang/String;'), (@init_string(a) for a in initial_args)
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

  choose_next_thread: (blacklist) ->
    unless blacklist?
      blacklist = []
      for key,bl of @waiting_threads
        for b in bl
          blacklist.push b
    for t in @thread_pool when t isnt @curr_thread and t.$isAlive
      continue if t in blacklist
      debug "TE(choose_next_thread): choosing thread #{thread_name(@, t)}"
      return t
    # we couldn't find a thread! We can't error out, so keep trying
    debug "TE(choose_next_thread): no thread found, sticking with curr_thread"
    return @curr_thread

  wait: (monitor, yieldee) ->
    # add current thread to wait queue
    debug "TE(wait): waiting #{thread_name @, @curr_thread} on lock #{monitor.ref}"
    if @waiting_threads[monitor]?
      @waiting_threads[monitor].push @curr_thread
    else
      @waiting_threads[monitor] = [@curr_thread]
    # yield execution to a non-waiting thread
    yieldee ?= @choose_next_thread @waiting_threads[monitor]
    @yield yieldee

  yield: (yieldee=@choose_next_thread()) ->
    debug "TE(yield): yielding #{thread_name @, @curr_thread} to #{thread_name @, yieldee}"
    old_thread_sf = @curr_frame()
    @curr_thread = yieldee
    new_thread_sf = @curr_frame()
    new_thread_sf.runner = => @meta_stack().pop()
    old_thread_sf.runner = => @meta_stack().pop()
    throw ReturnException

  curr_frame: -> @meta_stack().curr_frame()

  cl: (idx) -> @curr_frame().locals[idx]
  put_cl: (idx,val) -> @curr_frame().locals[idx] = val
  # Category 2 values (longs, doubles) take two slots in Java. Since we only
  # need one slot to represent a double in JS, we pad it with a null.
  put_cl2: (idx,val) -> @put_cl(idx,val); UNSAFE? || @put_cl(idx+1,null)

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

  heap_newarray: (type,len) ->
    if len < 0
      java_throw @, 'java/lang/NegativeArraySizeException', "Tried to init [#{type} array with length #{len}"
    if type == 'J'
      new JavaArray @, c2t("[J"), (gLong.ZERO for i in [0...len] by 1)
    else if type[0] == 'L'  # array of object
      new JavaArray @, c2t("[#{type}"), (null for i in [0...len] by 1)
    else  # numeric array
      new JavaArray @, c2t("[#{type}"), (0 for i in [0...len] by 1)

  # static stuff
  static_get: (field_spec) ->
    f = @field_lookup(field_spec)
    @class_states[f.class_type.toClassString()].fields[f.name] ?= util.initial_value f.raw_descriptor

  static_put: (field_spec) ->
    val = if field_spec.type in ['J','D'] then @pop2() else @pop()
    f = @field_lookup(field_spec)
    @class_states[f.class_type.toClassString()].fields[f.name] = val

  # heap object initialization
  init_object: (cls, obj) ->
    type = c2t(cls)
    new JavaObject @, type, @class_lookup(type), obj
  init_array: (cls, obj) ->
    type = c2t(cls)
    new JavaArray @, type, obj
  init_string: (str,intern=false) ->
    return s if intern and (s = @string_pool.get str)?
    carr = @init_carr str
    type = c2t('java/lang/String')
    jvm_str = new JavaObject @, type, @class_lookup(type), {'java/lang/String/value':carr, 'java/lang/String/count':str.length}
    @string_pool.set(str, jvm_str) if intern
    return jvm_str
  init_carr: (str) ->
    new JavaArray @, c2t('[C'), (str.charCodeAt(i) for i in [0...str.length] by 1)

  # Returns a java.lang.Class object for JVM bytecode to do reflective stuff.
  # Loads the underlying class, but does not initialize it (and therefore does
  # not ensure that its ancestors and interfaces are present.)
  jclass_obj: (type, dyn=false) ->
    jco = @jclass_obj_pool[type]
    if jco is 'not found'
      etype = if dyn then 'ClassNotFoundException' else 'NoClassDefFoundError'
      java_throw @, "java/lang/#{etype}", type.toClassString()
    else if jco is undefined
      @jclass_obj_pool[type] = 'not found'
      file = if type instanceof types.PrimitiveType then null else @load_class type, dyn
      @jclass_obj_pool[type] = jco = new JavaClassObject @, type, file
    jco

  # Returns a ClassFile object. Loads the underlying class, but does not
  # initialize it. :dyn should be set if the class may not have been present at
  # compile time, e.g. if we are loading a class as a result of a
  # Class.forName() call.
  load_class: (type, dyn) ->
    cls = type.toClassString()
    unless @loaded_classes[cls]?
      if type instanceof types.ArrayType
        @loaded_classes[cls] = ClassFile.for_array_type type
        # defining class loader of an array type is that of its component type
        if type.component_type instanceof types.PrimitiveType
          @class_states[cls] = new ClassState null
        else
          @load_class type.component_type, dyn
          @class_states[cls] = new ClassState @class_states[type.component_type.toClassString()].loader
      else
        # a class gets loaded with the loader of the class that is triggering    
        # this class resolution
        defining_class = @curr_frame().method.class_type.toClassString()
        defining_class_loader = @class_states[defining_class]?.loader
        if defining_class_loader?
          @meta_stack().push root.StackFrame.fake_frame('custom_class_loader')
          @push2 defining_class_loader, @init_string util.ext_classname cls
          @method_lookup(
            class: defining_class_loader.type.toClassString()
            sig: 'loadClass(Ljava/lang/String;)Ljava/lang/Class;').setup_stack @
          unless @run_until_finished (->), true, (->)
            throw 'Error in class initialization'
          # discard return value. @define_class will have registered the new
          # file in loaded_classes for us.
          @meta_stack().pop()
        else
          # bootstrap class loader
          @class_states[cls] = new ClassState null
          class_file = @read_classfile cls
          if not class_file? or wrong_name = (class_file.this_class.toClassString() != cls)
            msg = cls
            if wrong_name
              msg += " (wrong name: #{class_file.this_class.toClassString()})"
            if dyn
              java_throw @, 'java/lang/ClassNotFoundException', msg
            else
              java_throw @, 'java/lang/NoClassDefFoundError', msg
          @loaded_classes[cls] = class_file
    @loaded_classes[cls]

  # Loads and initializes :type, and returns a ClassFile object. Should only be
  # called _immediately_ before a method invocation or field access. See section
  # 5.5 of the SE7 spec.
  class_lookup: (type, dyn) ->
    UNSAFE? || throw new Error "class_lookup needs a type object, got #{typeof type}: #{type}" unless type instanceof types.Type
    UNSAFE? || throw new Error "class_lookup was passed a PrimitiveType" if type instanceof types.PrimitiveType
    class_file = @load_class type, dyn
    cls = type.toClassString()
    unless @class_states[cls].fields?
      trace "looking up class: #{cls}"
      @class_states[cls].inited = false
      @class_states[cls].fields = Object.create null
      if type instanceof types.ArrayType
        component = type.component_type
        if component instanceof types.ArrayType or component instanceof types.ClassType
          @class_lookup component, dyn
      else if class_file.super_class?
        @class_lookup class_file.super_class, dyn
    #TODO: finish the decoupling by removing the following line
    @initialize_class class_file, (->)
    return class_file

  initialize_class: (class_file, cb) ->
    cls = class_file.this_class.toClassString()
    return cb() if @class_states[cls].inited
    @class_states[cls].inited = true
    trace "initializing class: #{cls}"
    # Run class initialization code. Superclasses get init'ed first.  We
    # don't want to call this more than once per class, so don't do dynamic
    # lookup. See spec [2.17.4][1].
    # [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/Concepts.doc.html#19075
    _fn = =>
      @meta_stack().push root.StackFrame.fake_frame('class_lookup')
      class_file.initialize(this) # Resets any cached state.
      class_file.methods['<clinit>()V']?.setup_stack(@)
      @run_until_finished (->), true, (success) =>
        if success
          @meta_stack().pop()
          cb()
        else
          throw 'Error in class initialization'
    # This pattern comes up in jvm.run_class as well. Is there a better way?
    if class_file.super_class?
      @initialize_class @class_lookup(class_file.super_class), _fn
    else
      _fn()

  # called by user-defined classloaders
  define_class: (cls, data, loader) ->
    # replicates some logic from class_lookup
    class_file = new ClassFile(data)
    @class_states[cls] = new ClassState loader
    if class_file.super_class
      @class_lookup class_file.super_class
    @loaded_classes[cls] = class_file
    type = c2t(cls)
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

  # address of the block that this address is contained in
  block_addr: (address) ->
    address = address.toNumber() # address is a Long
    if DataView?
      block_addr = @mem_start_addrs[0]
      for addr in @mem_start_addrs[1..]
        if address < addr
          return block_addr
        block_addr = addr
    else
      # w/o typed arrays, we just address by 32bits.
      # We initialize memory to 0, so it should not be 0 or undefined.
      if @mem_blocks[address]?
        return address
    UNSAFE? || throw new Error "Invalid memory access at #{address}"

  handle_toplevel_exception: (e, no_threads, done_cb) ->
    if e.toplevel_catch_handler?
      @run_until_finished (=> e.toplevel_catch_handler(@)), no_threads, done_cb
    else
      error "\nInternal JVM Error:", e
      error e.stack if e?.stack?
      @show_state()
      done_cb false
    return

  # Pauses the JVM for an asynchronous operation. The callback, cb, will be
  # called with another callback that it is responsible for calling with any
  # return values when it is time to resume the JVM.
  async_op: (cb) -> throw new YieldIOException cb

  run_until_finished: (setup_fn, no_threads, done_cb) ->
    try
      setup_fn()
      while true
        sf = @curr_frame()
        while sf.runner?
          sf.runner()
          sf = @curr_frame()
        # we've finished this thread, no more runners
        # we're done if the only thread is "main"
        break if no_threads or @thread_pool.length <= 1
        # remove the current (finished) thread
        debug "TE(toplevel): finished thread #{thread_name @, @curr_thread}"
        @curr_thread.$isAlive = false
        @thread_pool.splice @thread_pool.indexOf(@curr_thread), 1
        @curr_thread = @choose_next_thread()
      done_cb true
    catch e
      if e == 'Error in class initialization'
        done_cb false
      else if e is ReturnException
        # XXX: technically we shouldn't get here. Right now we get here
        # when java_throw is called from the main method lookup.
        @run_until_finished (->), no_threads, done_cb
      else if e instanceof YieldIOException
        success_fn = (ret1, ret2) =>
          @curr_frame().runner = =>
              @meta_stack().pop()
              unless ret1 is undefined
                ret += 0 if typeof ret1 == 'boolean'
                @push ret1
              @push ret2 unless ret2 is undefined
          @run_until_finished (->), no_threads, done_cb
        failure_fn = (e_cb) =>
          @curr_frame().runner = e_cb
          @run_until_finished (->), no_threads, done_cb
        e.condition success_fn, failure_fn
      else
        if e.method_catch_handler? and @meta_stack().length() > 1
          tos = true
          until e.method_catch_handler(@, @curr_frame().method, tos)
            tos = false
            if @meta_stack().length() == 1
              @handle_toplevel_exception e, no_threads, done_cb
              return
            else
              @meta_stack().pop()
          @run_until_finished (->), no_threads, done_cb
        else
          @meta_stack().pop() while @meta_stack().length() > 1
          @handle_toplevel_exception e, no_threads, done_cb
    return  # this is an async method, no return value
