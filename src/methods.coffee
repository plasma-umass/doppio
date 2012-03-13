
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util'
opcodes ?= require './opcodes'
make_attributes ?= require './attributes'
disassembler ?= require './disassembler'
{log,debug,error} = util
{opcode_annotators} = disassembler

# things assigned to root will be available outside this module
root = exports ? this.methods = {}

class AbstractMethodField
  """ Subclasses need to implement parse_descriptor(String) """
  constructor: (@class_name) ->

  parse: (bytes_array,constant_pool) ->
    @access_flags = util.parse_flags(util.read_uint(bytes_array.splice(0,2)))
    @name = constant_pool.get(util.read_uint(bytes_array.splice(0,2))).value
    @raw_descriptor = constant_pool.get(util.read_uint(bytes_array.splice(0,2))).value
    @parse_descriptor @raw_descriptor
    [@attrs,bytes_array] = make_attributes(bytes_array,constant_pool)
    return bytes_array
  
  parse_field_type: (char_array) ->
    c = char_array.shift()
    switch c
      when 'B' then { type: 'byte' }
      when 'C' then { type: 'char' }
      when 'D' then { type: 'double' }
      when 'F' then { type: 'float' }
      when 'I' then { type: 'int' }
      when 'J' then { type: 'long' }
      when 'L' then {
        type: 'reference'
        ref_type: 'class'
        referent: {
          type: 'class' # not technically a legal type
          class_name: (c while (c = char_array.shift()) != ';').join('')
        }
      }
      when 'S' then { type: 'short' }
      when 'Z' then { type: 'boolean' }
      when '[' then {
        type: 'reference'
        ref_type: 'array'
        referent: @parse_field_type char_array
      }
      else
        char_array.unshift(c)
        return null

class root.Field extends AbstractMethodField
  parse_descriptor: (@raw_descriptor) ->
    @type = @parse_field_type raw_descriptor.split ''
    if @access_flags.static
      @static_value = null  # loaded in when getstatic is called

# convenience function. idea taken from coffeescript's grammar
o = (fn_name, fn) -> fn_name: fn_name, fn: fn

trapped_methods =
  java:
    lang:
      ref:
        SoftReference: [
          o 'get()Ljava/lang/Object;', (rs) -> rs.push 0 # null, because we don't actually use SoftReferences
        ]
      Class: [
        o 'newInstance0()L!/!/Object;', (rs) -> #implemented here to avoid reflection
            classname = rs.get_obj(rs.curr_frame().locals[0]).fields.name
            rs.push (oref = rs.init_object(classname))
            rs.method_lookup({'class':classname,'sig':{'name':'<init>'}}).run(rs)
            rs.push oref
        o 'forName(L!/!/String;)L!/!/!;', (rs) -> #again, to avoid reflection
            classname = rs.jvm2js_str rs.get_obj(rs.curr_frame().locals[0])
            rs.push rs.init_object 'java/lang/Class', { name:classname }
      ]
      System: [
        o 'setJavaLangAccess()V', (rs) -> # NOP
        o 'loadLibrary(L!/!/String;)V', (rs) ->
            args = rs.curr_frame().locals
            lib = rs.jvm2js_str rs.get_obj args[0]
            error "Attempt to load library '#{lib}' failed: library loads are NYI"
        o 'adjustPropertiesForBackwardCompatibility(L!/util/Properties;)V', (rs) -> #NOP (apple-java specific?)
      ]
      Terminator: [
        o 'setup()V', (rs) -> #NOP
      ]
    util:
      concurrent:
        atomic:
          AtomicInteger: [
            o '<clinit>()V', (rs) -> #NOP
            o 'compareAndSet(II)Z', (rs) -> 
              args = rs.curr_frame().locals
              rs.get_obj(args[0]).fields.value = args[2];  # we don't need to compare, just set
              rs.push 1  # always true, because we only have one thread
          ]
          AtomicReferenceFieldUpdater: [
            o 'newUpdater(L!/lang/Class;L!/lang/Class;L!/lang/String;)L!/!/!/!/!;', (rs) -> rs.push 0 # null
          ]
        locks:
          AbstractQueuedSynchronizer: [
            o '<clinit>()V', (rs) -> #NOP
            o 'compareAndSetState(II)Z', (rs) -> rs.push 1 # always true
            o 'release(I)Z', (rs) -> rs.push 1 # always true
          ]
      Currency: [
        o '<clinit>()V', (rs) -> #NOP, because it uses lots of reflection and we don't need it
      ]
      ResourceBundle: [
        o 'getBundle(L!/lang/String;L!/!/Locale;L!/!/ResourceBundle$Control;)L!/!/!;', (rs) ->
            # load in the default ResourceBundle (ignores locale)
            args = rs.curr_frame().locals
            classname = util.int_classname rs.jvm2js_str(rs.get_obj(args[0]))
            rs.push (b_ref = rs.init_object classname)
            rs.method_lookup({class: classname, sig: {name:'<init>',type:'()V'}}).run(rs)
            rs.push b_ref
      ]
    nio:
      charset:
        Charset$3: [
          o 'run()L!/lang/Object;', (rs) -> rs.push 0 # null
        ]
      Bits: [
        o 'byteOrder()L!/!/ByteOrder;', (rs) -> rs.static_get {'class':'java/nio/ByteOrder','sig':{'name':'LITTLE_ENDIAN'}}
      ]
    io:
      PrintStream: [
        o 'write(L!/lang/String;)V', (rs) ->
            args = rs.curr_frame().locals
            str = rs.jvm2js_str(rs.get_obj(args[1]))
            rs.static_get {'class':'java/lang/System','sig':{'name':'out'}}; sysout = rs.pop()
            rs.static_get {'class':'java/lang/System','sig':{'name':'err'}}; syserr = rs.pop()
            if args[0] is sysout
              rs.print str
            else if args[0] is syserr
              rs.print str
            else
              throw "You tried to write to a PrintStream that wasn't System.out or System.err! For shame!"
      ]
  sun:
    misc:
      FloatingDecimal: [
        o '<clinit>()V', (rs) -> #NOP
        o '<init>(F)V', (rs) ->
            args = rs.curr_frame().locals
            rs.get_obj(args[0]).fields.js_value = args[1]
        o '<init>(D)V', (rs) ->
            args = rs.curr_frame().locals
            rs.get_obj(args[0]).fields.js_value = args[1]
        o 'toString()Ljava/lang/String;', (rs) ->
            val = rs.get_obj(rs.curr_frame().locals[0]).fields.js_value
            rs.push rs.init_string util.num_to_string(val, true)
        o 'appendTo(Ljava/lang/Appendable;)V', (rs) ->
            args = rs.curr_frame().locals
            val = rs.get_obj(args[0]).fields.js_value
            rs.push args[1]
            rs.push rs.init_string util.num_to_string(val, true)
            cls = if rs.check_cast(args[1],'java/lang/StringBuilder') then 'java/lang/StringBuilder' else 'java/lang/StringBuffer'
            rs.method_lookup({class:cls,sig:{name:'append',type:"(Ljava/lang/String;)L#{cls};"}}).run(rs,true)
      ]
      Unsafe: [
        o 'getUnsafe()L!/!/!;', (rs) -> # avoid reflection
            rs.static_get({'class':'sun/misc/Unsafe','sig':{'name':'theUnsafe'}})
      ]
    util:
      LocaleServiceProviderPool: [
        o 'getPool(Ljava/lang/Class;)L!/!/!;', (rs) -> 
            # make a mock
            rs.push rs.init_object 'sun/util/LocaleServiceProviderPool'
        o 'hasProviders()Z', (rs) -> rs.push 0  # false, we can't provide anything
      ]
  
doPrivileged = (rs) ->
  oref = rs.curr_frame().locals[0]
  action = rs.get_obj(oref)
  m = rs.method_lookup({'class': action.type, 'sig': {'name': 'run','type':'()Ljava/lang/Object;'}})
  rs.push oref unless m.access_flags.static
  m.run(rs,m.access_flags.virtual)

native_methods =
  java:
    lang:
      Class: [
        o 'getPrimitiveClass(L!/!/String;)L!/!/!;', (rs) ->
            str_ref = rs.get_obj(rs.curr_frame().locals[0])
            name = rs.jvm2js_str str_ref
            rs.push rs.set_obj 'java/lang/Class', { name: name }
        o 'getClassLoader0()L!/!/ClassLoader;', (rs) -> rs.push 0  # we don't need no stinkin classloaders
        o 'desiredAssertionStatus0(L!/!/!;)Z', (rs) -> rs.push 0 # we don't need no stinkin asserts
        o 'getName0()L!/!/String;', (rs) -> rs.push rs.init_string(rs.get_obj(rs.curr_frame().locals[0]).fields.name)
        o 'forName0(L!/!/String;ZL!/!/ClassLoader;)L!/!/!;', (rs) ->
            jvm_str = rs.get_obj(rs.curr_frame().locals[0])
            classname = util.int_classname rs.jvm2js_str(jvm_str)
            throw "Class.forName0: Failed to load #{classname}" unless rs.class_lookup(classname)
            rs.push rs.set_obj 'java/lang/Class', { name:classname }
        o 'getComponentType()L!/!/!;', (rs) ->
            type = rs.get_obj(rs.curr_frame().locals[0]).fields.name
            component_type = /\[+(.*)/.exec(type)[1]
            rs.push rs.set_obj 'java/lang/Class', name:component_type
      ],
      Float: [
        o 'floatToRawIntBits(F)I', (rs) ->  #note: not tested for weird values
            f_val = rs.curr_frame().locals[0]
            sign = if f_val < 0 then 1 else 0
            f_val = Math.abs(f_val)
            exp = Math.floor(Math.log(f_val)/Math.LN2)
            sig = (f_val/Math.pow(2,exp)-1)/Math.pow(2,-23)
            rs.push (sign<<31)+((exp+127)<<23)+sig
      ]
      Double: [
        o 'doubleToRawLongBits(D)J', (rs) ->#note: not tested at all
            d_val = rs.curr_frame().locals[0]
            sign = if d_val < 0 then 1 else 0
            d_val = Math.abs(d_val)
            exp = Math.floor(Math.log(d_val)/Math.LN2)
            sig = (d_val/Math.pow(2,exp)-1)/Math.pow(2,-52)
            rs.push util.lshift(sign,63)+util.lshift(exp+1023,52)+sig, null
      ]
      Object: [
        o 'getClass()L!/!/Class;', (rs) ->
            _this = rs.get_obj(rs.curr_frame().locals[0])
            rs.push rs.set_obj 'java/lang/Class', { name:util.ext_classname _this.type}
        o 'hashCode()I', (rs) ->
            # return heap reference. XXX need to change this if we ever implement
            # GC that moves stuff around.
            rs.push rs.curr_frame().locals[0]
      ]
      reflect:
        Array: [
          o 'newArray(L!/!/Class;I)L!/!/Object;', (rs) ->
              type = rs.get_obj(rs.curr_frame().locals[0]).fields.name
              len = rs.curr_frame().locals[0]
              rs.heap_newarray util.int_classname type, len
        ]
      StrictMath: [
        o 'pow(DD)D', (rs) -> rs.push Math.pow(rs.cl(0),rs.cl(2)), null
      ]
      String: [
        o 'intern()L!/!/!;', (rs) ->
            str_ref = rs.curr_frame().locals[0]
            js_str = rs.jvm2js_str(rs.get_obj(str_ref))
            unless rs.string_pool[js_str]
              rs.string_pool[js_str] = str_ref
              rs.push rs.string_pool[js_str]
      ]
      System: [
        o 'arraycopy(L!/!/Object;IL!/!/Object;II)V', (rs) ->
            args = rs.curr_frame().locals
            src_array = rs.get_obj(args[0]).array
            src_pos = args[1]
            dest_array = rs.get_obj(args[2]).array
            dest_pos = args[3]
            length = args[4]
            j = dest_pos
            for i in [src_pos...src_pos+length]
              dest_array[j++] = src_array[i]
        o 'currentTimeMillis()J', (rs) -> rs.push (new Date).getTime(), null
        o 'initProperties(L!/util/Properties;)L!/util/Properties;', (rs) ->
            p_ref = rs.curr_frame().locals[0]
            m = rs.method_lookup({'class':'java/util/Properties','sig':{'name':'setProperty'}})
            # properties to set:
            #  java.version,java.vendor,java.vendor.url,java.home,java.class.version,java.class.path,
            #  os.name,os.arch,os.version,file.separator,path.separator,
            #  user.name,user.home,user.dir
            props = {'file.encoding':'US_ASCII','java.vendor':'Coffee-JVM','line.separator':'\n'}
            for k,v of props
              rs.push p_ref, rs.init_string(k,true), rs.init_string(v,true)
              m.run(rs)
              rs.pop()  # we don't care about the return value
            rs.push p_ref
        o 'setIn0(L!/io/InputStream;)V', (rs) ->
            rs.push rs.curr_frame().locals[0] # move oref to the stack for static_put
            rs.static_put {'class':'java/lang/System','sig':{'name':'in'}}
        o 'setOut0(L!/io/PrintStream;)V', (rs) ->
            rs.push rs.curr_frame().locals[0] # move oref to the stack for static_put
            rs.static_put {'class':'java/lang/System','sig':{'name':'out'}}
        o 'setErr0(L!/io/PrintStream;)V', (rs) ->
            rs.push rs.curr_frame().locals[0] # move oref to the stack for static_put
            rs.static_put {'class':'java/lang/System','sig':{'name':'err'}}
      ]
      Thread: [
        o 'currentThread()L!/!/!;', (rs) ->  # essentially a singleton for the main thread mock object
            unless rs.main_thread?
              rs.push (g_ref = rs.init_object 'java/lang/ThreadGroup')
              # have to run the private ThreadGroup constructor
              rs.method_lookup({class: 'java/lang/ThreadGroup', sig: {name:'<init>',type:'()V'}}).run(rs)
              rs.main_thread = rs.set_obj 'java/lang/Thread', { priority: 1, group: g_ref, threadLocals: 0 }
              rs.field_lookup({class: 'java/lang/Thread', sig: {name:'threadSeqNumber'}}).static_value = 0
            rs.push rs.main_thread
        o 'setPriority0(I)V', (rs) -> # NOP
        o 'isAlive()Z', (rs) -> rs.push 0 # always false
        o 'start0()V', (rs) -> # NOP
      ]
      Throwable: [
        o 'fillInStackTrace()L!/!/!;', (rs) ->
            #TODO possibly filter out the java calls from our own call stack.
            # at the moment, this is effectively a NOP.
            rs.push rs.curr_frame().locals[0]
      ]
    security:
      AccessController: [
        o 'doPrivileged(L!/!/PrivilegedAction;)L!/lang/Object;', doPrivileged
        o 'doPrivileged(L!/!/PrivilegedExceptionAction;)L!/lang/Object;', doPrivileged
        o 'getStackAccessControlContext()Ljava/security/AccessControlContext;', (rs) -> rs.push 0  # null
      ]
    io:
      FileSystem: [
        o 'getFileSystem()L!/!/!;', (rs) -> rs.heap_new('java/io/UnixFileSystem')
      ]
      FileOutputStream: [
        o 'writeBytes([BII)V', (rs) ->
            args = rs.curr_frame().locals
            rs.print rs.jvm_carr2js_str(args[1], args[2], args[3])
      ]
  sun:
    misc:
      VM: [
        o 'initialize()V', (rs) ->  # NOP???
      ]
    reflect:
      Reflection: [
        o 'getCallerClass(I)Ljava/lang/Class;', (rs) ->
            frames_to_skip = rs.curr_frame().locals[0]
            #TODO: disregard frames assoc. with java.lang.reflect.Method.invoke() and its implementation
            cls = rs.meta_stack[rs.meta_stack.length-1-frames_to_skip].class_name
            rs.push rs.set_obj 'java/lang/Class', { name:cls }
      ]

flatten_pkg = (pkg) ->
  result = {}
  pkg_name_arr = []
  rec_flatten = (pkg) ->
    for pkg_name, inner_pkg of pkg
      pkg_name_arr.push pkg_name
      if inner_pkg instanceof Array
        for method in inner_pkg
          {fn_name, fn} = method
          # expand out the '!'s in the method names
          fn_name = fn_name.replace /!|;/g, (->
            depth = 0
            (c) ->
              if c == '!' then pkg_name_arr[depth++]
              else if c == ';' then depth = 0; c
              else c
          )()
          full_name = "#{pkg_name_arr.join '/'}::#{fn_name}"
          result[full_name] = fn
      else
        flattened_inner = rec_flatten inner_pkg
      pkg_name_arr.pop pkg_name
  rec_flatten pkg
  result
  
trapped_methods = flatten_pkg trapped_methods
native_methods = flatten_pkg native_methods

array_methods =
  'getClass()Ljava/lang/Class;': (rs) ->
    _this = rs.get_obj(rs.curr_frame().locals[0])
    rs.push rs.set_obj 'java/lang/Class', {name:util.ext_classname _this.type}

class root.Method extends AbstractMethodField
  get_code: ->
    return _.find(@attrs, (a) -> a.constructor.name == "Code")

  parse_descriptor: (raw_descriptor) ->
    raw_descriptor = raw_descriptor.split ''
    throw "Invalid descriptor #{raw_descriptor}" if raw_descriptor.shift() != '('
    @param_types = (field while (field = @parse_field_type raw_descriptor))
    throw "Invalid descriptor #{raw_descriptor}" if raw_descriptor.shift() != ')'
    @num_args = @param_types.length
    @num_args++ unless @access_flags.static # nonstatic methods get 'this'
    if raw_descriptor[0] == 'V'
      raw_descriptor.shift()
      @return_type = { type: 'void' }
    else
      @return_type = @parse_field_type raw_descriptor

  param_bytes: () ->
    type_size = (t) -> (if t in ['double','long'] then 2 else 1)
    n_bytes = util.sum(type_size(p.type) for p in @param_types)
    n_bytes++ unless @access_flags.static
    n_bytes

  take_params: (caller_stack) ->
    params = []
    n_bytes = @param_bytes()
    caller_stack.splice(caller_stack.length-n_bytes,n_bytes)
  
  # used by run and run_manually to print arrays for debugging. we need this to
  # distinguish [null] from [].
  pa = (a) -> a.map((e)->if e? then e else '!')

  run_manually: (func, runtime_state, args...) ->
    func runtime_state, args...
    s = runtime_state.meta_stack.pop().stack
    throw "too many items on the stack after manual method #{sig}" unless s.length <= 2
    runtime_state.push s...

  run_bytecode: (rs, padding) ->
    # main eval loop: execute each opcode, using the pc to iterate through
    code = @get_code().opcodes
    while true
      try
        cf = rs.curr_frame()
        pc = rs.curr_pc()
        op = code[pc]
        throw "#{@name}:#{pc} => (null)" unless op
        debug "#{padding}stack: [#{pa cf.stack}], local: [#{pa cf.locals}]"
        annotation =
          util.lookup_handler(opcode_annotators, op, pc, rs.class_lookup(@class_name).constant_pool) or ""
        debug "#{padding}#{@class_name}::#{@name}:#{pc} => #{op.name}" + annotation
        op.execute rs
        rs.inc_pc(1 + op.byte_count)  # move to the next opcode
      catch e
        if e instanceof util.BranchException
          rs.goto_pc e.dst_pc
          continue
        else if e instanceof util.ReturnException
          rs.meta_stack.pop()
          rs.push e.values...
          break
        else if e instanceof util.JavaException
          exception_handlers = @get_code().exception_handlers
          handler = _.find exception_handlers, (eh) ->
            eh.start_pc <= pc < eh.end_pc and
              (eh.catch_type == "<any>" or rs.is_castable e.exception.type, eh.catch_type)
          if handler?
            rs.push e.exception_ref
            rs.goto_pc handler.handler_pc
            continue
          else # abrupt method invocation completion
            rs.meta_stack.pop()
            throw e
        throw e # JVM Error

  run: (runtime_state,virtual=false) ->
    caller_stack = runtime_state.curr_frame().stack
    unless @access_flags.static
      oref = caller_stack[caller_stack.length-@param_bytes()]
      error "undef'd oref: (#{caller_stack})[-#{@param_bytes()}] (#{@class_name}::#{@name}#{@raw_descriptor})" unless oref
      obj = runtime_state.get_obj(oref)
      is_array = obj.type[0] == '['
    if virtual and not is_array
      # dirty hack to bounce up the inheritance tree, to make sure we call the method on the most specific type
      m_spec = {class: obj.type, sig: {name:@name, type:@raw_descriptor}}
      m = runtime_state.method_lookup(m_spec)
      throw "abstract method got called: #{@name}#{@raw_descriptor}" if m.access_flags.abstract
      return m.run(runtime_state)
    sig = "#{@class_name}::#{@name}#{@raw_descriptor}"
    params = @take_params caller_stack
    runtime_state.meta_stack.push(new runtime.StackFrame(this,params,[]))
    padding = (' ' for [2...runtime_state.meta_stack.length]).join('')
    debug "#{padding}entering method #{sig}"
    # check for trapped and native methods, run those manually
    if is_array
      [__,brackets,component_type] = /(\[*)(.*)/.exec(obj.type)
      # ensure component type is loaded if it is a class
      if component_type[0] == 'L'
        runtime_state.class_lookup component_type[1...component_type.length-1]
      @run_manually array_methods[@name+@raw_descriptor], runtime_state
    else if trapped_methods[sig]
      @run_manually trapped_methods[sig], runtime_state
    else if @access_flags.native
      if sig.indexOf('::registerNatives()V',1) >= 0 or sig.indexOf('::initIDs()V',1) >= 0
        @run_manually ((rs)->), runtime_state # these are all just NOPs
      else if native_methods[sig]
        @run_manually native_methods[sig], runtime_state
      else
        throw "native method NYI: #{sig}"
    else
      @run_bytecode runtime_state, padding
    cf = runtime_state.curr_frame()
    debug "#{padding}stack: [#{pa cf.stack}], local: [#{pa cf.locals}] (method end)"
