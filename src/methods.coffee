
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util'
opcodes ?= require './opcodes'
make_attributes ?= require './attributes'
{debug,warn,error} = util

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
  parse_descriptor: (raw_descriptor) ->
    @type = @parse_field_type raw_descriptor.split ''
    if @access_flags.static
      @static_value = null  # loaded in when getstatic is called

trapped_methods = {
  'java/lang/System::setJavaLangAccess()V': (rs) -> #NOP
  'java/lang/System::loadLibrary(Ljava/lang/String;)V': (rs) -> warn "warning: library loads are NYI"
  'java/lang/System::adjustPropertiesForBackwardCompatibility(Ljava/util/Properties;)V': (rs) -> #NOP (apple-java specific?)
  'java/lang/ThreadLocal::<clinit>()V': (rs) -> #NOP
  'java/lang/ThreadLocal::<init>()V': (rs) -> #NOP
  'java/lang/Thread::<clinit>()V': (rs) -> #NOP
  'java/lang/Thread::getThreadGroup()Ljava/lang/ThreadGroup;': (rs) -> rs.push rs.set_obj({'type':'java/lang/ThreadGroup'}) # mock
  'java/lang/ThreadGroup::add(Ljava/lang/Thread;)V': (rs) -> #NOP (used in System init code, on mock objects)
  'java/lang/Terminator::setup()V': (rs) -> #NOP
  'java/util/concurrent/atomic/AtomicInteger::<clinit>()V': (rs) -> #NOP
  'java/util/concurrent/atomic/AtomicInteger::compareAndSet(II)Z': (rs) -> rs.push 1  # always true
  'sun/misc/Unsafe::getUnsafe()Lsun/misc/Unsafe;': ((rs) -> # avoid reflection
    rs.static_get({'class':'sun/misc/Unsafe','sig':{'name':'theUnsafe'}}))
  'java/util/concurrent/atomic/AtomicReferenceFieldUpdater::newUpdater(Ljava/lang/Class;Ljava/lang/Class;Ljava/lang/String;)Ljava/util/concurrent/atomic/AtomicReferenceFieldUpdater;': (rs) -> rs.push 0 # null
  'java/nio/charset/Charset$3::run()Ljava/lang/Object;': (rs) -> rs.push 0 # null
  'java/nio/Bits::byteOrder()Ljava/nio/ByteOrder;': (rs) -> rs.static_get {'class':'java/nio/ByteOrder','sig':{'name':'LITTLE_ENDIAN'}}
  'java/lang/Class::newInstance0()Ljava/lang/Object;': ((rs) -> #implemented here to avoid reflection
    classname = rs.get_obj(rs.curr_frame().locals[0]).name
    rs.push (oref = rs.init_object(classname))
    rs.method_lookup({'class':classname,'sig':{'name':'<init>'}}).run(rs)
    rs.push oref
    )
  'java/io/PrintStream::write(Ljava/lang/String;)V': ((rs) ->
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
    )
}
  
native_methods = {
  'java/lang/System::arraycopy(Ljava/lang/Object;ILjava/lang/Object;II)V': ((rs) -> 
    args = rs.curr_frame().locals
    src_array = rs.get_obj(args[0]).array
    src_pos = args[1]
    dest_array = rs.get_obj(args[2]).array
    dest_pos = args[3]
    length = args[4]
    j = dest_pos
    for i in [src_pos...src_pos+length]
      dest_array[j++] = src_array[i]
    )
  'java/lang/Float::floatToRawIntBits(F)I': ((rs) ->  #note: not tested for weird values
    f_val = rs.curr_frame().locals[0]
    sign = if f_val < 0 then 1 else 0
    f_val = Math.abs(f_val)
    exp = Math.floor(Math.log(f_val)/Math.LN2)
    sig = (f_val/Math.pow(2,exp)-1)/Math.pow(2,-23)
    rs.push (sign<<31)+((exp+127)<<23)+sig
    )
  'java/lang/Double::doubleToRawLongBits(D)J': ((rs) ->#note: not tested at all
    d_val = rs.curr_frame().locals[0]
    sign = if d_val < 0 then 1 else 0
    d_val = Math.abs(d_val)
    exp = Math.floor(Math.log(d_val)/Math.LN2)
    sig = (d_val/Math.pow(2,exp)-1)/Math.pow(2,-52)
    rs.push util.lshift(sign,63)+util.lshift(exp+1023,52)+sig
    )
  'java/security/AccessController::doPrivileged(Ljava/security/PrivilegedAction;)Ljava/lang/Object;': ((rs) ->
    oref = rs.curr_frame().locals[0]
    action = rs.get_obj(oref)
    m = rs.method_lookup({'class': action.type, 'sig': {'name': 'run','type':'()Ljava/lang/Object;'}})
    rs.push oref unless m.access_flags.static
    m.run(rs,m.access_flags.virtual)
    )
  'java/io/FileSystem::getFileSystem()Ljava/io/FileSystem;': (rs) -> rs.heap_new('java/io/UnixFileSystem')
  'java/lang/StrictMath::pow(DD)D': (rs) -> rs.push Math.pow(rs.cl(0),rs.cl(2)), null
  'sun/misc/VM::initialize()V': (rs) ->  # NOP???
  'sun/reflect/Reflection::getCallerClass(I)Ljava/lang/Class;': ((rs) ->
    frames_to_skip = rs.curr_frame().locals[0]
    #TODO: disregard frames assoc. with java.lang.reflect.Method.invoke() and its implementation
    cls = rs.meta_stack[rs.meta_stack.length-1-frames_to_skip].class_name
    rs.push rs.set_obj({'type':'java/lang/Class', 'name':cls})
    )
  'java/lang/System::currentTimeMillis()J': (rs) -> rs.push (new Date).getTime(), null
  'java/lang/String::intern()Ljava/lang/String;': ((rs) -> 
    str_ref = rs.curr_frame().locals[0]
    js_str = rs.jvm2js_str(rs.get_obj(str_ref))
    unless rs.string_pool[js_str]
      rs.string_pool[js_str] = str_ref
    rs.push rs.string_pool[js_str]
    )
  'java/lang/Class::getPrimitiveClass(Ljava/lang/String;)Ljava/lang/Class;': ((rs) ->
    str = rs.get_obj(rs.curr_frame().locals[0])
    carr = rs.get_obj(str.value).array
    cobj = {'type':'java/lang/Class', 'name': (String.fromCharCode(c) for c in carr).join('') }
    rs.push rs.set_obj(cobj)
    )
  'java/lang/Thread::currentThread()Ljava/lang/Thread;': (rs) -> rs.push rs.set_obj({'type':'java/lang/Thread'}) # mock thread
  'java/lang/Object::getClass()Ljava/lang/Class;': (rs) -> rs.push rs.set_obj({'type':'java/lang/Class', 'name':'java/lang/Object'})
  'java/lang/Class::getClassLoader0()Ljava/lang/ClassLoader;': (rs) -> rs.push 0  # we don't need no stinkin classloaders
  'java/lang/Class::desiredAssertionStatus0(Ljava/lang/Class;)Z': (rs) -> rs.push 0 # we don't need no stinkin asserts
  'java/lang/Class::getName0()Ljava/lang/String;': (rs) -> rs.push rs.init_string(rs.get_obj(rs.curr_frame().locals[0]).name)
  'java/lang/Class::forName0(Ljava/lang/String;ZLjava/lang/ClassLoader;)Ljava/lang/Class;': ((rs) ->
    jvm_str = rs.get_obj(rs.curr_frame().locals[0])
    classname = rs.jvm2js_str(jvm_str).replace(/\./g,'/')
    throw "Class.forName0: Failed to load #{classname}" unless rs.class_lookup(classname)
    rs.push rs.set_obj({'type':'java/lang/Class', 'name':classname})
    )
  'java/lang/System::initProperties(Ljava/util/Properties;)Ljava/util/Properties;': ((rs) ->
    p_ref = rs.curr_frame().locals[0]
    m = rs.method_lookup({'class':'java/util/Properties','sig':{'name':'setProperty'}})
    # properties to set:
    #  java.version,java.vendor,java.vendor.url,java.home,java.class.version,java.class.path,
    #  os.name,os.arch,os.version,file.separator,path.separator,line.separator,
    #  user.name,user.home,user.dir
    props = {'file.encoding':'US_ASCII','java.vendor':'Coffee-JVM'}
    for k,v of props
      rs.push p_ref, rs.init_string(k,true), rs.init_string(v,true)
      m.run(rs)
      rs.pop()  # we don't care about the return value
    rs.push p_ref
    )
  'java/lang/Throwable::fillInStackTrace()Ljava/lang/Throwable;': (rs) ->
    #TODO possibly filter out the java calls from our own call stack.
    # at the moment, this is effectively a NOP.
    rs.push rs.curr_frame().locals[0]
  'java/lang/System::setIn0(Ljava/io/InputStream;)V': ((rs) -> 
    rs.push rs.curr_frame().locals[0] # move oref to the stack for static_put
    rs.static_put {'class':'java/lang/System','sig':{'name':'in'}}
    )
  'java/lang/System::setOut0(Ljava/io/PrintStream;)V': ((rs) ->
    rs.push rs.curr_frame().locals[0] # move oref to the stack for static_put
    rs.static_put {'class':'java/lang/System','sig':{'name':'out'}}
    )
  'java/lang/System::setErr0(Ljava/io/PrintStream;)V': ((rs) ->
    rs.push rs.curr_frame().locals[0] # move oref to the stack for static_put
    rs.static_put {'class':'java/lang/System','sig':{'name':'err'}}
    )
}

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
  
  run_manually: (runtime_state, func, padding='') ->
    func(runtime_state)
    s = runtime_state.meta_stack.pop().stack
    switch s.length
      when 2 then runtime_state.push s[0], s[1]
      when 1 then runtime_state.push s[0]
      when 0 then break
      else
        throw "too many items on the stack after manual method #{sig}"
    cf = runtime_state.curr_frame()
    debug "#{padding}stack: [#{cf.stack}], local: [#{cf.locals}] (manual method end)"

  run: (runtime_state,virtual=false) ->
    caller_stack = runtime_state.curr_frame().stack
    if virtual
      # dirty hack to bounce up the inheritance tree, to make sure we call the method on the most specific type
      oref = caller_stack[caller_stack.length-@param_bytes()]
      error "undef'd oref: (#{caller_stack})[-#{@param_bytes()}] (#{@class_name}::#{@name}#{@raw_descriptor})" unless oref
      obj = runtime_state.get_obj(oref)
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
    if trapped_methods[sig]
      return @run_manually(runtime_state,trapped_methods[sig],padding)
    if @access_flags.native
      if sig.indexOf('::registerNatives()V',1) >= 0 or sig.indexOf('::initIDs()V',1) >= 0
        return @run_manually(runtime_state,((rs)->),padding)  # these are all just NOPs
      throw "native method NYI: #{sig}" unless native_methods[sig]
      return @run_manually(runtime_state,native_methods[sig],padding)
    # main eval loop: execute each opcode, using the pc to iterate through
    code = @get_code().opcodes
    while true
      try
        rs = runtime_state
        cf = rs.curr_frame()
        pc = rs.curr_pc()
        op = code[pc]
        throw "#{@name}:#{pc} => (null)" unless op
        debug "#{padding}stack: [#{cf.stack}], local: [#{cf.locals}]"
        debug "#{padding}#{@name}:#{pc} => #{op.name}"
        op.execute rs
        unless op instanceof opcodes.BranchOpcode
          rs.inc_pc(1 + op.byte_count)  # move to the next opcode
      catch e
        if e instanceof util.ReturnException
          rs.meta_stack.pop()
          caller_stack.push e.values...
          break
        else if e instanceof util.JavaException
          exception_handlers = @get_code().exception_handlers
          handler = _.find exception_handlers, (eh) ->
            eh.start_pc <= pc < eh.end_pc and
              (eh.catch_type == "<all>" or rs.is_castable e.exception.type, eh.catch_type)
          if handler?
            rs.push e.exception_ref
            rs.goto_pc handler.handler_pc
            continue
          else # abrupt method invocation completion
            rs.meta_stack.pop()
            throw e
        throw e # JVM Error
    debug "#{padding}stack: [#{cf.stack}], local: [#{cf.locals}] (method end)"
