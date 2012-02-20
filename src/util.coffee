
# pull in external modules
_ ?= require './third_party/underscore-min.js'

# things assigned to root will be available outside this module
root = exports ? this 

sum = (list) -> _.reduce(list, ((a,b) -> a+b), 0)

root.padleft = (str,len,fillchar) ->
  throw "fillchar can only be length 1" unless fillchar.length == 1
  # I hate this.
  until str.length >= len
    str = fillchar + str
  return str

# implments x<<n without the braindead javascript << operator
# (see http://stackoverflow.com/questions/337355/javascript-bitwise-shift-of-long-long-number)
root.lshift = (x,n) -> x*Math.pow(2,n)

root.bitwise_not = (x,nbits) ->
  s = padleft(x.toString(2),nbits,'0')
  # may the computer gods have mercy on our souls...
  not_s = s.replace(/1/g,'x').replace(/0/g,'1').replace(/x/g,'0')
  return parseInt(not_s,2)

root.read_uint = (bytes) -> 
  n = bytes.length-1
  # sum up the byte values shifted left to the right alignment.
  sum(lshift(bytes[i]&0xFF,8*(n-i)) for i in [0..n])

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

class ExceptionHandler
  parse: (bytes_array,constant_pool) ->
    @start_pc   = read_uint(bytes_array.splice(0,2))
    @end_pc     = read_uint(bytes_array.splice(0,2))
    @handler_pc = read_uint(bytes_array.splice(0,2))
    cti = read_uint(bytes_array.splice(0,2))
    @catch_type = if cti==0 then "<all>" else constant_pool.deref(cti).value
    return bytes_array
  
class Code
  parse: (bytes_array,constant_pool) ->
    @max_stack = read_uint(bytes_array.splice(0,2))
    @max_locals = read_uint(bytes_array.splice(0,2))
    code_len = read_uint(bytes_array.splice(0,4))
    throw "Attribute._parse_code: Code length is zero" if code_len == 0
    @opcodes = @parse_code bytes_array.splice(0,code_len), constant_pool
    except_len = read_uint(bytes_array.splice(0,2))
    @exception_handlers = (new ExceptionHandler for _ in [0...except_len])
    for eh in @exception_handlers
      bytes_array = eh.parse(bytes_array,constant_pool)
    # yes, there are even attrs on attrs. BWOM... BWOM...
    [@attrs,bytes_array] = make_attributes(bytes_array,constant_pool)
    return bytes_array

  parse_code: (bytes_array, constant_pool) ->
    until bytes_array.length == 0
      c = bytes_array.shift()&0xFF
      op = opcodes[c]
      bytes_array = op.take_args(bytes_array, constant_pool)
      op

class LineNumberTable extends Array
  parse: (bytes_array,constant_pool) ->
    lnt_len = read_uint(bytes_array.splice(0,2))
    for _ in [0...lnt_len]
      spc = read_uint(bytes_array.splice(0,2))
      ln = read_uint(bytes_array.splice(0,2))
      this.push {'start_pc': spc,'line_number': ln}
    return bytes_array

class SourceFile
  parse: (bytes_array,constant_pool) ->
    @name = constant_pool.get(read_uint(bytes_array.splice(0,2))).value
    return bytes_array

root.make_attributes = (bytes_array,constant_pool) ->
  #TODO: add classes for additional attr types
  attr_types = { 'Code': Code, 'LineNumberTable': LineNumberTable, 'SourceFile': SourceFile }
  num_attrs = read_uint(bytes_array.splice(0,2))
  attrs = []
  for _ in [0...num_attrs]
    name = constant_pool.get(read_uint(bytes_array.splice(0,2))).value
    throw "Attribute.parse: Invalid constant_pool reference: '#{name}'" unless name
    attr_len = read_uint(bytes_array.splice(0,4))  # unused
    attr = new attr_types[name]
    bytes_array = attr.parse(bytes_array,constant_pool)
    attrs.push attr
  return [attrs,bytes_array]
