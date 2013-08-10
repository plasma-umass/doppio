"use strict"

# Things assigned to root will be available outside this module.
root = exports ? window.runtime ?= {}

_ = require '../vendor/underscore/underscore.js'
gLong = require '../vendor/gLong.js'
util = require './util'
{log,vtrace,trace,debug,error} = require './logging'
{YieldIOException,ReturnException,JavaException} = require './exceptions'
{JavaObject,JavaArray,thread_name} = require './java_object'
jvm = null
process = node?.process ? global.process

class root.CallStack
  constructor: (initial_stack) ->
    @_cs = [root.StackFrame.native_frame('$bootstrap')]
    if initial_stack?
      @_cs[0].stack = initial_stack

  snap: ->
    visited = {}
    snapshots = (frame.snap(visited) for frame in @_cs)
    serialize: -> ss.serialize() for ss in snapshots

  length: -> @_cs.length
  push: (sf) -> @_cs.push sf
  pop: -> @_cs.pop()
  pop_n: (n) -> @_cs.length -= n

  curr_frame: -> util.last(@_cs)

  get_caller: (frames_to_skip) -> @_cs[@_cs.length-1-frames_to_skip]

class root.StackFrame
  constructor: (@method,@locals,@stack) ->
    @pc = 0
    @runner = null
    @native = false
    @name = @method.full_signature()

  snap: (visited) ->
    rv =
      name: @name
      pc: @pc
      native: @native

    serialize: =>
      rv.loader = @method.cls?.loader.serialize(visited)
      rv.stack = (obj?.serialize?(visited) ? obj for obj in @stack)
      rv.locals = (obj?.serialize?(visited) ? obj for obj in @locals)
      rv

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

  constructor: (@print, @_async_input, @bcl) ->
    # XXX: Because we do manual dependency resolution in the browser, and this
    #      is only needed for dump_state.
    jvm = require './jvm'
    @input_buffer = []
    @bcl.reset()
    @startup_time = gLong.fromNumber (new Date).getTime()
    @run_stamp = ++run_count

    @mem_start_addrs = [1]
    @mem_blocks = {}

    @high_oref = 1
    @string_pool = new util.SafeMap
    @lock_refs = {}  # map from monitor -> thread object
    @lock_counts = {}  # map from monitor -> count
    @waiting_threads = {}  # map from monitor -> list of waiting thread objects
    @thread_pool = []
    @curr_thread = {$meta_stack: new root.CallStack()}
    @max_m_count = 100000

  get_bs_cl: -> @bcl

  # Get an *initialized* class from the bootstrap classloader.
  get_bs_class: (type, handle_null=false) -> @bcl.get_initialized_class type, handle_null
  # Get an *initialized* class from the classloader of the current class.
  get_class: (type, handle_null=false) ->
    @curr_frame().method.cls.loader.get_initialized_class type, handle_null
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
      'Ljava/lang/NoClassDefFoundError;'
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
      'Ljava/lang/UnsatisfiedLinkError;'
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
      '[Lsun/management/MemoryManagerImpl;'
      '[Lsun/management/MemoryPoolImpl;'
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
    @get_bs_class('Ljava/lang/ThreadGroup;').method_lookup(@, '<init>()V').setup_stack(this)
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

  # Simulate the throwing of a Java exception with message :msg. Not very DRY --
  # code here is essentially copied from the opcodes themselves -- but
  # constructing the opcodes manually is inelegant too.
  java_throw: (cls, msg) ->
    v = new JavaObject @, cls  # new
    @push_array([v,v,@init_string msg]) # dup, ldc
    my_sf = @curr_frame()
    cls.method_lookup(@, '<init>(Ljava/lang/String;)V').setup_stack(@) # invokespecial
    my_sf.runner = =>
      if my_sf.method.has_bytecode
        my_sf.runner = (=> my_sf.method.run_bytecode(@))  # don't re-throw the exception
      else
        my_sf.runner = null
      throw (new JavaException(@pop())) # athrow
    throw ReturnException

  # Init the first class, and put the command-line args on the stack for use by
  # its main method.

  init_system_class: ->
    # initialize the system class
    my_sf = @curr_frame()
    @get_bs_class('Ljava/lang/System;').get_method('initializeSystemClass()V').setup_stack(this)
    my_sf.runner = =>
      my_sf.runner = null
      @system_initialized = true
      debug "### finished system class initialization ###"

  init_args: (initial_args) ->
    args = new JavaArray @, @get_bs_class('[Ljava/lang/String;'), (@init_string(a) for a in initial_args)
    @curr_thread.$meta_stack = new root.CallStack [args]
    debug "### finished runtime state initialization ###"

  dump_state: (snapshot=@meta_stack().snap(), suffix) ->
    suffix = if suffix? then "-#{suffix}" else ''
    fs = node?.fs ? require 'fs'

    serialized = snapshot.serialize()

    if node?
      window.core_dump = serialized
    else
      # 4th parameter to writeFileSync ensures this is not stored in localStorage in the browser
      fs.writeFileSync "./core-#{thread_name @, @curr_thread}#{suffix}.json",
        (JSON.stringify serialized), 'utf8', true

  choose_next_thread: (blacklist, cb) ->
    unless blacklist?
      blacklist = []
      for key,bl of @waiting_threads
        for b in bl
          blacklist.push b
    wakeup_time = @curr_thread.wakeup_time ? Infinity
    current_time = (new Date).getTime()
    for t in @thread_pool when t isnt @curr_thread and t.$isAlive
      if @parked t
        continue if t.$park_timeout > current_time
        @unpark t
      continue if t in blacklist
      if t.wakeup_time > current_time
        wakeup_time = t.wakeup_time if t.wakeup_time < wakeup_time
        continue
      debug "TE(choose_next_thread): choosing thread #{thread_name(@, t)}"
      return cb(t)
    if Infinity > wakeup_time > current_time
      debug "TE(choose_next_thread): waiting until #{wakeup_time} and trying again"
      setTimeout((=> @choose_next_thread(null, cb)), wakeup_time - current_time)
    else
      debug "TE(choose_next_thread): no thread found, sticking with curr_thread"
      return cb(@curr_thread)

  wait: (monitor, yieldee) ->
    debug "TE(wait): waiting #{thread_name @, @curr_thread} on lock #{monitor.ref}"
    # add current thread to wait queue
    if @waiting_threads[monitor]?
      @waiting_threads[monitor].push @curr_thread
    else
      @waiting_threads[monitor] = [@curr_thread]
    # yield execution to a non-waiting thread
    return @yield yieldee if yieldee?
    @choose_next_thread @waiting_threads[monitor], ((nt)=>@yield(nt))

  yield: (yieldee) ->
    debug "TE(yield): yielding #{thread_name @, @curr_thread} to #{thread_name @, yieldee}"
    old_thread_sf = @curr_frame()
    @curr_thread = yieldee
    new_thread_sf = @curr_frame()
    new_thread_sf.runner = => @meta_stack().pop()
    old_thread_sf.runner = => @meta_stack().pop()
    # Note that we don't throw a ReturnException here, so callers need to
    # yield the JVM execution themselves.
    return

  init_park_state: (thread) ->
    thread.$park_count ?= 0
    thread.$park_timeout ?= Infinity

  park: (thread, timeout) ->
    @init_park_state thread
    thread.$park_count++
    thread.$park_timeout = timeout
    debug "TE(park): parking #{thread_name @, thread} (count: #{thread.$park_count}, timeout: #{thread.$park_timeout})"
    # Only choose a new thread if this one will become blocked
    @choose_next_thread null, ((nt) => @yield(nt)) if @parked thread

  unpark: (thread) ->
    @init_park_state thread
    debug "TE(unpark): unparking #{thread_name @, thread}"
    thread.$park_count--
    thread.$park_timeout = Infinity

    # Yield to the unparked thread if it should be unblocked
    @yield(thread) unless @parked thread

  parked: (thread) -> thread.$park_count > 0

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
  # for those cases where we want to avoid the pop/repush combo
  peek: (depth=0) ->
    s = @curr_frame().stack
    s[s.length-1-depth]

  # Program counter manipulation.
  curr_pc: ()   -> @curr_frame().pc
  goto_pc: (pc) -> @curr_frame().pc = pc
  inc_pc:  (n)  -> @curr_frame().pc += n

  # Heap manipulation.
  check_null: (obj) ->
    @java_throw @get_bs_class('Ljava/lang/NullPointerException;'), '' unless obj?
    obj

  heap_newarray: (type,len) ->
    if len < 0
      @java_throw @get_bs_class('Ljava/lang/NegativeArraySizeException;'),
        "Tried to init [#{type} array with length #{len}"
    # Gives the JavaScript engine a size hint.
    if type == 'J'
      new JavaArray @, @get_bs_class('[J'), util.arrayset(len, gLong.ZERO)
    else if type[0] in ['L','[']  # array of objects or other arrays
      new JavaArray @, @get_class("[#{type}"), util.arrayset(len, null)
    else  # numeric array
      new JavaArray @, @get_class("[#{type}"), util.arrayset(len, 0)

  # The given cls is already initialized.
  heap_multinewarray: (type, counts) ->
    dim = counts.length
    init_arr = (curr_dim, type) =>
      len = counts[curr_dim]
      if len < 0 then @java_throw(@get_bs_class('Ljava/lang/NegativeArraySizeException;'),
        "Tried to init dimension #{curr_dim} of a #{dim} dimensional #{type} array with length #{len}")
      # Gives the JavaScript engine a size hint.
      array = new Array(len)
      if curr_dim+1 == dim
        default_val = util.initial_value type
        array[i] = default_val for i in [0...len] by 1
      else
        next_dim = curr_dim + 1
        comp_type = type[1..]
        array[i] = init_arr(next_dim, comp_type) for i in [0...len] by 1
      return new JavaArray(@, @get_bs_class(type), array)
    return init_arr(0, type)

  # heap object initialization
  init_string: (str,intern=false) ->
    return s if intern and (s = @string_pool.get str)?
    carr = @init_carr str
    jvm_str = new JavaObject @, @get_bs_class('Ljava/lang/String;'),
      {'Ljava/lang/String;value':carr, 'Ljava/lang/String;count':str.length}
    @string_pool.set(str, jvm_str) if intern
    return jvm_str
  init_carr: (str) ->
    carr = new Array str.length
    carr[i] = str.charCodeAt(i) for i in [0...str.length] by 1
    new JavaArray @, @get_bs_class('[C'), carr

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
    @unusual_termination = true  # Used for exit codes in console frontend.
    if e.toplevel_catch_handler?
      @run_until_finished (=> e.toplevel_catch_handler(@)), no_threads, done_cb
    else
      error "\nInternal JVM Error:", e
      error e.stack if e?.stack?
      done_cb false
    return

  # Pauses the JVM for an asynchronous operation. The callback, cb, will be
  # called with another callback that it is responsible for calling with any
  # return values when it is time to resume the JVM.
  async_op: (cb) -> throw new YieldIOException cb

  # Asynchronously calls the bytecode method with the given arguments and passes
  # the return result to the callback, or passes a function that throws an
  # exception to the other callback.
  # Please only call this from a native method.
  #
  # 'cls': An *initialized* ClassData object.
  # 'method': The method object.
  # 'args': Array of arguments to the method. If this is a method on an object,
  #         the first argument should be the object.
  #         NOTE: If one of these arguments is a double or a long, you
  #               *must* correctly include a second 'null'!
  # If this is a constructor, we will automatic
  call_bytecode: (cls, method, args, success_cb, except_cb) ->
    # This is all very complicated. When this method calls your
    # callback, we're in the main loop. We need to give you a
    # function that allows you to put your return value back onto
    # the stack. In order to do this, I async_op you one more time
    # so you can put your return value on the stack and resume again.
    good_cb = (ret1, ret2) =>
      @async_op((good) ->
        good ret1, ret2
      )
    bad_cb = (e_fn) =>
      @async_op((good, bad) ->
        bad(e_fn)
      )

    @async_op () =>
      # Is this a constructor? <init>
      is_constructor = false
      if method.name.charAt(0) == '<' and method.name.charAt(1) == 'i'
        v = new JavaObject @, cls
        args.unshift v, v
        is_constructor = true

      # Set up a native frame with the callbacks.
      nf = root.StackFrame.native_frame("$bytecode_call", (()=>
          # What kind of method is it? Do we pop 0, 1, or 2?
          rv = undefined
          if method.return_type != 'V' or is_constructor
            if method.return_type == 'J' or method.return_type == 'D'
              @pop() # null
            rv = @pop()
          @meta_stack().pop()
          success_cb rv, good_cb, bad_cb
        ), ((e)=>
          @meta_stack().pop()
          except_cb((()->throw e),good_cb,bad_cb)
        )
      )
      @meta_stack().push(nf)
      # Add the arguments to the stack.
      @push_array args
      # Setup dat stack frame
      method.setup_stack(@)
      # Push ourselves back into the execution loop
      # to call the method!
      @run_until_finished((->), false, @stashed_done_cb)

  run_until_finished: (setup_fn, no_threads, done_cb) ->
    # Reset stack depth every time this is called. Prevents us from needing to
    # scatter this around the code everywhere to prevent filling the stack
    setImmediate (=>
      @stashed_done_cb = done_cb  # hack for the case where we error out of <clinit>
      try
        setup_fn()
        start_time = (new Date()).getTime()
        m_count = @max_m_count
        sf = @curr_frame()
        while sf.runner? and m_count > 0
          sf.runner()
          m_count--
          sf = @curr_frame()
        if sf.runner? && m_count == 0
          # Loop has stopped to give the browser some breathing room.
          duration = (new Date()).getTime() - start_time
          # We should yield once every 1-2 seconds or so.
          if duration > 2000 or duration < 1000
            # Figure out what to adjust max_m_count by.
            ms_per_m = duration / @max_m_count
            @max_m_count = (1000/ms_per_m)|0
          # Call ourselves to yield and resume.
          return @run_until_finished (->), no_threads, done_cb

        # we've finished this thread, no more runners
        # we're done if the only thread is "main"
        if no_threads or @thread_pool.length <= 1
          return done_cb(true)
        # remove the current (finished) thread
        debug "TE(toplevel): finished thread #{thread_name @, @curr_thread}"
        @curr_thread.$isAlive = false
        @thread_pool.splice @thread_pool.indexOf(@curr_thread), 1
        return @choose_next_thread null, (next_thread) =>
          @curr_thread = next_thread
          @run_until_finished (->), no_threads, done_cb
      catch e
        # XXX: We should remove this and have a better mechanism for 'returning'.
        if e is ReturnException
          @run_until_finished (->), no_threads, done_cb
        else if e instanceof YieldIOException
          # Set "bytecode" if this was triggered by a bytecode instruction (e.g.
          # class initialization). This causes the method to resume on the next
          # opcode once success_fn is called.
          success_fn = (ret1, ret2, bytecode, advance_pc=true) =>
            if bytecode
              @meta_stack().push root.StackFrame.native_frame("async_op")
            @curr_frame().runner = =>
              @meta_stack().pop()
              if bytecode and advance_pc
                @curr_frame().pc += 1 + @curr_frame().method.code.opcodes[@curr_frame().pc].byte_count
              unless ret1 is undefined
                ret1 += 0 if typeof ret1 == 'boolean'
                @push ret1
              @push ret2 unless ret2 is undefined
            @run_until_finished (->), no_threads, done_cb
          failure_fn = (e_cb) =>
            @meta_stack().push root.StackFrame.native_frame("async_op")
            @curr_frame().runner = =>
              @meta_stack().pop()
              e_cb()
            @run_until_finished (->), no_threads, done_cb
          e.condition success_fn, failure_fn
        else
          stack = @meta_stack()
          if e.method_catch_handler? and stack.length() > 1
            frames_to_pop = 0
            until e.method_catch_handler(@, stack.get_caller(frames_to_pop), frames_to_pop == 0)
              if stack.length() == ++frames_to_pop
                @dump_state() if jvm.dump_state
                stack.pop_n stack.length() - 1
                @handle_toplevel_exception e, no_threads, done_cb
                return
            stack.pop_n frames_to_pop
            @run_until_finished (->), no_threads, done_cb
          else
            @dump_state() if jvm.dump_state
            stack.pop_n Math.max(stack.length() - 1, 0)
            @handle_toplevel_exception e, no_threads, done_cb
      return  # this is an async method, no return value
    )

  # Provide buffering for the underlying input function, returning at most
  # n_bytes of data. Underlying _async_input is expected to 'block' if no
  # data is available.
  async_input: (n_bytes, resume) ->
    if @input_buffer.length > 0
      data = @input_buffer[...n_bytes]
      @input_buffer = @input_buffer[n_bytes...]
      resume data
      return
    @_async_input (data) =>
      if data.length > n_bytes
        @input_buffer = data[n_bytes...]
      resume data[...n_bytes]
