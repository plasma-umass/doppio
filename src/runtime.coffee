# Things assigned to root will be available outside this module.
root = exports ? window.runtime ?= {}

_ = require '../vendor/_.js'
gLong = require '../vendor/gLong.js'
util = require './util'
{ReferenceClassData,PrimitiveClassData,ArrayClassData} = require './ClassData'
{log,vtrace,trace,debug,error} = require './logging'
{java_throw,YieldIOException,ReturnException,JavaException} = require './exceptions'
{JavaObject,JavaArray,thread_name} = require './java_object'

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
    # Fake method in the stack frame.
    sf = new root.StackFrame({full_signature: -> return name}, [], [])
    sf.name = name
    sf.fake = true
    return sf

  # Creates a "native stack frame". Handler is called with no arguments for
  # normal execution, error_handler is called with the uncaught exception.
  # If error_handler is not specified, then the exception will propagate through
  # normally.
  # Used for <clinit> and ClassLoader shenanigans. A native frame handles
  # bridging the gap between those Java methods and the methods that ended up
  # triggering them in the first place.
  @native_frame: (name, handler, error_handler) ->
    # Fake method in the stack frame.
    sf = new root.StackFrame({full_signature: -> return name}, [], [])
    sf.runner = handler
    sf.name = name
    sf.error = error_handler if error_handler?
    sf.native = true
    return sf

# Contains all the mutable state of the Java program.
class root.RuntimeState

  run_count = 0

  constructor: (@print, @async_input, @bcl) ->
    @startup_time = gLong.fromNumber (new Date).getTime()
    @run_stamp = ++run_count
    # dict of ClassDatas that have been loaded. this is two levels deep:
    # the first level is the classloader, the second level is the classes
    # defined by that classloader.
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

  get_bs_cl: -> @bcl

  # Get an *initialized* class from the bootstrap classloader.
  get_bs_class: (type, handle_null=false) -> @bcl.get_initialized_class type, handle_null
  # Get an *initialized* class from the classloader of the current class.
  get_class: (type, handle_null=false) -> @curr_frame().method.cls.loader.get_initialized_class type, handle_null
  get_cl: -> @curr_frame().method.cls.loader

  # XXX: We currently 'preinitialize' all of these to avoid an async call
  # in the middle of JVM execution. We should attempt to prune this down as
  # much as possible.
  preinitialize_core_classes: (resume_cb, except_cb) ->
    core_classes = [
      'Ljava/lang/Class;'
      'Ljava/lang/ClassLoader;'
      'Ljava/lang/String;'
      'Ljava/lang/Error;'
      'Ljava/lang/StackTraceElement;'
      'Ljava/io/ExpiringCache;'
      'Ljava/io/FileDescriptor;'
      'Ljava/io/FileNotFoundException;'
      'Ljava/io/IOException;'
      'Ljava/io/Serializable;'
      'Ljava/io/UnixFileSystem;'
      'Ljava/lang/ArithmeticException;'
      'Ljava/lang/ArrayIndexOutOfBoundsException;'
      'Ljava/lang/ArrayStoreException;'
      'Ljava/lang/ClassCastException;'
      'Ljava/lang/ClassNotFoundException;'
      'Ljava/lang/Cloneable;'
      'Ljava/lang/ExceptionInInitializerError;'
      'Ljava/lang/IllegalMonitorStateException;'
      'Ljava/lang/InterruptedException;'
      'Ljava/lang/NegativeArraySizeException;'
      'Ljava/lang/NoSuchFieldError;'
      'Ljava/lang/NoSuchMethodError;'
      'Ljava/lang/NullPointerException;'
      'Ljava/lang/reflect/Constructor;'
      'Ljava/lang/reflect/Field;'
      'Ljava/lang/reflect/Method;'
      'Ljava/lang/System;'
      'Ljava/lang/Thread;'
      'Ljava/lang/ThreadGroup;'
      'Ljava/lang/Throwable;'
      'Ljava/nio/ByteOrder;'
      'Lsun/misc/VM;'
      'Lsun/reflect/ConstantPool;'
      'Ljava/lang/Byte;'
      'Ljava/lang/Character;'
      'Ljava/lang/Double;'
      'Ljava/lang/Float;'
      'Ljava/lang/Integer;'
      'Ljava/lang/Long;'
      'Ljava/lang/Short;'
      'Ljava/lang/Boolean;'
    ]
    i = -1
    init_next_core_class = =>
      trace "init_next_core_class"
      i++
      if i < core_classes.length
        trace "Initializing #{core_classes[i]}"
        @bcl.initialize_class @, core_classes[i], init_next_core_class, except_cb
      else
        trace "Preinitialization complete."
        resume_cb()

    init_next_core_class()

  init_threads: ->
    # initialize thread objects
    my_sf = @curr_frame()
    @push (group = new JavaObject @, @get_bs_class('Ljava/lang/ThreadGroup;'))
    @method_lookup(@get_bs_class('Ljava/lang/ThreadGroup;'), {class: 'Ljava/lang/ThreadGroup;', sig: '<init>()V'}).setup_stack(this)
    my_sf.runner = =>
      ct = null
      my_sf.runner = =>
        my_sf.runner = null
        ct.$meta_stack = @meta_stack()
        @curr_thread = ct
        @curr_thread.$isAlive = true
        @thread_pool.push @curr_thread
        # hack to make auto-named threads match native Java
        @get_bs_class('Ljava/lang/Thread;').static_fields.threadInitNumber = 1
        debug "### finished thread init ###"
      ct = new JavaObject @, @get_bs_class('Ljava/lang/Thread;'),
        'Ljava/lang/Thread;name': @init_carr 'main'
        'Ljava/lang/Thread;priority': 1
        'Ljava/lang/Thread;group': group
        'Ljava/lang/Thread;threadLocals': null

  meta_stack: -> @curr_thread.$meta_stack

  # Init the first class, and put the command-line args on the stack for use by
  # its main method.

  init_system_class: ->
    # initialize the system class
    my_sf = @curr_frame()
    @get_bs_class('Ljava/lang/System;').methods['initializeSystemClass()V'].setup_stack(this)
    my_sf.runner = ->
      my_sf.runner = null
      @system_initialized = true
      debug "### finished system class initialization ###"

  init_args: (initial_args) ->
    args = new JavaArray @, @get_bs_class('[Ljava/lang/String;'), (@init_string(a) for a in initial_args)
    @curr_thread.$meta_stack = new root.CallStack [args]
    debug "### finished runtime state initialization ###"

  show_state: () ->
    cf = @curr_frame()
    if cf?
      s = ((x?.ref? or x) for x in cf.stack)
      l = ((x?.ref? or x) for x in cf.locals)
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
  put_cl2: (idx,val) ->
    @put_cl(idx,val)
    UNSAFE? || @put_cl(idx+1,null)

  push: (arg) -> @curr_frame().stack.push(arg)
  push2: (arg1, arg2) -> @curr_frame().stack.push(arg1, arg2)
  push_array: (args) ->
    cs = @curr_frame().stack
    Array::push.apply(cs, args)
  pop: () -> @curr_frame().stack.pop()
  # For category 2 values.
  pop2: () ->
    @pop()
    @pop()

  # Program counter manipulation.
  curr_pc: ()   -> @curr_frame().pc
  goto_pc: (pc) -> @curr_frame().pc = pc
  inc_pc:  (n)  -> @curr_frame().pc += n

  # Heap manipulation.
  check_null: (obj) ->
    java_throw @, @get_bs_class('Ljava/lang/NullPointerException;'), '' unless obj?
    obj

  heap_newarray: (type,len) ->
    if len < 0
      java_throw @, @get_bs_class('Ljava/lang/NegativeArraySizeException;'), "Tried to init [#{type} array with length #{len}"
    if type == 'J'
      new JavaArray @, @get_bs_class('[J'), (gLong.ZERO for i in [0...len] by 1)
    else if type[0] == 'L'  # array of object
      new JavaArray @, @get_class("[#{type}"), (null for i in [0...len] by 1)
    else  # numeric array
      new JavaArray @, @get_class("[#{type}"), (0 for i in [0...len] by 1)

  # heap object initialization
  init_string: (str,intern=false) ->
    return s if intern and (s = @string_pool.get str)?
    carr = @init_carr str
    jvm_str = new JavaObject @, @get_bs_class('Ljava/lang/String;'), {'Ljava/lang/String;value':carr, 'Ljava/lang/String;count':str.length}
    @string_pool.set(str, jvm_str) if intern
    return jvm_str
  init_carr: (str) ->
    new JavaArray @, @get_bs_class('[C'), (str.charCodeAt(i) for i in [0...str.length] by 1)

  method_lookup: (cls, method_spec) ->
    method = cls.method_lookup(this, method_spec)
    return method if method?
    java_throw @, @get_bs_class('Ljava/lang/NoSuchMethodError;'),
      "No such method found in #{util.ext_classname(method_spec.class)}::#{method_spec.sig}"

  field_lookup: (cls, field_spec) ->
    field = cls.field_lookup this, field_spec
    return field if field?
    java_throw @, @get_bs_class('Ljava/lang/NoSuchFieldError;'),
      "No such field found in #{util.ext_classname(field_spec.class)}::#{field_spec.name}"

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
    @stashed_done_cb = done_cb  # hack for the case where we error out of <clinit>
    @_in_main_loop = true
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
      @_in_main_loop = false
      if e == 'Error in class initialization'
        done_cb false
      else if e is ReturnException
        # XXX: technically we shouldn't get here. Right now we get here
        # when java_throw is called from the main method lookup.
        @run_until_finished (->), no_threads, done_cb
      else if e instanceof YieldIOException
        # Set "bytecode" if this was triggered by a bytecode instruction (e.g.
        # class initialization). This causes the method to resume on the next
        # opcode once success_fn is called.
        success_fn = (ret1, ret2, bytecode, advance_pc=true) =>
          if bytecode
            @meta_stack().push root.StackFrame.fake_frame("async_op")
          @curr_frame().runner = =>
              @meta_stack().pop()
              if bytecode and advance_pc
                @curr_frame().pc += 1 + @curr_frame().method.code.opcodes[@curr_frame().pc].byte_count
              unless ret1 is undefined
                trace "Success_fn pushin' some stuff onto stack"
                ret1 += 0 if typeof ret1 == 'boolean'
                @push ret1
              @push ret2 unless ret2 is undefined
          @run_until_finished (->), no_threads, done_cb
        failure_fn = (e_cb, bytecode) =>
          if bytecode
            @meta_stack().push root.StackFrame.fake_frame("async_op")
          @curr_frame().runner = =>
            @meta_stack().pop()
            e_cb()
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
