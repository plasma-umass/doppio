
# pull in external modules
_ ?= require '../third_party/underscore-min.js'

# things assigned to root will be available outside this module
root = exports ? this.util = {}

root.sum = (list) -> _.reduce(list, ((a,b) -> a+b), 0)

root.padleft = (str,len,fillchar) ->
  throw "fillchar can only be length 1" unless fillchar.length == 1
  # I hate this.
  until str.length >= len
    str = fillchar + str
  return str

root.cmp = (a,b) ->
  return 0  if a == b
  return -1 if a < b
  return 1 if a > b
  return null # this will occur if either a or b is NaN

# implements x<<n without the braindead javascript << operator
# (see http://stackoverflow.com/questions/337355/javascript-bitwise-shift-of-long-long-number)
root.lshift = (x,n) -> x*Math.pow(2,n)

root.bitwise_not = (x,nbits) ->
  s = root.padleft(x.toString(2),nbits,'0')
  # may the computer gods have mercy on our souls...
  not_s = s.replace(/1/g,'x').replace(/0/g,'1').replace(/x/g,'0')
  return parseInt(not_s,2)

root.read_uint = (bytes) -> 
  n = bytes.length-1
  # sum up the byte values shifted left to the right alignment.
  root.sum(root.lshift(bytes[i],8*(n-i)) for i in [0..n])

root.read_int = (bytes) ->
  s = (util.padleft(bytes[i].toString(2),8,'0') for i in [0...bytes.length]).join('')
  if s[0] == '1'
    not_s = s.replace(/1/g,'x').replace(/0/g,'1').replace(/x/g,'0')
    return -(1 + parseInt(not_s,2))
  return parseInt(s,2)

root.uint2int = (uint, bytes_count) ->
  if uint > Math.pow 2, 8 * bytes_count - 1
    uint - Math.pow 2, 8 * bytes_count
  else
    uint

root.bytestr_to_array = (bytecode_string) ->
  (bytecode_string.charCodeAt(i) & 0xFF for i in [0...bytecode_string.length])

root.is_array = (typestr) -> typestr[0] == '['

root.is_class = (typestr) -> typestr[0] == 'L'

root.unarray = (typestr) -> typestr.slice(1) # strips one level of array from type sig

root.class_from_type = (typestr) -> typestr[1...typestr.length-1] # LClassName; -> ClassName

root.is_primitive = (typestr) ->
  typestr.length == 1 and typestr in ['B', 'C', 'D', 'F', 'I', 'J', 'S', 'Z']

# XXX some code duplication with methods.coffee
root.ext_type = (typestr) ->
  switch typestr[0]
    when 'B' then 'byte'
    when 'C' then 'char'
    when 'D' then 'double'
    when 'F' then 'float'
    when 'I' then 'int'
    when 'J' then 'long'
    when 'L' then root.ext_classname root.class_from_type typestr
    when 'S' then 'short'
    when 'Z' then 'boolean'
    when '[' then root.ext_classname typestr

root.parse_flags = (flag_byte) ->
  {
    public:       flag_byte & 0x1
    private:      flag_byte & 0x2
    protected:    flag_byte & 0x4
    static:       flag_byte & 0x8
    final:        flag_byte & 0x10
    synchronized: flag_byte & 0x20
    super:        flag_byte & 0x20
    volatile:     flag_byte & 0x40
    transient:    flag_byte & 0x80
    native:       flag_byte & 0x100
    interface:    flag_byte & 0x200
    abstract:     flag_byte & 0x400
    strict:       flag_byte & 0x800
  }

class root.BytesArray
  constructor: (@raw_array) ->
    @index = 0

  has_bytes: -> @index < @raw_array.length

  get_uint: (bytes_count) ->
    rv = root.read_uint @raw_array.slice(@index, @index+bytes_count)
    @index += bytes_count
    return rv

  get_int: (bytes_count) ->
    uint = root.uint2int @get_uint(bytes_count), bytes_count

root.is_string = (obj) -> typeof obj == 'string' or obj instanceof String

root.decimal_to_string = (num) ->
  s = num.toString()
  return num.toFixed(1) unless s.match(/\./)?
  # cap the number of decimal places to 7 (technically only valid for floats, but whatevs)
  dec = parseFloat(s.match(/\d+\.\d+/)[0]).toFixed(7)
  dec = dec.replace(/0+$/,'').replace(/\.$/,'.0')  # remove trailing zeros
  s = s.replace(/\d+\.\d+/,dec)
  return s.replace(/e/,'E').replace(/\+/,'')

# Walks up the prototype chain of :object looking for an entry in the :handlers
# dict that match its constructor's name. If it finds one, it calls that handler
# with :object bound to `this` and :args as the arguments.
root.lookup_handler = (handlers, object, args...) ->
  obj = object
  while obj?
    handler = handlers[obj.constructor.name]
    return handler.apply object, args if handler
    obj = Object.getPrototypeOf obj

class root.BranchException
  constructor: (@dst_pc) ->

class root.ReturnException
  constructor: (@values...) ->

class root.YieldException

class root.JavaException
  constructor: (rs, @exception_ref) ->
    @exception = rs.get_obj @exception_ref
    @stack = []
    for sf in rs.meta_stack.slice(1)
      cls = sf.method.class_name
      source_file = _.find(rs.class_lookup(cls).attrs, (attr) -> attr.constructor.name == 'SourceFile').name
      line_nums = sf.method.get_code()?.attrs[0]
      if line_nums?
        ln = _.last(row.line_number for i,row of line_nums when row.start_pc <= sf.pc)
      else
        ln = 'unknown'
      @stack.push {'op':sf.pc, 'line':ln, 'file':source_file, 'method':sf.method.name, 'cls':cls}

# Simulate the throwing of a Java exception with message :msg. Not very DRY --
# code here is essentially copied from the opcodes themselves -- but
# constructing the opcodes manually is inelegant too.
root.java_throw = (rs, cls, msg) ->
  method_spec =
    class: cls
    sig: { name: '<init>', type: '(Ljava/lang/String;)V' }
  rs.heap_new cls # new
  v=rs.pop(); rs.push(v,v) # dup
  rs.push rs.init_string msg # ldc
  rs.method_lookup(method_spec).run(rs) # invokespecial
  throw new root.JavaException rs, rs.pop() # athrow

# logging helpers

root.DEBUG = 10
root.ERROR = 1
root.log_level ?= root.DEBUG

root.log = (level, msgs...) ->
  if level <= root.log_level
    console[if level == 1 then 'error' else 'log'] msgs...

root.debug = (msgs...) -> root.log root.DEBUG, msgs...

root.error = (msgs...) -> root.log root.ERROR, msgs...

# Java classes are represented internally using slashes as delimiters.
# These helper functions convert between the two representations.
root.ext_classname = (str) -> str.replace /\//g, '.'
root.int_classname = (str) -> str.replace /\./g, '/'

# Parse Java's pseudo-UTF-8 strings. (spec 4.4.7)
root.bytes2str = (bytes) ->
  idx = 0
  char_array =
    while idx < bytes.length
      x = bytes[idx++]
      String.fromCharCode(
        if x <= 0x7f
          x
        else if x <= 0xdf
          y = bytes[idx++]
          ((x & 0x1f) << 6) + (y & 0x3f)
        else
          y = bytes[idx++]
          z = bytes[idx++]
          ((x & 0xf) << 12) + ((y & 0x3f) << 6) + (z & 0x3f)
      )
  char_array.join ''
