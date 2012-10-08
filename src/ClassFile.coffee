
# pull in external modules
_ = require '../third_party/_.js'
util = require './util'
ConstantPool = require './ConstantPool'
attributes = require './attributes'
opcodes = require './opcodes'
methods = require './methods'
types = require './types'
{c2t} = types

class ClassFile
  # All class attributes should not be modified (e.g. by a running program)
  # once it has been constructed.
  constructor: (bytes_array) ->
    bytes_array = new util.BytesArray bytes_array
    throw "Magic number invalid" if (bytes_array.get_uint 4) != 0xCAFEBABE
    @minor_version = bytes_array.get_uint 2
    @major_version = bytes_array.get_uint 2
    throw "Major version invalid" unless 45 <= @major_version <= 51
    @constant_pool = new ConstantPool
    @constant_pool.parse(bytes_array)
    # bitmask for {public,final,super,interface,abstract} class modifier
    @access_byte = bytes_array.get_uint 2
    @access_flags = util.parse_flags @access_byte
    @this_class  = c2t(@constant_pool.get(bytes_array.get_uint 2).deref())
    @constant_pool.cls = @this_class.class_name  #hax
    # super reference is 0 when there's no super (basically just java.lang.Object)
    super_ref = bytes_array.get_uint 2
    @super_class = c2t(@constant_pool.get(super_ref).deref()) unless super_ref is 0
    # direct interfaces of this class
    isize = bytes_array.get_uint 2
    @interfaces = (bytes_array.get_uint 2 for [0...isize])
    # fields of this class
    num_fields = bytes_array.get_uint 2
    @fields = (new methods.Field(@this_class) for [0...num_fields])
    for f,i in @fields
      f.parse(bytes_array,@constant_pool,i)
    # class methods
    num_methods = bytes_array.get_uint 2
    @methods = {}
    for i in [0...num_methods] by 1
      m = new methods.Method(@this_class)
      m.parse(bytes_array,@constant_pool,i)
      @methods[m.name + m.raw_descriptor] = m
    # class attributes
    @attrs = attributes.make_attributes(bytes_array,@constant_pool)
    throw "Leftover bytes in classfile: #{bytes_array}" if bytes_array.has_bytes()

  @for_array_type: (type) ->
    class_file = Object.create ClassFile.prototype # avoid calling the constructor
    class_file.constant_pool = new ConstantPool
    class_file.access_flags = {}
    class_file.this_class = type
    class_file.super_class = c2t('java/lang/Object')
    class_file.interfaces = []
    class_file.fields = []
    class_file.methods = []
    class_file.attrs = []
    class_file

if module?
  module.exports = ClassFile
else
  window.ClassFile = ClassFile
