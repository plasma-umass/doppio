
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

root.int2uint = (int, bytes_count) ->
  if int < 0 then int + Math.pow 2, bytes_count * 8 else int

root.bytestr_to_array = (bytecode_string) ->
  (bytecode_string.charCodeAt(i) & 0xFF for i in [0...bytecode_string.length])

root.parse_flags = (flag_byte) ->
  flags = {
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
  # quick sanity check
  s = root.sum(1 for f in ['public','private','protected'] when flags[f] != 0)
  throw new Error "Too many access flags, invalid classfile parse" if s > 1
  flags

class root.BytesArray
  constructor: (@raw_array, @start=0, @end=@raw_array.length) ->
    @_index = 0

  pos: -> @_index

  skip: (bytes_count) -> @_index += bytes_count

  has_bytes: -> @start + @_index < @end

  get_uint: (bytes_count) ->
    rv = root.read_uint @raw_array.slice(@start + @_index, @start + @_index + bytes_count)
    @_index += bytes_count
    return rv

  get_int: (bytes_count) ->
    root.uint2int @get_uint(bytes_count), bytes_count

  read: (bytes_count) ->
    rv = @raw_array[@start+@_index...@start+@_index+bytes_count]
    @_index += bytes_count
    rv

  peek: -> @raw_array[@start+@_index]

  size: -> @end - @start - @_index

  splice: (len) ->
    arr = new root.BytesArray @raw_array, @start+@_index, @start+@_index+len
    @_index += len
    arr

root.is_string = (obj) -> typeof obj == 'string' or obj instanceof String

root.decimal_to_string = (num, precision) ->
  if num == Number.MIN_VALUE
    s = num.toPrecision(2)
  else
    s = num.toString()
    if s.indexOf('e') == -1 and Math.abs(num) > Math.pow(10, 7)
      exp_len = s.length - (if num < 0 then 2 else 1)
      s = num.toExponential(Math.min(exp_len, precision-1))
      s = s.replace(/\.?0+e/,'e')  # remove trailing zeros before exponent
    else if s.indexOf('.') == -1
      s = num.toFixed(1)
    else
      # cap the number of decimal places
      dec = parseFloat(s.match(/\d+\.\d+/)[0]).toPrecision(precision)
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

class root.HaltException
  constructor: (@exit_code) ->

class root.ReturnException
  constructor: (@values...) ->

class root.YieldException
  constructor: (@condition) ->

class root.JavaException
  constructor: (rs, @exception_ref) ->
    @exception = rs.get_obj @exception_ref

# Simulate the throwing of a Java exception with message :msg. Not very DRY --
# code here is essentially copied from the opcodes themselves -- but
# constructing the opcodes manually is inelegant too.
root.java_throw = (rs, cls, msg) ->
  method_spec = class: cls, sig: '<init>(Ljava/lang/String;)V'
  v = rs.init_object cls # new
  rs.push(v,v,rs.init_string msg) # dup, ldc
  rs.method_lookup(method_spec).run(rs) # invokespecial
  throw new root.JavaException rs, rs.pop() # athrow

# logging helpers

root.DEBUG = 10
root.ERROR = 1
root.log_level ?= root.ERROR

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
      x = root.int2uint bytes[idx++], 1
      break if x == 0
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
