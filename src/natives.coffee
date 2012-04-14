
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
gLong ?= require '../third_party/gLong.js'
util ?= require './util'
types ?= require './types'
path = node?.path ? require 'path'
fs = node?.fs ? require 'fs'
{log,debug,error} = util
{c2t} = types

# things assigned to root will be available outside this module
root = exports ? this.natives = {}

# convenience function. idea taken from coffeescript's grammar
o = (fn_name, fn) -> fn_name: fn_name, fn: fn

trapped_methods =
  java:
    lang:
      System: [
        o 'loadLibrary(L!/!/String;)V', (rs) -> # NOP, because we don't support loading external libraries
        o 'adjustPropertiesForBackwardCompatibility(L!/util/Properties;)V', (rs) -> # NOP (apple-java specific)
      ]
      Terminator: [
        o 'setup()V', (rs) -> # NOP, because we don't support threads
      ]
      Throwable: [
        o 'fillInStackTrace()L!/!/!;', (rs, _this) ->
            stack = []
            _this.fields.stackTrace = rs.init_object "[Ljava/lang/StackTraceElement;", stack
            # we don't want to include the stack frames that were created by
            # the construction of this exception
            for sf in rs.meta_stack.slice(1) when sf.locals[0] isnt _this.ref
              cls = sf.method.class_type
              unless _this.type.toClassString() is 'java/lang/NoClassDefFoundError'
                attrs = rs.class_lookup(cls).attrs
                source_file =
                  _.find(attrs, (attr) -> attr.constructor.name == 'SourceFile')?.name or 'unknown'
              else
                source_file = 'unknown'
              line_nums = sf.method.get_code()?.attrs[0]
              if line_nums?
                ln = _.last(row.line_number for i,row of line_nums when row.start_pc <= sf.pc)
              else
                ln = -1
              stack.push rs.init_object "java/lang/StackTraceElement", {
                declaringClass: rs.init_string cls.toClassString()
                methodName: rs.init_string sf.method.name
                fileName: rs.init_string source_file
                lineNumber: ln
              }
            stack.reverse()
            _this.ref
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
      Currency: [
        o 'getInstance(Ljava/lang/String;)Ljava/util/Currency;', (rs) -> null # because it uses lots of reflection and we don't need it
      ]
    nio:
      Bits: [
        o 'byteOrder()L!/!/ByteOrder;', (rs) -> rs.static_get {class:'java/nio/ByteOrder',name:'LITTLE_ENDIAN'}
      ]
  
doPrivileged = (rs) ->
  oref = rs.curr_frame().locals[0]
  action = rs.get_obj(oref)
  m = rs.method_lookup(class: action.type.toClassString(), sig: 'run()Ljava/lang/Object;')
  rs.push oref unless m.access_flags.static
  m.run(rs,m.access_flags.virtual)
  rs.pop()

# properties to set:
#  java.version,java.vendor.url,java.class.version,java.class.path,os.name,os.arch,os.version
system_properties = {
  'java.home':'/', 'file.encoding':'US_ASCII','java.vendor':'DoppioVM',
  'line.separator':'\n', 'file.separator':'/', 'path.separator':':',
  'user.dir':'.','user.home':'.','user.name':'DoppioUser',
  # we don't actually load from this file, but it has to look like a valid filename
  'sun.boot.class.path': '/System/Library/Frameworks/JavaVM.framework/Classes/classes.jar',
  # this doesn't actually exist in our classes.jar, but no other GraphicsEnvironment does either
  'java.awt.graphicsenv': 'sun.awt.X11GraphicsEnvironment'
}

get_field_from_offset = (rs, cls, offset) ->
  classname = cls.this_class.toClassString()
  until cls.fields[offset]?
    unless cls.super_class?
      util.java_throw rs, 'java/lang/NullPointerException', "field #{offset} doesn't exist in class #{classname}"
    cls = rs.class_lookup(cls.super_class)
  cls.fields[offset]

get_value_from_offset = (rs, obj, offset) ->
  if obj.type instanceof types.ArrayType
    return obj.array[offset.toInt()]
  f = get_field_from_offset rs, rs.class_lookup(obj.type), offset.toInt()
  return rs.static_get({class:obj.type.toClassString(),name:f.name}) if f.access_flags.static
  obj.fields[f.name] ? 0

set_value_from_offset = (rs, obj, offset, value) ->
  o = offset.toInt()
  if obj.type instanceof types.ArrayType
    obj.array[o] = value
  else
    f = get_field_from_offset rs, rs.class_lookup(obj.type), o
    if f.access_flags.static
      rs.push value
      rs.static_put({class:obj.type.toClassString(),name:f.name})
    else
      obj.fields[f.name] = value

stat_file = (fname) ->
  try
    if util.is_string(fname) then fs.statSync(fname) else fs.fstatSync(fname)
  catch e
    null

native_methods =
  java:
    lang:
      Class: [
        o 'getPrimitiveClass(L!/!/String;)L!/!/!;', (rs, jvm_str) -> 
            rs.class_lookup(new types.PrimitiveType(rs.jvm2js_str(jvm_str)), true)
        o 'getClassLoader0()L!/!/ClassLoader;', (rs) -> null  # we don't need no stinkin classloaders
        o 'desiredAssertionStatus0(L!/!/!;)Z', (rs) -> false # we don't need no stinkin asserts
        o 'getName0()L!/!/String;', (rs, _this) ->
            rs.init_string(_this.fields.$type.toExternalString())
        o 'forName0(L!/!/String;ZL!/!/ClassLoader;)L!/!/!;', (rs, jvm_str) ->
            type = c2t util.int_classname rs.jvm2js_str(jvm_str)
            rs.class_lookup type, true
        o 'getComponentType()L!/!/!;', (rs, _this) ->
            type = _this.fields.$type
            return null unless (type instanceof types.ArrayType)
            rs.class_lookup type.component_type, true
        o 'isAssignableFrom(L!/!/!;)Z', (rs, _this, cls) ->
            types.is_castable rs, cls.fields.$type, _this.fields.$type
        o 'isInterface()Z', (rs, _this) ->
            return false unless _this.fields.$type instanceof types.ClassType
            cls = rs.class_lookup _this.fields.$type
            cls.access_flags.interface
        o 'isInstance(L!/!/Object;)Z', (rs, _this, obj) ->
            return types.is_castable rs, obj.type, _this.fields.$type
        o 'isPrimitive()Z', (rs, _this) ->
            _this.fields.$type instanceof types.PrimitiveType
        o 'isArray()Z', (rs, _this) ->
            _this.fields.$type instanceof types.ArrayType
        o 'getSuperclass()L!/!/!;', (rs, _this) ->
            type = _this.fields.$type
            if (type instanceof types.PrimitiveType) or
               (type instanceof types.VoidType) or type == 'Ljava/lang/Object;'
              return null
            cls = rs.class_lookup type
            if cls.access_flags.interface or not cls.super_class?
              return null
            rs.class_lookup cls.super_class, true
        o 'getDeclaredFields0(Z)[Ljava/lang/reflect/Field;', (rs, _this, public_only) ->
            fields = rs.class_lookup(_this.fields.$type).fields
            fields = (f for f in fields when f.access_flags.public) if public_only
            rs.init_object('[Ljava/lang/reflect/Field;',(f.reflector(rs) for f in fields))
        o 'getDeclaredMethods0(Z)[Ljava/lang/reflect/Method;', (rs, _this, public_only) ->
            methods = rs.class_lookup(_this.fields.$type).methods
            methods = (m for sig, m of methods when m.access_flags.public or not public_only)
            rs.init_object('[Ljava/lang/reflect/Method;',(m.reflector(rs) for m in methods))
        o 'getDeclaredConstructors0(Z)[Ljava/lang/reflect/Constructor;', (rs, _this, public_only) ->
            methods = rs.class_lookup(_this.fields.$type).methods
            methods = (m for sig, m of methods when m.name is '<init>')
            methods = (m for m in methods when m.access_flags.public) if public_only
            rs.init_object('[Ljava/lang/reflect/Constructor;',(m.reflector(rs,true) for m in methods))
        o 'getInterfaces()[L!/!/!;', (rs, _this) ->
            cls = rs.class_lookup(_this.fields.$type)
            ifaces = (cls.constant_pool.get(i).deref() for i in cls.interfaces)
            ifaces = ((if util.is_string(i) then c2t(i) else i) for i in ifaces)
            iface_objs = (rs.class_lookup(iface,true) for iface in ifaces)
            rs.init_object('[Ljava/lang/Class;',iface_objs)
        o 'getModifiers()I', (rs, _this) -> rs.class_lookup(_this.fields.$type).access_byte
      ],
      ClassLoader: [
        o 'findLoadedClass0(L!/!/String;)L!/!/Class;', (rs, _this, name) ->
            type = c2t util.int_classname rs.jvm2js_str name
            rv = null
            try
              rv = rs.class_lookup type, true
            catch e
              unless e instanceof util.JavaException # assuming a NoClassDefFoundError
                throw e
            rv
        o 'findBootstrapClass(L!/!/String;)L!/!/Class;', (rs, _this, name) ->
            type = c2t util.int_classname rs.jvm2js_str name
            rs.dyn_class_lookup type, true
      ],
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
            # return heap reference. XXX need to change this if we ever implement
            # GC that moves stuff around.
            _this.ref
        o 'clone()L!/!/!;', (rs, _this) ->
            if _this.type instanceof types.ArrayType then rs.set_obj _this.type, _this.array
            else rs.set_obj _this.type, _this.fields
        o 'notifyAll()V', -> #NOP
      ]
      reflect:
        Array: [
          o 'newArray(L!/!/Class;I)L!/!/Object;', (rs, _this, len) ->
              rs.heap_newarray _this.fields.$type, len
        ]
      Runtime: [
        o 'availableProcessors()I', () -> 1
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
            for i in [src_pos...src_pos+length] by 1
              dest.array[j++] = src.array[i]
        o 'currentTimeMillis()J', (rs) -> gLong.fromNumber((new Date).getTime())
        o 'identityHashCode(L!/!/Object;)I', (x) -> x.ref
        o 'initProperties(L!/util/Properties;)L!/util/Properties;', (rs, props) ->
            m = rs.method_lookup
              class: 'java/util/Properties'
              sig: 'setProperty(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/Object;'
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
            rs.static_put {class:'java/lang/System', name:'in'}
        o 'setOut0(L!/io/PrintStream;)V', (rs) ->
            rs.push rs.curr_frame().locals[0] # move oref to the stack for static_put
            rs.static_put {class:'java/lang/System', name:'out'}
        o 'setErr0(L!/io/PrintStream;)V', (rs) ->
            rs.push rs.curr_frame().locals[0] # move oref to the stack for static_put
            rs.static_put {class:'java/lang/System', name:'err'}
      ]
      Thread: [
        o 'currentThread()L!/!/!;', (rs) ->  # essentially a singleton for the main thread mock object
            unless rs.main_thread?
              rs.push (g_ref = rs.init_object 'java/lang/ThreadGroup')
              # have to run the private ThreadGroup constructor
              rs.method_lookup({class: 'java/lang/ThreadGroup', sig: '<init>()V'}).run(rs)
              rs.main_thread = rs.init_object 'java/lang/Thread', { priority: 1, group: g_ref, threadLocals: 0 }
              rs.push gLong.ZERO, null  # set up for static_put
              rs.static_put {class:'java/lang/Thread', name:'threadSeqNumber'}
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
        o 'open(L!/lang/String;)V', (rs, _this, fname) ->
            jvm_str = rs.jvm2js_str fname
            _this.fields.$file = fs.openSync jvm_str, 'w'
        o 'writeBytes([BIIZ)V', (rs, _this, bytes, offset, len, append) ->
            if _this.fields.$file?
              # appends by default in the browser, not sure in actual node.js impl
              fs.writeSync(_this.fields.$file, new Buffer(bytes.array), offset, len)
              return
            rs.print rs.jvm_carr2js_str(bytes.ref, offset, len)
            if node?
              # For the browser implementation -- the DOM doesn't get repainted
              # unless we give the event loop a chance to spin.
              rs.curr_frame().resume = -> # NOP
              throw new util.YieldException (cb) -> setTimeout(cb, 0)
        o 'writeBytes([BII)V', (rs, _this, bytes, offset, len) ->
            if _this.fields.$file?
              fs.writeSync(_this.fields.$file, new Buffer(bytes.array), offset, len)
              return
            rs.print rs.jvm_carr2js_str(bytes.ref, offset, len)
            if node?
              # For the browser implementation -- the DOM doesn't get repainted
              # unless we give the event loop a chance to spin.
              rs.curr_frame().resume = -> # NOP
              throw new util.YieldException (cb) -> setTimeout(cb, 0)
        o 'close0()V', (rs, _this) ->
            return unless _this.fields.$file?
            fs.closeSync(_this.fields.$file)
            _this.fields.$file = null
      ]
      FileInputStream: [
        o 'available()I', (rs, _this) ->
            return 0 if not _this.fields.$file? # no buffering for stdin
            stats = fs.fstatSync _this.fields.$file
            stats.size - _this.fields.$pos
        o 'read()I', (rs, _this) ->
            if (file = _this.fields.$file)?
              # this is a real file that we've already opened
              buf = new Buffer((fs.fstatSync file).size)
              bytes_read = fs.readSync(file, buf, 0, 1, _this.fields.$pos)
              _this.fields.$pos++
              return if bytes_read == 0 then -1 else buf.readUInt8(0)
            # reading from System.in, do it async
            data = null # will be filled in after the yield
            rs.curr_frame().resume = ->
              if data.length == 0 then -1 else data.charCodeAt(0)
            throw new util.YieldException (cb) ->
              rs.async_input 1, (byte) ->
                data = byte
                cb()
        o 'readBytes([BII)I', (rs, _this, byte_arr, offset, n_bytes) ->
            if _this.fields.$file?
              # this is a real file that we've already opened
              pos = _this.fields.$pos
              buf = new Buffer n_bytes
              bytes_read = fs.readSync(_this.fields.$file, buf, 0, n_bytes, pos)
              # not clear why, but sometimes node doesn't move the file pointer,
              # so we do it here ourselves
              _this.fields.$pos += bytes_read
              byte_arr.array[offset+i] = buf.readUInt8(i) for i in [0...bytes_read] by 1
              return if bytes_read == 0 and n_bytes isnt 0 then -1 else bytes_read
            # reading from System.in, do it async
            result = null # will be filled in after the yield
            rs.curr_frame().resume = -> result
            throw new util.YieldException (cb) ->
              rs.async_input n_bytes, (bytes) ->
                byte_arr.array[offset+idx] = b for b, idx in bytes
                result = bytes.length
                cb()
        o 'open(Ljava/lang/String;)V', (rs, _this, filename) ->
            filepath = rs.jvm2js_str(filename)
            try  # TODO: actually look at the mode
              _this.fields.$file = fs.openSync filepath, 'r'
              _this.fields.$pos = 0
            catch e
              if e.code == 'ENOENT'
                util.java_throw rs, 'java/io/FileNotFoundException', "Could not open file #{filepath}"
              else
                throw e
        o 'close0()V', (rs, _this) -> _this.fields.$file = null
      ]
      ObjectStreamClass: [
        o 'initNative()V', (rs) ->  # NOP
      ]
      RandomAccessFile: [
        o 'open(Ljava/lang/String;I)V', (rs, _this, filename, mode) ->
            filepath = rs.jvm2js_str(filename)
            try  # TODO: actually look at the mode
              _this.fields.$file = fs.openSync filepath, 'r'
            catch e
              if e.code == 'ENOENT'
                util.java_throw rs, 'java/io/FileNotFoundException', "Could not open file #{filepath}"
              else
                throw e
            _this.fields.$pos = 0
        o 'length()J', (rs, _this) ->
            stats = stat_file _this.fields.$file
            gLong.fromNumber stats.size
        o 'seek(J)V', (rs, _this, pos) -> _this.fields.$pos = pos
        o 'readBytes([BII)I', (rs, _this, byte_arr, offset, len) ->
            pos = _this.fields.$pos.toNumber()
            buf = new Buffer len
            bytes_read = fs.readSync(_this.fields.$file, buf, 0, len, pos)
            byte_arr.array[offset+i] = buf.readUInt8(i) for i in [0...bytes_read] by 1
            _this.fields.$pos = gLong.fromNumber(pos+bytes_read)
            return if bytes_read == 0 and len isnt 0 then -1 else bytes_read
        o 'close0()V', (rs, _this) -> _this.fields.$file = null
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
        o 'list(Ljava/io/File;)[Ljava/lang/String;', (rs, _this, file) ->
            pth = rs.jvm2js_str rs.get_obj file.fields.path
            files = fs.readdirSync(pth)
            rs.init_object('[Ljava/lang/String;',(rs.init_string(f) for f in files))
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
      zip:
        ZipEntry: [
          o 'initFields(J)V', (rs, _this, jzentry) ->
              ze = rs.get_zip_descriptor jzentry
              _this.fields.name = rs.init_string ze.name
              _this.fields.size = gLong.fromInt ze.stat.size
        ]
        ZipFile: [
          o 'open(Ljava/lang/String;IJZ)J', (rs,fname,mode,mtime,use_mmap) ->
              js_str = path.resolve rs.jvm2js_str fname
              if js_str == system_properties['sun.boot.class.path']
                error "Simulating ZipFile based on classes.jar..."
              else
                throw "Tried to open #{js_str}: ZipFile is not actually implemented."
              rs.set_zip_descriptor
                name: 'special', path: 'third_party/classes/'
          o 'close(J)V', (rs, jzfile) -> rs.free_zip_descriptor jzfile
          o 'getTotal(J)I', (rs, jzfile) ->
              if node?
                # yep, hardcoded. though I'm not sure a correct value actually matters...
                return 21090
              zipfile = rs.get_zip_descriptor jzfile
              unless zipfile.size?
                entries = []
                add_entries = (dir) ->
                  curr_dir_entries = fs.readdirSync dir
                  for e in curr_dir_entries
                    fullpath = "#{dir}/#{e}"
                    stat = fs.statSync fullpath
                    if stat.isDirectory()
                      add_entries fullpath
                    else
                      entries.push e
                add_entries zipfile.path
                zipfile.size = entries.length
              zipfile.size
          o 'getEntry(JLjava/lang/String;Z)J', (rs, jzfile, name, add_slash) ->
              zf = rs.get_zip_descriptor jzfile
              entry_name = rs.jvm2js_str name
              fullpath = "#{zf.path}#{entry_name}"
              if node?
                if _.last(fullpath) == '/'
                  # directory. not sure this value is actually used so just return a mock...
                  return rs.set_zip_descriptor
                           fullpath: fullpath
                           name: entry_name
                           stat: {
                             size: 4
                           }
                file = read_raw_class fullpath
                return gLong.ZERO unless file
                return rs.set_zip_descriptor
                         fullpath: fullpath
                         name: entry_name
                         file: file
                         stat: {
                           size: file.length
                         }
              try
                file = fs.openSync fullpath, 'r'
              catch e
                return gLong.ZERO
              rs.set_zip_descriptor
                fullpath: fullpath
                name: entry_name
                file: file
                stat: fs.fstatSync file
          o 'freeEntry(JJ)V', (rs, jzfile, jzentry) -> rs.free_zip_descriptor jzentry
          o 'getCSize(J)J', (rs, jzentry) ->
              ze = rs.get_zip_descriptor jzentry
              gLong.fromInt ze.stat.size # pretend compressed size = actual size?
          o 'getSize(J)J', (rs, jzentry) ->
              ze = rs.get_zip_descriptor jzentry
              gLong.fromInt ze.stat.size
          o 'getMethod(J)I', (rs, jzentry) -> 0 # STORED (i.e. uncompressed)
          o 'read(JJJ[BII)I', (rs, jzfile, jzentry, pos, byte_arr, offset, len) ->
              ze = rs.get_zip_descriptor jzentry
              if node?
                pos_int = pos.toInt()
                bytes_read = Math.min(ze.file.length - pos_int, len)
                byte_arr.array[offset+i] = ze.file[pos_int+i] for i in [0...bytes_read] by 1
              else
                buf = new Buffer len
                bytes_read = fs.readSync(ze.file, buf, 0, len, pos.toInt())
                byte_arr.array[offset+i] = buf.readUInt8(i) for i in [0...bytes_read] by 1
              return if bytes_read == 0 and len isnt 0 then -1 else bytes_read
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
            set_value_from_offset rs, obj, offset, (x?.ref or 0)
            true
        o 'compareAndSwapInt(Ljava/lang/Object;JII)Z', (rs, _this, obj, offset, expected, x) ->
            set_value_from_offset rs, obj, offset, x
            true
        o 'compareAndSwapLong(Ljava/lang/Object;JJJ)Z', (rs, _this, obj, offset, expected, x) ->
            set_value_from_offset rs, obj, offset, x
            true
        o 'ensureClassInitialized(Ljava/lang/Class;)V', (rs,_this,cls) -> 
            rs.class_lookup(cls.fields.$type)
        o 'staticFieldOffset(Ljava/lang/reflect/Field;)J', (rs,_this,field) -> gLong.fromNumber(field.fields.slot)
        o 'objectFieldOffset(Ljava/lang/reflect/Field;)J', (rs,_this,field) -> gLong.fromNumber(field.fields.slot)
        o 'staticFieldBase(Ljava/lang/reflect/Field;)Ljava/lang/Object;', (rs,_this,field) ->
            rs.set_obj rs.get_obj(field.fields.clazz).fields.$type
        o 'getObjectVolatile(Ljava/lang/Object;J)Ljava/lang/Object;', (rs,_this,obj,offset) ->
            get_value_from_offset rs, obj, offset
        o 'getObject(Ljava/lang/Object;J)Ljava/lang/Object;', (rs,_this,obj,offset) ->
            get_value_from_offset rs, obj, offset
        o 'putOrderedObject(Ljava/lang/Object;JLjava/lang/Object;)V', (rs,_this,obj,offset,new_obj) ->
            set_value_from_offset rs, obj, offset, (new_obj?.ref or 0)
      ]
    reflect:
      NativeMethodAccessorImpl: [
        o 'invoke0(Ljava/lang/reflect/Method;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;', (rs,m,obj,params) ->
            type = rs.get_obj(m.fields.clazz).fields.$type
            method = (method for sig, method of rs.class_lookup(type).methods when method.idx is m.fields.slot)[0]
            rs.push obj.ref unless method.access_flags.static
            rs.push params.array...
            method.run(rs)
            rs.pop()
      ]
      NativeConstructorAccessorImpl: [
        o 'newInstance0(Ljava/lang/reflect/Constructor;[Ljava/lang/Object;)Ljava/lang/Object;', (rs,m,params) ->
            type = rs.get_obj(m.fields.clazz).fields.$type
            method = (method for sig, method of rs.class_lookup(type).methods when method.idx is m.fields.slot)[0]
            rs.push (oref = rs.set_obj type, {})
            rs.push params.array... if params?
            method.run(rs)
            oref
      ]
      Reflection: [
        o 'getCallerClass(I)Ljava/lang/Class;', (rs, frames_to_skip) ->
            #TODO: disregard frames assoc. with java.lang.reflect.Method.invoke() and its implementation
            type = rs.meta_stack[rs.meta_stack.length-1-frames_to_skip].method.class_type
            rs.class_lookup type, true
        o 'getClassAccessFlags(Ljava/lang/Class;)I', (rs, _this) ->
            rs.class_lookup(_this.fields.$type).access_byte
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
