
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
gLong ?= require '../third_party/gLong.js'
util ?= require './util'
opcodes ?= require './opcodes'
make_attributes ?= require './attributes'
disassembler ?= require './disassembler'
types ?= require './types'
path = node.path ? require 'path'
fs = node.fs ? require 'fs'
{log,debug,error} = util
{opcode_annotators} = disassembler
{str2type,carr2type,c2t} = types

# things assigned to root will be available outside this module
root = exports ? this.methods = {}

class AbstractMethodField
  """ Subclasses need to implement parse_descriptor(String) """
  constructor: (@class_name) ->

  parse: (bytes_array,constant_pool) ->
    @access_byte = util.read_uint(bytes_array.splice(0,2))
    @access_flags = util.parse_flags @access_byte
    @name = constant_pool.get(util.read_uint(bytes_array.splice(0,2))).value
    @raw_descriptor = constant_pool.get(util.read_uint(bytes_array.splice(0,2))).value
    @parse_descriptor @raw_descriptor
    [@attrs,bytes_array] = make_attributes(bytes_array,constant_pool)
    return bytes_array

class root.Field extends AbstractMethodField
  parse_descriptor: (@raw_descriptor) ->
    @type = str2type raw_descriptor
    if @access_flags.static
      @static_value = null  # loaded in when getstatic is called

  reflector: (rs) ->
    rs.set_obj 'java/lang/reflect/Field', {  
      # XXX this leaves out 'slot' and 'annotations'
      clazz: rs.init_class_object c2t @class_name
      name: rs.init_string @name, true
      type: rs.init_class_object @type
      modifiers: @access_byte
      slot: parseInt((i for i,v of rs.class_lookup(@class_name).fields when v is @)[0])
      signature: rs.init_string @raw_descriptor
    }

getBundle = (rs, base_name) ->
  # load in the default ResourceBundle (ignores locale)
  classname = util.int_classname rs.jvm2js_str(base_name)
  rs.push (b_ref = rs.init_object classname)
  rs.method_lookup({class: classname, sig: {name:'<init>',type:'()V'}}).run(rs)
  b_ref

# convenience function. idea taken from coffeescript's grammar
o = (fn_name, fn) -> fn_name: fn_name, fn: fn

trapped_methods =
  javax:
    swing:
      JFrame: [
        o '<init>()V', ->
      ]
  java:
    awt:
      Component: [
        o '<clinit>()V', ->
        o 'setBoundsOp(I)V', (rs, _this, op) -> _this.fields.boundsOp = op
        o 'getBoundsOp()I', (rs, _this) -> _this.fields.boundsOp
        o 'reshape(IIII)V', -> # TODO
      ]
      Container: [
        o '<clinit>()V', ->
      ]
      Frame: [
        o '<clinit>()V', ->
      ]
      Window: [
        o '<clinit>()V', ->
        o 'show()V', (rs, _this) ->
            # XXX fails: _this does not even seem to be a Window
            rs.push _this, 200
            rs.method_lookup({class:'java/awt/Window',sig:{name:'postWindowEvent',type:'(I)V'}}).run(rs)
            console.log 'showing window!'
      ]
    lang:
      ref:
        SoftReference: [
          o 'get()Ljava/lang/Object;', (rs) -> null
        ]
      Class: [
        o 'newInstance0()L!/!/Object;', (rs, _this) -> #implemented here to avoid reflection
            classname = _this.fields.$type.toClassString()
            rs.push (oref = rs.init_object(classname))
            rs.method_lookup({'class':classname,'sig':{'name':'<init>'}}).run(rs)
            oref
      ]
      Object: [
        o '<clinit>()V', (rs) -> # NOP, for efficiency reasons
      ]
      System: [
        o 'setJavaLangAccess()V', (rs) -> # NOP
        o 'loadLibrary(L!/!/String;)V', (rs, jvm_str) ->
            lib = rs.jvm2js_str jvm_str
            error "Attempt to load library '#{lib}' failed: library loads are NYI"
        o 'adjustPropertiesForBackwardCompatibility(L!/util/Properties;)V', (rs) -> #NOP (apple-java specific?)
      ]
      Terminator: [
        o 'setup()V', (rs) -> #NOP
      ]
      Throwable: [
        o 'printStackTrace(L!/io/PrintWriter;)V', (rs) -> # NOP, since we didn't fill in anything
      ]
      StringCoding: [
        o 'deref(L!/!/ThreadLocal;)L!/!/Object;', (rs) -> null
        o 'set(L!/!/ThreadLocal;L!/!/Object;)V', (rs) -> # NOP
      ]
    util:
      concurrent:
        atomic:
          AtomicInteger: [
            o '<clinit>()V', (rs) -> #NOP
            o 'compareAndSet(II)Z', (rs, _this, expect, update) ->
                _this.fields.value = update;  # we don't need to compare, just set
                true # always true, because we only have one thread
          ]
          AtomicReferenceFieldUpdater: [
            o 'newUpdater(L!/lang/Class;L!/lang/Class;L!/lang/String;)L!/!/!/!/!;', (rs) -> null
          ]
        locks:
          AbstractQueuedSynchronizer: [
            o '<clinit>()V', (rs) -> #NOP
            o 'compareAndSetState(II)Z', (rs) -> true
            o 'release(I)Z', (rs) -> true
          ]
      Currency: [
        o 'getInstance(Ljava/lang/String;)Ljava/util/Currency;', (rs) -> null # because it uses lots of reflection and we don't need it
      ]
      ResourceBundle: [
        o 'getBundle(L!/lang/String;L!/!/Locale;L!/!/ResourceBundle$Control;)L!/!/!;', getBundle
        o 'getBundle(L!/lang/String;)L!/!/!;', getBundle
        o 'getLoader()L!/lang/ClassLoader;', (rs) -> rs.set_obj 'java/lang/ClassLoader', {} # mock
      ]
      EnumSet: [
        o 'getUniverse(L!/lang/Class;)[L!/lang/Enum;', (rs) ->
            rs.push rs.curr_frame().locals[0]
            rs.method_lookup({class: 'java/lang/Class', sig: {name:'getEnumConstants',type:'()[Ljava/lang/Object;'}}).run(rs)
            rs.pop()
      ]
    nio:
      charset:
        Charset$3: [
          o 'run()L!/lang/Object;', (rs) -> null
        ]
      Bits: [
        o 'byteOrder()L!/!/ByteOrder;', (rs) -> rs.static_get {'class':'java/nio/ByteOrder','sig':{'name':'LITTLE_ENDIAN'}}
      ]
    io:
      PrintStream: [
        o 'write(L!/lang/String;)V', (rs, _this, jvm_str) ->
            str = rs.jvm2js_str(jvm_str)
            sysout = rs.static_get {'class':'java/lang/System','sig':{'name':'out'}}
            syserr = rs.static_get {'class':'java/lang/System','sig':{'name':'err'}}
            if _this.ref is sysout
              rs.print str
            else if _this.ref is syserr
              rs.print str
            else
              throw "You tried to write to a PrintStream that wasn't System.out or System.err! For shame!"
            # For the browser implementation -- the DOM doesn't get repainted
            # unless we give the event loop a chance to spin.
            rs.curr_frame().resume = -> # NOP
            throw new util.YieldException (cb) -> setTimeout(cb, 0)
      ]
  sun:
    misc:
      FloatingDecimal: [
        o '<clinit>()V', (rs) -> #NOP
        o '<init>(F)V', (rs, _this, f) ->
            _this.fields.$value = f
            _this.fields.$precision = 8
        o '<init>(D)V', (rs, _this, d) ->
            _this.fields.$value = d
            _this.fields.$precision = 17
        o 'toString()Ljava/lang/String;', (rs, _this) ->
            val = _this.fields.$value
            precision = _this.fields.$precision
            rs.init_string util.decimal_to_string(val, precision)
        o 'toJavaFormatString()Ljava/lang/String;', (rs, _this) ->
            val = _this.fields.$value
            precision = _this.fields.$precision
            rs.init_string util.decimal_to_string(val, precision)
        o 'appendTo(Ljava/lang/Appendable;)V', (rs, _this, buf) ->
            val = _this.fields.$value
            precision = _this.fields.$precision
            rs.push buf.ref
            rs.push rs.init_string util.decimal_to_string(val, precision)
            cls = if rs.check_cast(buf.ref,'java/lang/StringBuilder') then 'java/lang/StringBuilder' else 'java/lang/StringBuffer'
            rs.method_lookup({class:cls,sig:{name:'append',type:"(Ljava/lang/String;)L#{cls};"}}).run(rs,true)
      ]
    util:
      LocaleServiceProviderPool: [
        o 'getPool(Ljava/lang/Class;)L!/!/!;', (rs) -> 
            # make a mock
            rs.init_object 'sun/util/LocaleServiceProviderPool'
        o 'hasProviders()Z', (rs) -> false  # we can't provide anything
      ]
  
doPrivileged = (rs) ->
  oref = rs.curr_frame().locals[0]
  action = rs.get_obj(oref)
  m = rs.method_lookup({'class': action.type, 'sig': {'name': 'run','type':'()Ljava/lang/Object;'}})
  rs.push oref unless m.access_flags.static
  m.run(rs,m.access_flags.virtual)
  rs.pop()

# properties to set:
#  java.version,java.vendor.url,java.class.version,java.class.path,os.name,os.arch,os.version
system_properties = {
  'java.home':'/', 'file.encoding':'US_ASCII','java.vendor':'DoppioVM',
  'line.separator':'\n', 'file.separator':'/', 'path.separator':':',
  'user.dir':'.','user.home':'.','user.name':'DoppioUser',
  # this one must point to a valid rt.jar file
  'sun.boot.class.path': '/Developer/Applications/Utilities/Application Loader.app/Contents/MacOS/itms/java/lib/rt.jar'
}

get_field_from_offset = (rs, cls, offset) ->
  until cls.fields[offset]?
    throw "field #{offset} doesn't exist in class #{cls.this_class}" unless cls.super_class?
    cls = rs.class_lookup(cls.super_class)
  cls.fields[offset]

stat_file = (fname) ->
  try 
    fs.statSync(fname)
  catch e
    null

native_methods =
  java:
    lang:
      Class: [
        o 'getPrimitiveClass(L!/!/String;)L!/!/!;', (rs, jvm_str) ->
            name = rs.jvm2js_str jvm_str
            rs.init_class_object new types.PrimitiveType name
        o 'getClassLoader0()L!/!/ClassLoader;', (rs) -> null  # we don't need no stinkin classloaders
        o 'desiredAssertionStatus0(L!/!/!;)Z', (rs) -> false # we don't need no stinkin asserts
        o 'getName0()L!/!/String;', (rs, _this) ->
            rs.init_string(_this.fields.$type.toExternalString())
        o 'forName0(L!/!/String;ZL!/!/ClassLoader;)L!/!/!;', (rs, jvm_str) ->
            classname = util.int_classname rs.jvm2js_str(jvm_str)
            throw "Class.forName0: Failed to load #{classname}" unless rs.class_lookup(classname)
            rs.init_class_object c2t util.int_classname classname
        o 'getComponentType()L!/!/!;', (rs, _this) ->
            type = _this.fields.$type
            return null unless (type instanceof types.ArrayType)
            rs.init_class_object type.component_type
        o 'isAssignableFrom(L!/!/!;)Z', (rs, _this, cls) ->
            rs.is_castable cls.fields.$type, _this.fields.$type
        o 'isInterface()Z', (rs, _this) ->
            return false unless _this.fields.$type instanceof types.ClassType
            cls = rs.class_lookup _this.fields.$type.toClassString()
            cls.access_flags.interface
        o 'isPrimitive()Z', (rs, _this) ->
            _this.fields.$type instanceof types.PrimitiveType
        o 'isArray()Z', (rs, _this) ->
            _this.fields.$type instanceof types.ArrayType
        o 'getSuperclass()L!/!/!;', (rs, _this) ->
            type = _this.fields.$type
            if (type instanceof types.PrimitiveType) or
               (type instanceof types.VoidType) or type == 'Ljava/lang/Object;'
              return null
            cls = rs.class_lookup type.toClassString()
            if cls.access_flags.interface
              return null
            rs.init_class_object c2t cls.super_class
        o 'getDeclaredFields0(Z)[Ljava/lang/reflect/Field;', (rs, _this, public_only) ->
            fields = rs.class_lookup(_this.fields.$type.toClassString()).fields
            fields = (f for f in fields when f.access_flags.public) if public_only
            rs.class_lookup 'java/lang/reflect/Field'
            rs.set_obj('[Ljava/lang/reflect/Field;',(f.reflector(rs) for f in fields))
        o 'getDeclaredMethods0(Z)[Ljava/lang/reflect/Method;', (rs, _this, public_only) ->
            methods = rs.class_lookup(_this.fields.$type.toClassString()).methods
            methods = (m for m in methods when m.access_flags.public) if public_only
            rs.class_lookup 'java/lang/reflect/Method'
            rs.set_obj('[Ljava/lang/reflect/Method;',(m.reflector(rs) for m in methods))
        o 'getModifiers()I', (rs, _this) -> rs.class_lookup(_this.fields.$type.toClassString()).access_byte
      ],
      ClassLoader: [
        o 'findLoadedClass0(L!/!/String;)L!/!/Class;', (rs, _this, name) ->
            rs.class_objects[util.int_classname rs.jvm2js_str name]
        o 'findBootstrapClass(L!/!/String;)L!/!/Class;', (rs, _this, name) ->
            cls = util.int_classname rs.jvm2js_str name
            rs.class_lookup cls
            rs.init_class_object c2t cls
      ],
      Float: [
        o 'floatToRawIntBits(F)I', (rs, f_val) ->  #note: not tested for weird values
            sign = if f_val < 0 then 1 else 0
            f_val = Math.abs(f_val)
            exp = Math.floor(Math.log(f_val)/Math.LN2)
            sig = (f_val/Math.pow(2,exp)-1)/Math.pow(2,-23)
            (sign<<31)+((exp+127)<<23)+sig
      ]
      Double: [
        o 'doubleToRawLongBits(D)J', (rs, d_val) ->#note: not tested at all
            sign = gLong.fromInt(if d_val < 0 then 1 else 0)
            d_val = Math.abs(d_val)
            exp = gLong.fromNumber(Math.floor(Math.log(d_val)/Math.LN2)+1023)
            sig = gLong.fromNumber((d_val/Math.pow(2,exp)-1)/Math.pow(2,-52))
            sign.shiftLeft(63).add(exp.shiftLeft(52)).add(sig)
      ]
      Object: [
        o 'getClass()L!/!/Class;', (rs, _this) ->
            rs.init_class_object c2t _this.type
        o 'hashCode()I', (rs, _this) ->
            # return heap reference. XXX need to change this if we ever implement
            # GC that moves stuff around.
            _this.ref
        o 'clone()L!/!/!;', (rs, _this) ->
            if util.is_array _this.type then rs.set_obj _this.type, _this.array
            else rs.set_obj _this.type, _this.fields
      ]
      reflect:
        Array: [
          o 'newArray(L!/!/Class;I)L!/!/Object;', (rs, _this, len) ->
              rs.heap_newarray _this.fields.$type, len
        ]
      Shutdown: [
        o 'halt0(I)V', (rs) -> throw new util.HaltException(rs.curr_frame().locals[0])
      ]
      StrictMath: [
        o 'pow(DD)D', (rs) -> Math.pow(rs.cl(0),rs.cl(2))
      ]
      String: [
        o 'intern()L!/!/!;', (rs, _this) ->
            js_str = rs.jvm2js_str(_this)
            unless rs.string_pool[js_str]
              rs.string_pool[js_str] = _this.ref
            rs.string_pool[js_str]
      ]
      System: [
        o 'arraycopy(L!/!/Object;IL!/!/Object;II)V', (rs, src, src_pos, dest, dest_pos, length) ->
            j = dest_pos
            for i in [src_pos...src_pos+length]
              dest.array[j++] = src.array[i]
        o 'currentTimeMillis()J', (rs) -> gLong.fromNumber((new Date).getTime())
        o 'identityHashCode(L!/!/Object;)I', (x) -> x.ref
        o 'initProperties(L!/util/Properties;)L!/util/Properties;', (rs, props) ->
            m = rs.method_lookup({'class':'java/util/Properties','sig':{'name':'setProperty'}})
            for k,v of system_properties
              rs.push props.ref, rs.init_string(k,true), rs.init_string(v,true)
              m.run(rs)
              rs.pop()  # we don't care about the return value
            props.ref
        o 'nanoTime()J', (rs) ->
            # we don't actually have nanosecond precision
            gLong.fromNumber((new Date).getTime()).multiply(gLong.fromNumber(1000000))
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
            rs.main_thread
        o 'setPriority0(I)V', (rs) -> # NOP
        o 'holdsLock(L!/!/Object;)Z', -> true
        o 'isAlive()Z', (rs) -> false
        o 'start0()V', (rs) -> # NOP
        o 'sleep(J)V', (rs, millis) ->
            rs.curr_frame().resume = -> # NOP
            throw new util.YieldException (cb) ->
              setTimeout(cb, millis.toNumber())
      ]
      Throwable: [
        o 'fillInStackTrace()L!/!/!;', (rs, _this) ->
            #TODO possibly filter out the java calls from our own call stack.
            # at the moment, this is effectively a NOP.
            _this.ref
      ]
    security:
      AccessController: [
        o 'doPrivileged(L!/!/PrivilegedAction;)L!/lang/Object;', doPrivileged
        o 'doPrivileged(L!/!/PrivilegedExceptionAction;)L!/lang/Object;', doPrivileged
        o 'getStackAccessControlContext()Ljava/security/AccessControlContext;', (rs) -> null
      ]
    io:
      FileSystem: [
        o 'getFileSystem()L!/!/!;', (rs) ->
            # TODO: avoid making a new FS object each time this gets called? seems to happen naturally in java/io/File...
            cache1 = rs.init_object 'java/io/ExpiringCache'
            cache2 = rs.init_object 'java/io/ExpiringCache'
            cache_init = rs.method_lookup({class: 'java/io/ExpiringCache', sig: {name:'<init>',type:'()V'}})
            rs.push cache1, cache2
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
        o 'writeBytes([BII)V', (rs, _this, bytes, offset, len) ->
            rs.print rs.jvm_carr2js_str(bytes.ref, offset, len)
      ]
      FileInputStream: [
        o 'available()I', (rs) -> 0 # we never buffer anything, so this is always zero
        o 'read()I', (rs, _this) ->
            if _this.fields.$file?
              # this is a real file that we've already opened
              data = fs.readSync(_this.fields.$file, 1)[0]
              return if data.length == 0 then -1 else data.charCodeAt(0)
            # reading from System.in, do it async
            console.log '>>> reading from Stdin now!'
            data = null # will be filled in after the yield
            rs.curr_frame().resume = ->
              if data.length == 0 then -1 else data.charCodeAt(0)
            throw new util.YieldException (cb) ->
              rs.async_input 1, (byte) ->
                data = byte
        o 'readBytes([BII)I', (rs, _this, byte_arr, offset, n_bytes) ->
            if _this.fields.$file?
              # this is a real file that we've already opened
              data = fs.readSync(_this.fields.$file, n_bytes)[0]
              byte_arr.array[offset...offset+data.length] = (data.charCodeAt(i) for i in [0...data.length])
              return data.length
            # reading from System.in, do it async
            console.log '>>> reading from Stdin now!'
            result = null # will be filled in after the yield
            rs.curr_frame().resume = -> result
            throw new util.YieldException (cb) ->
              rs.async_input n_bytes, (bytes) ->
                byte_arr.array[offset...offset+bytes.length] = bytes
                result = bytes.length
                cb()
        o 'open(Ljava/lang/String;)V', (rs, _this, filename) -> 
            _this.fields.$file = fs.openSync rs.jvm2js_str(filename), 'r'
        o 'close0()V', (rs, _this) -> _this.fields.$file = null
      ]
      ObjectStreamClass: [
        o 'initNative()V', (rs) ->  # NOP
      ]
      UnixFileSystem: [
        o 'getBooleanAttributes0(Ljava/io/File;)I', (rs, _this, file) ->
            stats = stat_file rs.jvm2js_str rs.get_obj file.fields.path
            return 0 unless stats?
            if stats.isFile() then 3 else if stats.isDirectory() then 5 else 1
        o 'getLastModifiedTime(Ljava/io/File;)J', (rs, _this, file) ->
            stats = stat_file rs.jvm2js_str rs.get_obj file.fields.path
            util.java_throw 'java/io/FileNotFoundException' unless stats?
            gLong.fromNumber (new Date(stats.mtime)).getTime()
        o 'canonicalize0(L!/lang/String;)L!/lang/String;', (rs, _this, jvm_path_str) ->
            js_str = rs.jvm2js_str jvm_path_str
            rs.init_string path.resolve path.normalize js_str
      ]
    util:
      concurrent:
        atomic:
          AtomicLong: [
            o 'VMSupportsCS8()Z', -> true
          ]
      TimeZone: [
        o 'getSystemTimeZoneID(L!/lang/String;L!/lang/String;)L!/lang/String;', (rs, java_home, country) ->
            rs.init_string 'GMT' # XXX not sure what the local value is
        o 'getSystemGMTOffsetID()L!/lang/String;', (rs) ->
            null # XXX may not be correct
      ]
      zip:
        ZipFile: [
          o 'open(Ljava/lang/String;IJZ)J', (rs,fname,mode,mtime,use_mmap) ->
              throw "Zipfile loading is NYI. Tried to open: #{rs.jvm2js_str(fname)}"
        ]
  sun:
    misc:
      VM: [
        o 'initialize()V', (rs) ->  # NOP???
      ]
      Unsafe: [
        o 'compareAndSwapLong(Ljava/lang/Object;JJJ)Z', (rs, _this, obj, offset, expected, x) ->
            field_name = rs.class_lookup(obj.type).fields[offset.toInt()]
            obj.fields[field_name] = x.ref
            true
        o 'ensureClassInitialized(Ljava/lang/Class;)V', (rs,_this,cls) -> 
            rs.class_lookup(cls.fields.$type.toClassString())
        o 'staticFieldOffset(Ljava/lang/reflect/Field;)J', (rs,_this,field) -> gLong.fromNumber(field.fields.slot)
        o 'objectFieldOffset(Ljava/lang/reflect/Field;)J', (rs,_this,field) -> gLong.fromNumber(field.fields.slot)
        o 'staticFieldBase(Ljava/lang/reflect/Field;)Ljava/lang/Object;', (rs,_this,field) ->
            rs.set_obj rs.get_obj(field.fields.clazz).fields.$type.toClassString()
        o 'getObjectVolatile(Ljava/lang/Object;J)Ljava/lang/Object;', (rs,_this,obj,offset) ->
            f = get_field_from_offset rs, rs.class_lookup(obj.type), offset.toInt()
            return f.static_value if f.access_flags.static
            obj.fields[f.name] ? 0
        o 'getObject(Ljava/lang/Object;J)Ljava/lang/Object;', (rs,_this,obj,offset) ->
            f = get_field_from_offset rs, rs.class_lookup(obj.type), offset.toInt()
            return f.static_value if f.access_flags.static
            obj.fields[f.name] ? 0
      ]
    reflect:
      NativeMethodAccessorImpl: [
        o 'invoke0(Ljava/lang/reflect/Method;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;', (rs,m,obj,params) ->
            cls = rs.get_obj(m.fields.clazz).fields.$type.toClassString()
            method = rs.class_lookup(cls).methods[m.fields.slot]
            rs.push obj.ref unless method.access_flags.static
            rs.push params.array...
            method.run(rs)
            rs.pop()
      ]
      Reflection: [
        o 'getCallerClass(I)Ljava/lang/Class;', (rs, frames_to_skip) ->
            #TODO: disregard frames assoc. with java.lang.reflect.Method.invoke() and its implementation
            cls = rs.meta_stack[rs.meta_stack.length-1-frames_to_skip].method.class_name
            rs.init_class_object c2t cls
        o 'getClassAccessFlags(Ljava/lang/Class;)I', (rs, _this) ->
            rs.class_lookup(_this.fields.$type.toClassString()).access_byte
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
  
trapped_methods = flatten_pkg trapped_methods
native_methods = flatten_pkg native_methods

class root.Method extends AbstractMethodField
  get_code: -> _.find(@attrs, (a) -> a.constructor.name == "Code")

  parse_descriptor: (@raw_descriptor) ->
    [__,param_str,return_str] = /\(([^)]*)\)(.*)/.exec(@raw_descriptor)
    param_carr = param_str.split ''
    @param_types = (field while (field = carr2type param_carr))
    @num_args = @param_types.length
    @num_args++ unless @access_flags.static # nonstatic methods get 'this'
    @return_type = str2type return_str

  reflector: (rs) ->
    rs.set_obj 'java/lang/reflect/Method', {
      # XXX: missing checkedExceptions, annotations, parameterAnnotations, annotationDefault
      clazz: rs.init_class_object c2t @class_name
      name: rs.init_string @name, true
      parameterTypes: rs.set_obj "[Ljava/lang/Class;", (rs.init_class_object f.type for f in @param_types)
      returnType: rs.init_class_object @return_type
      modifiers: @access_byte
      slot: parseInt((i for i,v of rs.class_lookup(@class_name).methods when v is @)[0])
      signature: rs.init_string @raw_descriptor
    }

  param_bytes: () ->
    type_size = (t) -> (if t.toString() in ['D','J'] then 2 else 1)
    n_bytes = util.sum(type_size(p) for p in @param_types)
    n_bytes++ unless @access_flags.static
    n_bytes

  take_params: (caller_stack) ->
    params = []
    n_bytes = @param_bytes()
    caller_stack.splice(caller_stack.length-n_bytes,n_bytes)
  
  # used by run and run_manually to print arrays for debugging. we need this to
  # distinguish [null] from [].
  pa = (a) -> a.map((e)->if e? then (if e instanceof gLong then "#{e}L" else e) else '!')

  run_manually: (func, rs) ->
    params = rs.curr_frame().locals.slice(0) # make a copy
    # if we have objects, dereference them
    converted_params = []
    if not @access_flags.static
      converted_params.push rs.get_obj params.shift()
    for p, idx in params
      if (@param_types[idx] instanceof types.ClassType) or
         (@param_types[idx] instanceof types.ArrayType)
        converted_params.push(if p == 0 then null else rs.get_obj p)
      else
        converted_params.push p
    rv = func rs, converted_params...
    rs.meta_stack.pop()
    unless @return_type instanceof types.VoidType
      if @return_type.toString() == 'J' then rs.push rv # longs are stored as objects
      else rs.push rv + 0 # cast booleans, etc to a Number
      rs.push null if @return_type.toString() in [ 'J', 'D' ]

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
        else if e instanceof util.YieldException
          debug "yielding from #{@class_name}::#{@name}#{@raw_descriptor}"
          throw e  # leave everything as-is
        else if e instanceof util.JavaException
          exception_handlers = @get_code().exception_handlers
          handler = _.find exception_handlers, (eh) ->
            eh.start_pc <= pc < eh.end_pc and
              (eh.catch_type == "<any>" or rs.is_castable c2t(e.exception.type), c2t(eh.catch_type))
          if handler?
            rs.push e.exception_ref
            rs.goto_pc handler.handler_pc
            continue
          else # abrupt method invocation completion
            rs.meta_stack.pop()
            throw e
        throw e # JVM Error

  run: (runtime_state,virtual=false) ->
    if runtime_state.resuming_stack?
      runtime_state.resuming_stack++
      if virtual
        cf = runtime_state.curr_frame()
        unless cf.method is @
          runtime_state.resuming_stack--
          return cf.method.run(runtime_state)
      if runtime_state.resuming_stack == runtime_state.meta_stack.length - 1
        runtime_state.resuming_stack = null
    else
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
      params = @take_params caller_stack
      runtime_state.meta_stack.push(new runtime.StackFrame(this,params,[]))
    padding = (' ' for [2...runtime_state.meta_stack.length]).join('')
    sig = "#{@class_name}::#{@name}#{@raw_descriptor}"
    debug "#{padding}entering method #{sig}"
    # check for trapped and native methods, run those manually
    cf = runtime_state.curr_frame()
    if cf.resume? # we are resuming from a yield, and this was a manually run method
      @run_manually cf.resume, runtime_state
      cf.resume = null
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
