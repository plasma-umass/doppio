
# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util'
ConstantPool ?= require './constant_pool'
make_attributes ?= require './attributes'
opcodes ?= require './opcodes'
methods ?= require './methods'
types ?= require './types'
{c2t} = types

class @ClassFile
  # All class attributes should not be modified (e.g. by a running program)
  # once it has been constructed.
  constructor: (bytes_array) ->
    read_u2 = -> util.read_uint(bytes_array.splice(0,2))
    read_u4 = -> util.read_uint(bytes_array.splice(0,4))
    throw "Magic number invalid" if read_u4() != 0xCAFEBABE
    @minor_version = read_u2()
    @major_version = read_u2()
    throw "Major version invalid" unless 45 <= @major_version <= 51
    @constant_pool = new ConstantPool
    bytes_array = @constant_pool.parse(bytes_array)
    # bitmask for {public,final,super,interface,abstract} class modifier
    @access_byte = read_u2()
    @access_flags = util.parse_flags @access_byte
    @this_class  = c2t(@constant_pool.get(read_u2()).deref())
    @constant_pool.cls = @this_class.class_name  #hax
    # super reference is 0 when there's no super (basically just java.lang.Object)
    super_ref = read_u2()
    @super_class = c2t(@constant_pool.get(super_ref).deref()) unless super_ref is 0
    # direct interfaces of this class
    isize = read_u2()
    @interfaces = (read_u2() for [0...isize])
    # fields of this class
    num_fields = read_u2()
    @fields = (new methods.Field(@this_class) for [0...num_fields])
    for f in @fields
      bytes_array = f.parse(bytes_array,@constant_pool)
    # class methods
    num_methods = read_u2()
    @methods = (new methods.Method(@this_class) for [0...num_methods])
    for m in @methods
      bytes_array = m.parse(bytes_array,@constant_pool)
    # class attributes
    [@attrs,bytes_array] = make_attributes(bytes_array,@constant_pool)
    throw "Leftover bytes in classfile: #{bytes_array}" if bytes_array.length > 0

module?.exports = @ClassFile
