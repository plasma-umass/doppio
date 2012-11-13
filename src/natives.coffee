
# pull in external modules
_ = require '../vendor/_.js'
gLong = require '../vendor/gLong.js'
util = require './util'
types = require './types'
runtime = require './runtime'
{thread_name,JavaArray} = require './java_object'
exceptions = require './exceptions'
{log,debug,error} = require './logging'
path = node?.path ? require 'path'
fs = node?.fs ? require 'fs'
{c2t} = types

"use strict"

# things assigned to root will be available outside this module
root = exports ? this.natives = {}

system_properties = {
  'java.home':'vendor/java_home/', 'file.encoding':'US_ASCII','java.vendor':'DoppioVM',
  'java.version': '1.6', 'java.vendor.url': 'https://github.com/int3/doppio',
  'java.class.version': '50.0', 'java.class.path': '.',
  'line.separator':'\n', 'file.separator':'/', 'path.separator':':',
  'user.dir':'.','user.home':'.','user.name':'DoppioUser',
  'os.name':'Doppio', 'os.arch': 'js', 'os.version': '0',
  'sun.boot.class.path': '/home/doppio/vendor/classes',
  'java.awt.headless': 'true',
  'useJavaUtilZip': 'true'  # hack for sun6javac, avoid ZipFileIndex shenanigans
}

get_property = (rs, jvm_key, _default = null) ->
  val = system_properties[jvm_key.jvm2js_str()]
  if val? then rs.init_string(val, true) else _default

# convenience function. idea taken from coffeescript's grammar
o = (fn_name, fn) -> fn_name: fn_name, fn: fn

trapped_methods =
  java:
    lang:
      ref:
        Reference$ReferenceHandler: [
          o 'run()V', (rs) -> # NOP, because don't do our own GC
        ]
      System: [
        o 'loadLibrary(L!/!/String;)V', (rs) -> # NOP, because we don't support loading external libraries
        o 'adjustPropertiesForBackwardCompatibility(L!/util/Properties;)V', (rs) -> # NOP (apple-java specific)
        o 'getProperty(L!/!/String;)L!/!/String;', get_property
        o 'getProperty(L!/!/String;L!/!/String;)L!/!/String;', get_property
      ]
      Terminator: [
        o 'setup()V', (rs) -> # NOP, because we don't support threads
      ]
      Throwable: [
        o 'fillInStackTrace()L!/!/!;', (rs, _this) ->
            stack = []
            strace = rs.init_object "[Ljava/lang/StackTraceElement;", stack
            _this.set_field rs, 'stackTrace', strace
            # we don't want to include the stack frames that were created by
            # the construction of this exception
            cstack = rs.meta_stack()._cs.slice(1)
            for sf in cstack when sf.locals[0] isnt _this
              cls = sf.method.class_type
              unless _this.type.toClassString() is 'java/lang/NoClassDefFoundError'
                attrs = rs.class_lookup(cls).attrs
                source_file =
                  _.find(attrs, (attr) -> attr.constructor.name == 'SourceFile')?.name or 'unknown'
              else
                source_file = 'unknown'
              line_nums = sf.method.code?.attrs[0]?.entries
              if line_nums?
                ln = _.last(row.line_number for i,row of line_nums when row.start_pc <= sf.pc)
              else
                ln = -1
              stack.push rs.init_object "java/lang/StackTraceElement", {
                declaringClass: rs.init_string util.ext_classname cls.toClassString()
                methodName: rs.init_string sf.method.name
                fileName: rs.init_string source_file
                lineNumber: ln
              }
            stack.reverse()
            _this
      ]
    util:
      concurrent:
        atomic:
          AtomicInteger: [
            o '<clinit>()V', (rs) -> #NOP
            o 'compareAndSet(II)Z', (rs, _this, expect, update) ->
                _this.set_field rs, 'value', update  # we don't need to compare, just set
                true # always true, because we only have one thread
          ]
      Currency: [
        o 'getInstance(Ljava/lang/String;)Ljava/util/Currency;', (rs) -> null # because it uses lots of reflection and we don't need it
      ]
    nio:
      Bits: [
        o 'byteOrder()L!/!/ByteOrder;', (rs) -> rs.static_get {class:'java/nio/ByteOrder',name:'LITTLE_ENDIAN'}
      ]
      charset:
        Charset$3: [
          # this is trapped and NOP'ed for speed
          o 'run()L!/lang/Object;', (rs) -> null
        ]

doPrivileged = (rs) ->
  action = rs.curr_frame().locals[0]
  m = rs.method_lookup(class: action.type.toClassString(), sig: 'run()Ljava/lang/Object;')
  rs.push action unless m.access_flags.static
  m.run(rs,m.access_flags.virtual)
  rs.pop()

stat_file = (fname) ->
  try
    if util.is_string(fname) then fs.statSync(fname) else fs.fstatSync(fname)
  catch e
    null

# "Fast" array copy; does not have to check every element for illegal
# assignments. You can do tricks here (if possible) to copy chunks of the array
# at a time rather than element-by-element.
# This function *cannot* access any attribute other than 'array' on src due to
# the special case when src == dest (see code for System.arraycopy below).
arraycopy_no_check = (src, src_pos, dest, dest_pos, length) ->
  j = dest_pos
  for i in [src_pos...src_pos+length] by 1
    dest.array[j++] = src.array[i]
  # CoffeeScript, we are not returning an array.
  return

# "Slow" array copy; has to check every element for illegal assignments.
# You cannot do any tricks here; you must copy element by element until you
# have either copied everything, or encountered an element that cannot be
# assigned (which causes an exception).
# Guarantees: src and dest are two different reference types. They cannot be
#             primitive arrays.
arraycopy_check = (rs, src, src_pos, dest, dest_pos, length) ->
  j = dest_pos
  for i in [src_pos...src_pos+length] by 1
    # Check if null or castable.
    if src.array[i] == null or types.is_castable rs, src.array[i].type, dest.type.component_type
      dest.array[j] = src.array[i]
    else
      exceptions.java_throw rs, 'java/lang/ArrayStoreException', 'Array element in src cannot be cast to dest array type.'
    j++
  # CoffeeScript, we are not returning an array.
  return

native_methods =
  java:
    lang:
      Class: [
        o 'getPrimitiveClass(L!/!/String;)L!/!/!;', (rs, jvm_str) ->
            rs.class_lookup(new types.PrimitiveType(jvm_str.jvm2js_str()), true)
        o 'getClassLoader0()L!/!/ClassLoader;', (rs) -> null  # we don't need no stinkin classloaders
        o 'desiredAssertionStatus0(L!/!/!;)Z', (rs) -> false # we don't need no stinkin asserts
        o 'getName0()L!/!/String;', (rs, _this) ->
            rs.init_string(_this.$type.toExternalString())
        o 'forName0(L!/!/String;ZL!/!/ClassLoader;)L!/!/!;', (rs, jvm_str) ->
            type = c2t util.int_classname jvm_str.jvm2js_str()
            rs.class_lookup type, true
        o 'getComponentType()L!/!/!;', (rs, _this) ->
            type = _this.$type
            return null unless (type instanceof types.ArrayType)
            rs.class_lookup type.component_type, true
        o 'isAssignableFrom(L!/!/!;)Z', (rs, _this, cls) ->
            types.is_castable rs, cls.$type, _this.$type
        o 'isInterface()Z', (rs, _this) ->
            return false unless _this.$type instanceof types.ClassType
            cls = rs.class_lookup _this.$type
            cls.access_flags.interface
        o 'isInstance(L!/!/Object;)Z', (rs, _this, obj) ->
            return types.is_castable rs, obj.type, _this.$type
        o 'isPrimitive()Z', (rs, _this) ->
            _this.$type instanceof types.PrimitiveType
        o 'isArray()Z', (rs, _this) ->
            _this.$type instanceof types.ArrayType
        o 'getSuperclass()L!/!/!;', (rs, _this) ->
            type = _this.$type
            if (type instanceof types.PrimitiveType) or type == 'Ljava/lang/Object;'
              return null
            cls = rs.class_lookup type
            if cls.access_flags.interface or not cls.super_class?
              return null
            rs.class_lookup cls.super_class, true
        o 'getDeclaredFields0(Z)[Ljava/lang/reflect/Field;', (rs, _this, public_only) ->
            fields = rs.class_lookup(_this.$type).fields
            fields = (f for f in fields when f.access_flags.public) if public_only
            rs.init_object('[Ljava/lang/reflect/Field;',(f.reflector(rs) for f in fields))
        o 'getDeclaredMethods0(Z)[Ljava/lang/reflect/Method;', (rs, _this, public_only) ->
            methods = rs.class_lookup(_this.$type).methods
            methods = (m for sig, m of methods when m.access_flags.public or not public_only)
            rs.init_object('[Ljava/lang/reflect/Method;',(m.reflector(rs) for m in methods))
        o 'getDeclaredConstructors0(Z)[Ljava/lang/reflect/Constructor;', (rs, _this, public_only) ->
            methods = rs.class_lookup(_this.$type).methods
            methods = (m for sig, m of methods when m.name is '<init>')
            methods = (m for m in methods when m.access_flags.public) if public_only
            rs.init_object('[Ljava/lang/reflect/Constructor;',(m.reflector(rs,true) for m in methods))
        o 'getInterfaces()[L!/!/!;', (rs, _this) ->
            cls = rs.class_lookup(_this.$type)
            ifaces = (cls.constant_pool.get(i).deref() for i in cls.interfaces)
            ifaces = ((if util.is_string(i) then c2t(i) else i) for i in ifaces)
            iface_objs = (rs.class_lookup(iface,true) for iface in ifaces)
            rs.init_object('[Ljava/lang/Class;',iface_objs)
        o 'getModifiers()I', (rs, _this) -> rs.class_lookup(_this.$type).access_byte
        o 'getRawAnnotations()[B', (rs, _this) ->
            for sig,m of rs.class_lookup(_this.$type).methods
              annotations = _.find(m.attrs, (a) -> a.constructor.name == 'RuntimeVisibleAnnotations')
              return new JavaArray c2t('[B'), rs, annotations.raw_bytes if annotations?
            null
        o 'getConstantPool()Lsun/reflect/ConstantPool;', (rs, _this) ->
            cls = rs.class_lookup(_this.$type)
            rs.init_object 'sun/reflect/ConstantPool', {constantPoolOop: cls.constant_pool}
        o 'getEnclosingMethod0()[L!/!/Object;', (rs, _this) ->
            return null unless _this.$type instanceof types.ClassType
            cls = rs.class_lookup(_this.$type)
            em = _.find(cls.attrs, (a) -> a.constructor.name == 'EnclosingMethod')
            return null unless em?
            java_throw rs, 'java/lang/Error', "native method not finished: java.lang.Class.getEnclosingClass"
            #TODO: return array w/ 3 elements:
            # - the immediately enclosing class (java/lang/Class)
            # - the immediately enclosing method or constructor's name (can be null). (String)
            # - the immediately enclosing method or constructor's descriptor (null iff name is). (String)
            #new JavaArray c2t('[Ljava/lang/Object;'), rs, [null,null,null]
        o 'getDeclaringClass()L!/!/!;', (rs, _this) ->
            return null unless _this.$type instanceof types.ClassType
            cls = rs.class_lookup(_this.$type)
            icls = _.find(cls.attrs, (a) -> a.constructor.name == 'InnerClasses')
            ref = icls?.classes[0].outer_info_index
            return null unless ref? and ref > 0
            rs.class_lookup c2t(cls.constant_pool.get(ref).deref()), true
        o 'getDeclaredClasses0()[L!/!/!;', (rs, _this) ->
            ret = new JavaArray c2t('[Ljava/lang/Class;'), rs, []
            return ret unless _this.$type instanceof types.ClassType
            cls = rs.class_lookup(_this.$type)
            my_class = _this.$type.toClassString()
            iclses = (a for a in cls.attrs when a.constructor.name is 'InnerClasses')
            for icls in iclses
              for c in icls.classes
                continue unless c.inner_info_index > 0 and c.outer_info_index > 0
                flags = util.parse_flags c.inner_access_flags
                continue unless flags.public
                name = cls.constant_pool.get(c.inner_info_index).deref()
                continue unless name.indexOf(my_class) == 0
                ret.array.push rs.class_lookup c2t(name), true
            ret
      ],
      ClassLoader: [
        o 'findLoadedClass0(L!/!/String;)L!/!/Class;', (rs, _this, name) ->
            type = c2t util.int_classname name.jvm2js_str()
            rv = null
            try
              rv = rs.class_lookup type, true
            catch e
              unless e instanceof exceptions.JavaException # assuming a NoClassDefFoundError
                throw e
            rv
        o 'findBootstrapClass(L!/!/String;)L!/!/Class;', (rs, _this, name) ->
            type = c2t util.int_classname name.jvm2js_str()
            rs.dyn_class_lookup type, true
        o 'getCaller(I)L!/!/Class;', (rs, i) ->
            type = rs.meta_stack().get_caller(i).method.class_type
            rs.class_lookup(type, true)

      ],
      Compiler: [
        o 'disable()V', (rs, _this) -> #NOP
        o 'enable()V', (rs, _this) -> #NOP
      ]
      Float: [
        o 'floatToRawIntBits(F)I', (rs, f_val) ->
            f_view = new Float32Array [f_val]
            i_view = new Int32Array f_view.buffer
            i_view[0]
      ]
      Double: [
        o 'doubleToRawLongBits(D)J', (rs, d_val) ->
            d_view = new Float64Array [d_val]
            i_view = new Uint32Array d_view.buffer
            gLong.fromBits i_view[0], i_view[1]
        o 'longBitsToDouble(J)D', (rs, l_val) ->
            i_view = new Uint32Array 2
            i_view[0] = l_val.getLowBitsUnsigned()
            i_view[1] = l_val.getHighBits()
            d_view = new Float64Array i_view.buffer
            d_view[0]
      ]
      Object: [
        o 'getClass()L!/!/Class;', (rs, _this) ->
            rs.class_lookup _this.type, true
        o 'hashCode()I', (rs, _this) ->
            # return the pseudo heap reference, essentially a unique id
            _this.ref
        o 'clone()L!/!/!;', (rs, _this) -> _this.clone(rs)
        o 'notify()V', (rs, _this) ->
            return unless rs.lock_refs[_this]?  # if it's not an active monitor, no one cares
            unless rs.lock_refs[_this] is rs.curr_thread
              owner = thread_name rs, rs.lock_refs[_this]
              exceptions.java_throw rs, 'java/lang/IllegalMonitorStateException', "Thread '#{owner}' owns this monitor"
            if rs.waiting_threads[_this]? and (t = rs.waiting_threads[_this].shift())?
              rs.wait _this, t  # wait on _this, yield to t
        o 'notifyAll()V', (rs, _this) ->  # exactly the same as notify(), for now
            return unless rs.lock_refs[_this]?  # if it's not an active monitor, no one cares
            unless rs.lock_refs[_this] is rs.curr_thread
              owner = thread_name rs, rs.lock_refs[_this]
              exceptions.java_throw rs, 'java/lang/IllegalMonitorStateException', "Thread '#{owner}' owns this monitor"
            if rs.waiting_threads[_this]? and (t = rs.waiting_threads[_this].shift())?
              rs.wait _this, t  # wait on _this, yield to t
        o 'wait(J)V', (rs, _this, timeout) ->
            unless timeout is gLong.ZERO
              error "TODO(Object::wait): respect the timeout param (#{timeout})"
            rs.wait _this
      ]
      reflect:
        Array: [
          o 'newArray(L!/!/Class;I)L!/!/Object;', (rs, _this, len) ->
              rs.heap_newarray _this.$type, len
        ]
        Proxy: [
          o 'defineClass0(L!/!/ClassLoader;L!/!/String;[BII)L!/!/Class;', (rs,cl,name,bytes,offset,len) ->
              raw_bytes = ((256+b)%256 for b in bytes.array[offset...offset+len])  # convert to unsigned bytes
              rs.proxy_class name.jvm2js_str(), raw_bytes
        ]
      Runtime: [
        o 'availableProcessors()I', () -> 1
        o 'gc()V', (rs) ->
            # No universal way of forcing browser to GC, so we yield in hopes
            # that the browser will use it as an opportunity to GC.
            rs.curr_frame().resume = -> # NOP
            throw new exceptions.YieldIOException (cb) -> setTimeout(cb, 0)
      ]
      Shutdown: [
        o 'halt0(I)V', (rs) -> throw new exceptions.HaltException(rs.curr_frame().locals[0])
      ]
      StrictMath: [
        o 'acos(D)D', (rs, d_val) -> Math.acos(d_val)
        o 'asin(D)D', (rs, d_val) -> Math.asin(d_val)
        o 'atan(D)D', (rs, d_val) -> Math.atan(d_val)
        o 'atan2(DD)D', (rs, y, x) -> Math.atan2(y, x)
        o 'cos(D)D', (rs, d_val) -> Math.cos(d_val)
        o 'exp(D)D', (rs, d_val) -> Math.exp(d_val)
        o 'log(D)D', (rs, d_val) -> Math.log(d_val)
        o 'pow(DD)D', (rs) -> Math.pow(rs.cl(0),rs.cl(2))
        o 'sin(D)D', (rs, d_val) -> Math.sin(d_val)
        o 'sqrt(D)D', (rs, d_val) -> Math.sqrt(d_val)
        o 'tan(D)D', (rs, d_val) -> Math.tan(d_val)
      ]
      String: [
        o 'intern()L!/!/!;', (rs, _this) ->
            js_str = _this.jvm2js_str()
            unless rs.string_pool[js_str]
              rs.string_pool[js_str] = _this
            rs.string_pool[js_str]
      ]
      System: [
        o 'arraycopy(L!/!/Object;IL!/!/Object;II)V', (rs, src, src_pos, dest, dest_pos, length) ->
            # Needs to be checked *even if length is 0*.
            if !src? or !dest?
              exceptions.java_throw rs, 'java/lang/NullPointerException', 'Cannot copy to/from a null array.'
            # Can't do this on non-array types. Need to check before I check bounds below, or else I'll get an exception.
            if !(src.type instanceof types.ArrayType) or !(dest.type instanceof types.ArrayType)
              exceptions.java_throw rs, 'java/lang/ArrayStoreException', 'src and dest arguments must be of array type.'
            # Also needs to be checked *even if length is 0*.
            if src_pos < 0 or (src_pos+length) > src.array.length or dest_pos < 0 or (dest_pos+length) > dest.array.length or length < 0
              # System.arraycopy requires IndexOutOfBoundsException, but Java throws an array variant of the exception in practice.
              exceptions.java_throw rs, 'java/lang/ArrayIndexOutOfBoundsException', 'Tried to write to an illegal index in an array.'
            # Special case; need to copy the section of src that is being copied into a temporary array before actually doing the copy.
            if src == dest
              src = {type: src.type, array: src.array.slice(src_pos, src_pos+length)}
              src_pos = 0

            if types.is_castable rs, src.type, dest.type
              # Fast path
              arraycopy_no_check(src, src_pos, dest, dest_pos, length)
            else
              # Slow path
              # Absolutely cannot do this when two different primitive types, or a primitive type and a reference type.
              if (src.type.component_type instanceof types.PrimitiveType) or (dest.type.component_type instanceof types.PrimitiveType)
                exceptions.java_throw rs, 'java/lang/ArrayStoreException', 'If calling arraycopy with a primitive array, both src and dest must be of the same primitive type.'
              else
                # Must be two reference types.
                arraycopy_check(rs, src, src_pos, dest, dest_pos, length)
        o 'currentTimeMillis()J', (rs) -> gLong.fromNumber((new Date).getTime())
        o 'identityHashCode(L!/!/Object;)I', (x) -> x.ref
        o 'initProperties(L!/util/Properties;)L!/util/Properties;', (rs, props) -> rs.push null # return value should not be used
        o 'nanoTime()J', (rs) ->
            # we don't actually have nanosecond precision
            gLong.fromNumber((new Date).getTime()).multiply(gLong.fromNumber(1000000))
        o 'setIn0(L!/io/InputStream;)V', (rs, stream) ->
            rs.push stream
            rs.static_put {class:'java/lang/System', name:'in'}
        o 'setOut0(L!/io/PrintStream;)V', (rs, stream) ->
            rs.push stream
            rs.static_put {class:'java/lang/System', name:'out'}
        o 'setErr0(L!/io/PrintStream;)V', (rs, stream) ->
            rs.push stream
            rs.static_put {class:'java/lang/System', name:'err'}
      ]
      Thread: [
        o 'currentThread()L!/!/!;', (rs) -> rs.curr_thread
        o 'setPriority0(I)V', (rs) -> # NOP
        o 'holdsLock(L!/!/Object;)Z', (rs, obj) -> rs.curr_thread is rs.lock_refs[obj]
        o 'isAlive()Z', (rs, _this) -> _this.$isAlive ? false
        o 'isInterrupted(Z)Z', (rs, _this, clear_flag) ->
            tmp = _this.$isInterrupted ? false
            _this.$isInterrupted = false if clear_flag
            tmp
        o 'start0()V', (rs, _this) ->
            # bookkeeping
            _this.$isAlive = true
            _this.$meta_stack = new runtime.CallStack()
            rs.thread_pool.push _this
            spawning_thread = rs.curr_thread
            my_name = thread_name rs, _this
            orig_name = thread_name rs, spawning_thread
            rs.curr_frame().resume = -> # thread cleanup
              debug "TE: deleting #{my_name} after resume"
              _this.$isAlive = false
              rs.thread_pool.splice rs.thread_pool.indexOf(_this), 1
            debug "TE: starting #{my_name} from #{orig_name}"

            # handler for any yields that come from our started thread
            resume_thread = (cb) ->
              debug "TE: thread #{my_name} was paused"
              rs.curr_thread = spawning_thread
              rs.curr_frame().resume = ->
                debug "TE: not cleaning up #{my_name} after resume"
                _this.$isAlive = false
              cb ->
                debug "TE: actually resuming #{thread_name rs, rs.curr_thread}"
                rs.meta_stack().resuming_stack = 1  # the first method called, likely Thread::run()
                try
                  rs.curr_frame().method.run(rs, true)
                catch e
                  throw e unless e instanceof exceptions.YieldException
                  resume_thread e.condition

            # actually start the thread
            throw new exceptions.YieldException (cb) ->
              spawning_thread.$resume = cb
              rs.curr_thread = _this
              # call the thread's run() method.
              rs.push _this
              try
                rs.method_lookup({class: _this.type.toClassString(), sig: 'run()V'}).run(rs)
              catch e
                if e instanceof exceptions.YieldIOException
                  return e.condition ->
                    rs.meta_stack().resuming_stack = 1
                    rs.curr_frame().method.run(rs, true)
                else if e instanceof exceptions.YieldException
                  resume_thread e.condition
                  rs.curr_thread.$isAlive = false
                  rs.thread_pool.splice rs.thread_pool.indexOf(rs.curr_thread), 1
                else
                  return e.toplevel_catch_handler(rs) if e.toplevel_catch_handler?
                  console.log "\nInternal JVM Error!", e.stack
                  rs.show_state()
                  return
              debug "TE: finished running #{thread_name rs, rs.curr_thread}"

              # yield to a paused thread
              yieldee = (y for y in rs.thread_pool when y isnt rs.curr_thread).pop()
              if yieldee?
                rs.curr_thread = yieldee
                debug "TE: about to resume #{thread_name rs, rs.curr_thread}"
                rs.curr_thread.$resume()

        o 'sleep(J)V', (rs, millis) ->
            rs.curr_frame().resume = -> # NOP, return immediately after sleeping
            throw new exceptions.YieldIOException (cb) ->
              setTimeout(cb, millis.toNumber())
        o 'yield()V', (rs, _this) ->
            unless _this is rs.curr_thread
              exceptions.java_throw rs, 'java/lang/Error', "tried to yield non-current thread"
            rs.yield()
      ]
    security:
      AccessController: [
        o 'doPrivileged(L!/!/PrivilegedAction;)L!/lang/Object;', doPrivileged
        o 'doPrivileged(L!/!/PrivilegedAction;L!/!/AccessControlContext;)L!/lang/Object;', doPrivileged
        o 'doPrivileged(L!/!/PrivilegedExceptionAction;)L!/lang/Object;', doPrivileged
        o 'doPrivileged(L!/!/PrivilegedExceptionAction;L!/!/AccessControlContext;)L!/lang/Object;', doPrivileged
        o 'getStackAccessControlContext()Ljava/security/AccessControlContext;', (rs) -> null
      ]
    io:
      Console: [
        o 'encoding()L!/lang/String;', -> null
        o 'istty()Z', -> true
      ]
      FileSystem: [
        o 'getFileSystem()L!/!/!;', (rs) ->
            # TODO: avoid making a new FS object each time this gets called? seems to happen naturally in java/io/File...
            cache1 = rs.init_object 'java/io/ExpiringCache'
            cache2 = rs.init_object 'java/io/ExpiringCache'
            cache_init = rs.method_lookup({class: 'java/io/ExpiringCache', sig: '<init>()V'})
            rs.push2 cache1, cache2
            cache_init.run(rs)
            cache_init.run(rs)
            rs.init_object 'java/io/UnixFileSystem', {
              cache: cache1, javaHomePrefixCache: cache2
              slash: system_properties['file.separator'].charCodeAt(0)
              colon: system_properties['path.separator'].charCodeAt(0)
              javaHome: rs.init_string(system_properties['java.home'], true)
            }
      ]
      FileOutputStream: [
        o 'open(L!/lang/String;)V', (rs, _this, fname) ->
            _this.$file = fs.openSync fname.jvm2js_str(), 'w'
        o 'writeBytes([BIIZ)V', (rs, _this, bytes, offset, len, append) ->
            if _this.$file?
              # appends by default in the browser, not sure in actual node.js impl
              fs.writeSync(_this.$file, new Buffer(bytes.array), offset, len)
              return
            rs.print util.chars2js_str(bytes, offset, len)
            if node?
              # For the browser implementation -- the DOM doesn't get repainted
              # unless we give the event loop a chance to spin.
              rs.curr_frame().resume = -> # NOP
              throw new exceptions.YieldIOException (cb) -> setTimeout(cb, 0)
        o 'writeBytes([BII)V', (rs, _this, bytes, offset, len) ->
            if _this.$file?
              fs.writeSync(_this.$file, new Buffer(bytes.array), offset, len)
              return
            rs.print util.chars2js_str(bytes, offset, len)
            if node?
              # For the browser implementation -- the DOM doesn't get repainted
              # unless we give the event loop a chance to spin.
              rs.curr_frame().resume = -> # NOP
              throw new exceptions.YieldIOException (cb) -> setTimeout(cb, 0)
        o 'close0()V', (rs, _this) ->
            return unless _this.$file?
            fs.closeSync(_this.$file)
            _this.$file = null
      ]
      FileInputStream: [
        o 'available()I', (rs, _this) ->
            return 0 if not _this.$file? # no buffering for stdin
            stats = fs.fstatSync _this.$file
            stats.size - _this.$pos
        o 'read()I', (rs, _this) ->
            if (file = _this.$file)?
              # this is a real file that we've already opened
              buf = new Buffer((fs.fstatSync file).size)
              bytes_read = fs.readSync(file, buf, 0, 1, _this.$pos)
              _this.$pos++
              return if bytes_read == 0 then -1 else buf.readUInt8(0)
            # reading from System.in, do it async
            data = null # will be filled in after the yield
            rs.curr_frame().resume = ->
              if data.length == 0 then -1 else data.charCodeAt(0)
            throw new exceptions.YieldIOException (cb) ->
              rs.async_input 1, (byte) ->
                data = byte
                cb()
        o 'readBytes([BII)I', (rs, _this, byte_arr, offset, n_bytes) ->
            if _this.$file?
              # this is a real file that we've already opened
              pos = _this.$pos
              file = _this.$file
              buf = new Buffer n_bytes
              # if at end of file, return -1.
              if pos >= fs.fstatSync(file).size-1
                return -1
              bytes_read = fs.readSync(file, buf, 0, n_bytes, pos)
              # not clear why, but sometimes node doesn't move the file pointer,
              # so we do it here ourselves
              _this.$pos += bytes_read
              byte_arr.array[offset+i] = buf.readUInt8(i) for i in [0...bytes_read] by 1
              return if bytes_read == 0 and n_bytes isnt 0 then -1 else bytes_read
            # reading from System.in, do it async
            result = null # will be filled in after the yield
            rs.curr_frame().resume = -> result
            throw new exceptions.YieldIOException (cb) ->
              rs.async_input n_bytes, (bytes) ->
                byte_arr.array[offset+idx] = b for b, idx in bytes
                result = bytes.length
                cb()
        o 'open(Ljava/lang/String;)V', (rs, _this, filename) ->
            filepath = filename.jvm2js_str()
            try  # TODO: actually look at the mode
              _this.$file = fs.openSync filepath, 'r'
              _this.$pos = 0
            catch e
              if e.code == 'ENOENT'
                exceptions.java_throw rs, 'java/io/FileNotFoundException', "Could not open file #{filepath}"
              else
                throw e
        o 'close0()V', (rs, _this) -> _this.$file = null
        o 'skip(J)J', (rs, _this, n_bytes) ->
            if (file = _this.$file)?
              bytes_left = fs.fstatSync(file).size - _this.$pos
              to_skip = Math.min(n_bytes.toNumber(), bytes_left)
              _this.$pos += to_skip
              return gLong.fromNumber(to_skip)
            # reading from System.in, do it async
            num_skipped = null # will be filled in after the yield
            rs.curr_frame().resume = -> gLong.fromNumber(num_skipped)
            throw new exceptions.YieldIOException (cb) ->
              rs.async_input n_bytes.toNumber(), (bytes) ->
                num_skipped = bytes.length  # we don't care about what the input actually was
                cb()
      ]
      ObjectStreamClass: [
        o 'initNative()V', (rs) ->  # NOP
      ]
      RandomAccessFile: [
        o 'open(Ljava/lang/String;I)V', (rs, _this, filename, mode) ->
            filepath = filename.jvm2js_str()
            try  # TODO: actually look at the mode
              _this.$file = fs.openSync filepath, 'r'
            catch e
              if e.code == 'ENOENT'
                exceptions.java_throw rs, 'java/io/FileNotFoundException', "Could not open file #{filepath}"
              else
                throw e
            _this.$pos = 0
        o 'getFilePointer()J', (rs, _this) -> gLong.fromNumber _this.$file
        o 'length()J', (rs, _this) ->
            stats = stat_file _this.$file
            gLong.fromNumber stats.size
        o 'seek(J)V', (rs, _this, pos) -> _this.$pos = pos
        o 'readBytes([BII)I', (rs, _this, byte_arr, offset, len) ->
            pos = _this.$pos.toNumber()
            file = _this.$file
            # if at end of file, return -1.
            if pos >= fs.fstatSync(file).size-1
              return -1
            buf = new Buffer len
            bytes_read = fs.readSync(file, buf, 0, len, pos)
            byte_arr.array[offset+i] = buf.readUInt8(i) for i in [0...bytes_read] by 1
            _this.$pos = gLong.fromNumber(pos+bytes_read)
            return if bytes_read == 0 and len isnt 0 then -1 else bytes_read
        o 'close0()V', (rs, _this) -> _this.$file = null
      ]
      UnixFileSystem: [
        o 'checkAccess(Ljava/io/File;I)Z', (rs, _this, file, access) ->
            filepath = file.get_field rs, 'path'
            stats = stat_file filepath.jvm2js_str()
            return false unless stats?
            mode = stats.mode & 511
            true  # TODO: actually use the mode, checking if we're the owner or in group
        o 'getBooleanAttributes0(Ljava/io/File;)I', (rs, _this, file) ->
            filepath = file.get_field rs, 'path'
            stats = stat_file filepath.jvm2js_str()
            return 0 unless stats?
            if stats.isFile() then 3 else if stats.isDirectory() then 5 else 1
        o 'getLastModifiedTime(Ljava/io/File;)J', (rs, _this, file) ->
            filepath = file.get_field rs, 'path'
            stats = stat_file filepath.jvm2js_str()
            exceptions.java_throw(rs, 'java/io/FileNotFoundException', "Could not stat file #{filepath.jvm2js_str()}") unless stats?
            gLong.fromNumber (new Date(stats.mtime)).getTime()
        o 'canonicalize0(L!/lang/String;)L!/lang/String;', (rs, _this, jvm_path_str) ->
            js_str = jvm_path_str.jvm2js_str()
            rs.init_string path.resolve(path.normalize(js_str))
        o 'list(Ljava/io/File;)[Ljava/lang/String;', (rs, _this, file) ->
            filepath = file.get_field rs, 'path'
            try
              files = fs.readdirSync(filepath.jvm2js_str())
            catch e
              return null
            rs.init_object('[Ljava/lang/String;',(rs.init_string(f) for f in files))
        o 'getLength(Ljava/io/File;)J', (rs, _this, file) ->
            filepath = file.get_field rs, 'path'
            try
              length = fs.statSync(filepath.jvm2js_str()).size
            catch e
              length = 0
            gLong.fromNumber(length)
      ]
    util:
      concurrent:
        atomic:
          AtomicLong: [
            o 'VMSupportsCS8()Z', -> true
          ]
      jar:
        JarFile: [
          o 'getMetaInfEntryNames()[L!/lang/String;', (rs) -> null  # we don't do verification
        ]
      ResourceBundle: [
        o 'getClassContext()[L!/lang/Class;', (rs) ->
            # XXX should walk up the meta_stack and fill in the array properly
            rs.init_object '[Ljava/lang/Class;', [null,null,null]
      ]
      TimeZone: [
        o 'getSystemTimeZoneID(L!/lang/String;L!/lang/String;)L!/lang/String;', (rs, java_home, country) ->
            rs.init_string 'GMT' # XXX not sure what the local value is
        o 'getSystemGMTOffsetID()L!/lang/String;', (rs) ->
            null # XXX may not be correct
      ]
  sun:
    misc:
      VM: [
        o 'initialize()V', (rs) ->
            vm_cls = rs.class_lookup c2t 'sun/misc/VM'
            # this only applies to Java 7
            return unless vm_cls.major_version >= 51
            # hack! make savedProps refer to the system props
            rs.push rs.static_get {class:'java/lang/System',name:'props'}
            rs.static_put {class:'sun/misc/VM',name:'savedProps'}
      ]
      Unsafe: [
        o 'addressSize()I', (rs, _this) -> 4 # either 4 or 8
        o 'allocateMemory(J)J', (rs, _this, size) -> gLong.ZERO
        o 'freeMemory(J)V', (rs, _this, address) -> # NOP
        o 'putLong(JJ)V', (rs, _this, address, value) -> # NOP
        o 'getByte(J)B', (rs, _this, address) -> 0x08 # shim to force little endianness
        o 'arrayBaseOffset(Ljava/lang/Class;)I', (rs, _this, cls) -> 0
        o 'arrayIndexScale(Ljava/lang/Class;)I', (rs, _this, cls) -> 1
        o 'compareAndSwapObject(Ljava/lang/Object;JLjava/lang/Object;Ljava/lang/Object;)Z', (rs, _this, obj, offset, expected, x) ->
            obj.set_field_from_offset rs, offset, x
            true
        o 'compareAndSwapInt(Ljava/lang/Object;JII)Z', (rs, _this, obj, offset, expected, x) ->
            obj.set_field_from_offset rs, offset, x
            true
        o 'compareAndSwapLong(Ljava/lang/Object;JJJ)Z', (rs, _this, obj, offset, expected, x) ->
            obj.set_field_from_offset rs, offset, x
            true
        o 'ensureClassInitialized(Ljava/lang/Class;)V', (rs,_this,cls) ->
            rs.class_lookup(cls.$type)
        o 'staticFieldOffset(Ljava/lang/reflect/Field;)J', (rs,_this,field) -> gLong.fromNumber(field.get_field rs, 'slot')
        o 'objectFieldOffset(Ljava/lang/reflect/Field;)J', (rs,_this,field) -> gLong.fromNumber(field.get_field rs, 'slot')
        o 'staticFieldBase(Ljava/lang/reflect/Field;)Ljava/lang/Object;', (rs,_this,field) ->
            cls = field.get_field rs, 'clazz'
            rs.set_obj cls.$type
        o 'getObjectVolatile(Ljava/lang/Object;J)Ljava/lang/Object;', (rs,_this,obj,offset) ->
            obj.get_field_from_offset rs, offset
        o 'getObject(Ljava/lang/Object;J)Ljava/lang/Object;', (rs,_this,obj,offset) ->
            obj.get_field_from_offset rs, offset
        o 'putOrderedObject(Ljava/lang/Object;JLjava/lang/Object;)V', (rs,_this,obj,offset,new_obj) ->
            obj.set_field_from_offset rs, offset, new_obj
      ]
    reflect:
      ConstantPool: [
        o 'getUTF8At0(Ljava/lang/Object;I)Ljava/lang/String;', (rs, _this, cp, idx) ->
            rs.init_string cp.get(idx).value
      ]
      NativeMethodAccessorImpl: [
        o 'invoke0(Ljava/lang/reflect/Method;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;', (rs,m,obj,params) ->
            cls = m.get_field rs, 'clazz'
            slot = m.get_field rs, 'slot'
            method = (method for sig, method of rs.class_lookup(cls.$type).methods when method.idx is slot)[0]
            rs.push obj unless method.access_flags.static
            rs.push_array params.array
            method.run(rs)
            rs.pop()
      ]
      NativeConstructorAccessorImpl: [
        o 'newInstance0(Ljava/lang/reflect/Constructor;[Ljava/lang/Object;)Ljava/lang/Object;', (rs,m,params) ->
            cls = m.get_field rs, 'clazz'
            slot = m.get_field rs, 'slot'
            method = (method for sig, method of rs.class_lookup(cls.$type).methods when method.idx is slot)[0]
            rs.push (obj = rs.set_obj cls.$type)
            rs.push_array params.array if params?
            method.run(rs)
            obj
      ]
      Reflection: [
        o 'getCallerClass(I)Ljava/lang/Class;', (rs, frames_to_skip) ->
            #TODO: disregard frames assoc. with java.lang.reflect.Method.invoke() and its implementation
            caller = rs.meta_stack().get_caller(frames_to_skip)
            type = caller.method.class_type
            rs.class_lookup(type, true)
        o 'getClassAccessFlags(Ljava/lang/Class;)I', (rs, _this) ->
            rs.class_lookup(_this.$type).access_byte
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
          fn_name = fn_name.replace /!|;/g, do ->
            depth = 0
            (c) ->
              if c == '!' then pkg_name_arr[depth++]
              else if c == ';' then depth = 0; c
              else c
          full_name = "#{pkg_name_arr.join '/'}::#{fn_name}"
          result[full_name] = fn
      else
        flattened_inner = rec_flatten inner_pkg
      pkg_name_arr.pop pkg_name
  rec_flatten pkg
  result

root.trapped_methods = flatten_pkg trapped_methods
root.native_methods = flatten_pkg native_methods
