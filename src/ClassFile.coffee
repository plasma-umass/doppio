
# pull in external modules
util = require './util'
ConstantPool = require './ConstantPool'
attributes = require './attributes'
opcodes = require './opcodes'
methods = require './methods'
types = require './types'
{c2t} = types

"use strict"

class ClassFile
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
    @interfaces = (bytes_array.get_uint 2 for i in [0...isize] by 1)
    # fields of this class
    num_fields = bytes_array.get_uint 2
    @fields = (new methods.Field(@this_class) for i in [0...num_fields] by 1)
    @fl_cache = {}
    for f,i in @fields
      f.parse(bytes_array,@constant_pool,i)
      @fl_cache[f.name] = f
    # class methods
    num_methods = bytes_array.get_uint 2
    @methods = {}
    # It would probably be safe to make @methods the @ml_cache, but it would
    # make debugging harder as you would lose track of who owns what method.
    @ml_cache = {}
    for i in [0...num_methods] by 1
      m = new methods.Method(@this_class)
      m.parse(bytes_array,@constant_pool,i)
      mkey = m.name + m.raw_descriptor
      @methods[mkey] = m
      @ml_cache[mkey] = m
    # class attributes
    @attrs = attributes.make_attributes(bytes_array,@constant_pool)
    throw "Leftover bytes in classfile: #{bytes_array}" if bytes_array.has_bytes()

  @for_array_type: (type) ->
    class_file = Object.create ClassFile.prototype # avoid calling the constructor
    class_file.constant_pool = new ConstantPool
    class_file.ml_cache = {}
    class_file.fl_cache = {}
    class_file.access_flags = {}
    class_file.this_class = type
    class_file.super_class = c2t('java/lang/Object')
    class_file.interfaces = []
    class_file.fields = []
    class_file.methods = {}
    class_file.attrs = []
    class_file

  # Spec [5.4.3.2][1].
  # [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#77678
  field_lookup: (rs, field_spec) ->
    unless @fl_cache[field_spec.name]?
      @fl_cache[field_spec.name] = @_field_lookup(rs, field_spec)
    return @fl_cache[field_spec.name]

  _field_lookup: (rs, field_spec) ->
    for field in @fields
      if field.name is field_spec.name
        return field

    for i in @interfaces
      ifc_cls = rs.class_lookup c2t @constant_pool.get(i).deref()
      field = ifc_cls.field_lookup(rs, field_spec)
      return field if field?

    if @super_class?
      sc = rs.class_lookup @super_class
      field = sc.field_lookup(rs, field_spec)
      return field if field?
    return null

  # Spec [5.4.3.3][1], [5.4.3.4][2].
  # [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#79473
  # [2]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#78621
  method_lookup: (rs, method_spec) ->
    unless @ml_cache[method_spec.sig]?
      @ml_cache[method_spec.sig] = @_method_lookup(rs, method_spec)
    return @ml_cache[method_spec.sig]

  _method_lookup: (rs, method_spec) ->
    method = @methods[method_spec.sig]
    return method if method?

    if @super_class?
      parent = rs.class_lookup @super_class
      method = parent.method_lookup(rs, method_spec)
      return method if method?

    for i in @interfaces
      ifc = rs.class_lookup c2t @constant_pool.get(i).deref()
      method = ifc.method_lookup(rs, method_spec)
      return method if method?

    return null

  construct_default_fields: (rs) ->
    # init fields from this and inherited ClassFiles
    t = @this_class
    # Object.create(null) avoids interference with Object.prototype's properties
    @default_fields = Object.create null
    while t?
      cls = rs.class_lookup t
      for f in cls.fields when not f.access_flags.static
        val = util.initial_value f.raw_descriptor
        @default_fields[t.toClassString() + '/' + f.name] = val
      t = cls.super_class
    # Supposedly makes prototype lookup faster. I haven't noticed a net
    # positive or negative result, so I'll keep it in for now.
    # Object.freeze @default_fields

  get_default_fields: (rs) ->
    return @default_fields unless @default_fields is undefined
    @construct_default_fields(rs)
    return @default_fields

if module?
  module.exports = ClassFile
else
  window.ClassFile = ClassFile
