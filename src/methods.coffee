
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util'
opcodes ?= require './opcodes'
make_attributes ?= require './attributes'

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
  'java/io/FileSystem::getFileSystem()Ljava/io/FileSystem;': (rs) -> rs.push 0
  'java/lang/StrictMath::pow(DD)D': (rs) -> rs.push Math.pow(rs.cl(0),rs.cl(2)), null
  'java/lang/Object::registerNatives()V': (rs) -> # NOP
  'java/lang/System::registerNatives()V': (rs) -> # NOP
  'java/lang/Class::registerNatives()V': (rs) -> # NOP
  'sun/misc/Unsafe::registerNatives()V': (rs) -> # NOP
  'sun/misc/VM::initialize()V': (rs) ->  # NOP???
  'sun/reflect/Reflection::getCallerClass(I)Ljava/lang/Class;': ((rs) ->
    frames_to_skip = rs.curr_frame().locals[0]
    #TODO: disregard frames assoc. with java.lang.reflect.Method.invoke() and its implementation
    cls = rs.meta_stack[rs.meta_stack.length-1-frames_to_skip].class_name
    rs.push rs.set_obj({'type':'java/lang/Class', 'name':cls})
    )
  'java/lang/System::currentTimeMillis()J': (rs) -> rs.push (new Date).getTime(), null
  'java/lang/Class::getPrimitiveClass(Ljava/lang/String;)Ljava/lang/Class;': ((rs) ->
    str = rs.get_obj(rs.curr_frame().locals[0])
    carr = rs.get_obj(str.value).array
    cobj = {'type':'java/lang/Class', 'name': (String.fromCharCode(c) for c in carr).join('') }
    rs.push rs.set_obj(cobj)
    )
  'java/lang/Class::getClassLoader0()Ljava/lang/ClassLoader;': (rs) -> rs.push 0  # we don't need no stinkin classloaders
  'java/lang/Class::desiredAssertionStatus0(Ljava/lang/Class;)Z': (rs) -> rs.push 0 # we don't need no stinkin asserts
  'java/lang/System::initProperties(Ljava/util/Properties;)Ljava/util/Properties;': ((rs) ->
    p_ref = rs.curr_frame().locals[0]
    props = rs.get_obj(p_ref)
    console.log "initProperties is NYI, so expect anything referencing system props to break"
    # properties to set:
    #  java.version,java.vendor,java.vendor.url,java.home,java.class.version,java.class.path,
    #  os.name,os.arch,os.version,file.separator,path.separator,line.separator,
    #  user.name,user.home,user.dir     
    rs.push p_ref
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
  
  run: (runtime_state,virtual=false) ->
    caller_stack = runtime_state.curr_frame().stack
    if virtual # and @class_name isnt 'java/lang/String'  # avoid redirect shenanigans, ok because String is final
      # dirty hack to bounce up the inheritance tree, to make sure we call the method on the most specific type
      oref = caller_stack[caller_stack.length-@param_bytes()]
      obj = runtime_state.get_obj(oref)
      m_spec = {class: obj.type, sig: {name:@name, type:@raw_descriptor}}
      m = runtime_state.method_lookup(m_spec)
      throw "abstract method got called: #{@name}#{@raw_descriptor}" if m.access_flags.abstract
      return m.run(runtime_state)
    sig = "#{@class_name}::#{@name}#{@raw_descriptor}"
    params = @take_params caller_stack
    runtime_state.meta_stack.push(new runtime.StackFrame(@class_name,params,[]))
    padding = (' ' for _ in [2...runtime_state.meta_stack.length]).join('')
    console.log "#{padding}entering method #{sig}"
    if @access_flags.native
      throw "native method NYI: #{sig}" unless native_methods[sig]
      native_methods[sig](runtime_state)
      s = runtime_state.meta_stack.pop().stack
      switch s.length
        when 2 then runtime_state.push s[0], s[1]
        when 1 then runtime_state.push s[0]
        when 0 then break
        else
          throw "too many items on the stack after native method #{sig}"
      cf = runtime_state.curr_frame()
      console.log "#{padding}stack: [#{cf.stack}], local: [#{cf.locals}] (method end)"
      return
    code = @get_code().opcodes
    while true
      cf = runtime_state.curr_frame()
      pc = runtime_state.curr_pc()
      op = code[pc]
      console.log "#{padding}stack: [#{cf.stack}], local: [#{cf.locals}]"
      console.log "#{padding}#{@name}:#{pc} => #{op.name}"
      op.execute runtime_state
      if op.name.match /.*return/
        s = runtime_state.meta_stack.pop().stack
        if op.name in ['ireturn','freturn','areturn']
          caller_stack.push s[0]
        else if op.name in ['lreturn','dreturn']
          caller_stack.push s[0]
          caller_stack.push null
        break
      unless op instanceof opcodes.BranchOpcode
        runtime_state.inc_pc(1 + op.byte_count)  # move to the next opcode
    console.log "#{padding}stack: [#{cf.stack}], local: [#{cf.locals}] (method end)"
