
# pull in external modules
util = require './util'
ConstantPool = require './ConstantPool'
attributes = require './attributes'
opcodes = require './opcodes'
methods = null # Define later to avoid circular dependency; methods references natives, natives references ClassData
types = require './types'
{java_throw} = require './exceptions'
{c2t} = types
{trace} = require './logging'
{JavaClassObject} = require './java_object'

"use strict"

root = exports ? this.ClassData = {}

# Represents a single Class in the JVM.
class ClassData
  constructor: (@loader=null) -> # NOP

  # Proxy method for type's method until we get rid of type objects.
  toClassString: () -> @this_class
  toExternalString: () -> util.ext_classname @this_class

  # We should use this instead of the above. Returns the standardized type
  # string for this class, whether it be a Reference or a Primitive type.
  toTypeString: () -> @toClassString()

  get_class_object: (rs) ->
    @jco = new JavaClassObject(rs, @) unless @jco?
    @jco

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

    # These may not be initialized! But we have them loaded.
    for i in @interfaces
      ifc_cls = rs.get_loaded_class c2t @constant_pool.get(i).deref()
      field = ifc_cls.field_lookup(rs, field_spec)
      return field if field?

    if @super_class?
      sc = rs.class_lookup c2t(@super_class)
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
      parent = rs.class_lookup c2t(@super_class)
      method = parent.method_lookup(rs, method_spec)
      return method if method?

    for i in @interfaces
      ifc = rs.get_loaded_class c2t @constant_pool.get(i).deref()
      method = ifc.method_lookup(rs, method_spec)
      return method if method?

    return null

  static_get: (rs, name) ->
    return @static_fields[name] unless @static_fields[name] is undefined
    java_throw rs, rs.class_lookup(c2t 'java/lang/NoSuchFieldError'), name

  static_put: (rs, name, val) ->
    unless @static_fields[name] is undefined
      @static_fields[name] = val
    else
      java_throw rs, rs.class_lookup(c2t 'java/lang/NoSuchFieldError'), name

  # Resets any ClassData state that may have been built up
  load: () ->
    @initialized = false
    @jco = null

  # "Reinitializes" the ClassData for subsequent JVM invocations. Resets all
  # of the built up state / caches present in the opcode instructions.
  # Eventually, this will also handle `clinit` duties.
  initialize: () ->
    unless @initialized
      @static_fields = @_construct_static_fields()
      for method in @methods
        method.initialize()

  construct_default_fields: (rs) ->
    # init fields from this and inherited ClassDatas
    t = c2t(@this_class)
    # Object.create(null) avoids interference with Object.prototype's properties
    @default_fields = Object.create null
    while t?
      cls = rs.class_lookup t
      for f in cls.fields when not f.access_flags.static
        val = util.initial_value f.raw_descriptor
        @default_fields[t.toClassString() + '/' + f.name] = val
      t = c2t(cls.super_class)

  # Used internally to reconstruct @static_fields
  _construct_static_fields: ->
    static_fields = Object.create null
    for f in @fields when f.access_flags.static
      static_fields[f.name] = util.initial_value f.raw_descriptor
    return static_fields

  get_default_fields: (rs) ->
    return @default_fields unless @default_fields is undefined
    @construct_default_fields(rs)
    return @default_fields

  # Checks if the class file is initialized. It will set @initialized to 'true'
  # if this class has no static initialization method and its parent classes
  # are initialized, too.
  is_initialized: (rs) ->
    return true if @initialized
    # XXX: Hack to avoid traversing hierarchy.
    return false if @methods['<clinit>()V']?
    @initialized = if @super_class? then rs.get_loaded_class(c2t(@super_class), @, true)?.is_initialized(rs) else false
    return @initialized

  # Returns the JavaObject object of the classloader that initialized this
  # class. Returns null for the default classloader.
  get_class_loader: () -> @loader
  # Returns the unique ID of this class loader. Returns null for the bootstrap
  # classloader.
  get_class_loader_id: () -> @loader?.ref or null

  # Returns 'true' if I am a subclass of target.
  is_subclass: (rs, target) ->
    return true if @this_class is target.this_class
    return false unless @super_class?  # I'm java/lang/Object, can't go further
    return rs.class_lookup(c2t(@super_class)).is_subclass rs, target

  # Returns 'true' if I implement the target interface.
  is_subinterface: (rs, target) ->
    return true if @this_class is target.this_class
    for i in @interfaces
      super_iface = rs.class_lookup c2t(@constant_pool.get(i).deref())
      return true if super_iface.is_subinterface rs, target
    return false unless @super_class?  # I'm java/lang/Object, can't go further
    return rs.class_lookup(c2t(@super_class)).is_subinterface rs, target

# Represents a "reference" Class -- that is, a class that neither represents a
# primitive nor an array.
class root.ReferenceClassData extends ClassData
  constructor: (bytes_array, @loader=null) ->
    # XXX: Circular dependency hack.
    unless methods? then methods = require './methods'

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
    @this_class  = @constant_pool.get(bytes_array.get_uint 2).deref()
    # super reference is 0 when there's no super (basically just java.lang.Object)
    super_ref = bytes_array.get_uint 2
    @super_class = @constant_pool.get(super_ref).deref() unless super_ref is 0
    # direct interfaces of this class
    isize = bytes_array.get_uint 2
    @interfaces = (bytes_array.get_uint 2 for i in [0...isize] by 1)
    # fields of this class
    num_fields = bytes_array.get_uint 2
    @fields = (new methods.Field(@) for i in [0...num_fields] by 1)
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
      m = new methods.Method(@)
      m.parse(bytes_array,@constant_pool,i)
      mkey = m.name + m.raw_descriptor
      @methods[mkey] = m
      @ml_cache[mkey] = m
    # class attributes
    @attrs = attributes.make_attributes(bytes_array,@constant_pool)
    throw "Leftover bytes in classfile: #{bytes_array}" if bytes_array.has_bytes()

    @jco = null
    @initialized = false # Has clinit been run?
    # Contains the value of all static fields. Will be reset when initialize()
    # is run.
    @static_fields = @_construct_static_fields()

  # Returns a boolean indicating if this class is an instance of the target class.
  # "target" is a ClassData object.
  # The ClassData objects do not need to be initialized; just loaded.
  # See §2.6.7 for casting rules.
  is_castable: (rs, target) ->
    return false unless target instanceof root.ReferenceClassData

    if @access_flags.interface
      # We are both interfaces
      if target.access_flags.interface then return @is_subinterface(rs,target)
      # Only I am an interface
      return target.toClassString() is 'java/lang/Object' unless target.access_flags.interface
    else
      # I am a regular class, target is an interface
      if target.access_flags.interface then return @is_subinterface(rs,target)
      # We are both regular classes
      return @is_subclass(rs,target)

class root.ArrayClassData extends ClassData
  constructor: (type, @loader=null) ->
    @constant_pool = new ConstantPool
    @ml_cache = {}
    @fl_cache = {}
    @access_flags = {}
    @this_class = type.toClassString()
    @component_type = type.component_type.toClassString()
    @super_class = 'java/lang/Object'
    @interfaces = []
    @fields = []
    @methods = {}
    @attrs = []
    @initialized = false
    @static_fields = []

  get_component_type: () -> return @component_type

  # Returns a boolean indicating if this class is an instance of the target class.
  # "target" is a ClassData object.
  # The ClassData objects do not need to be initialized; just loaded.
  # See §2.6.7 for casting rules.
  is_castable: (rs, target) -> # target is c2
    unless target instanceof root.ArrayClassData
      return false if target instanceof root.PrimitiveClassData
      # Must be a reference type.
      if target.access_flags.interface
        # Interface reference type
        return target.toClassString() in ['java/lang/Cloneable','java/io/Serializable']
      # Non-interface reference type
      return target.toClassString() is 'java/lang/Object'

    # We are both array types, so it only matters if my component type can be
    # cast to its component type.
    return rs.get_loaded_class(c2t @get_component_type()).is_castable(rs, rs.get_loaded_class(c2t target.get_component_type()))

class root.PrimitiveClassData extends ClassData
  constructor: (type, @loader=null) ->
    @constant_pool = new ConstantPool
    @ml_cache = {}
    @fl_cache = {}
    @access_flags = {}
    @this_class = type.toExternalString()
    @super_class = null
    @interfaces = []
    @fields = []
    @methods = {}
    @attrs = []
    @initialized = true
    @static_fields = []

  # Primitive classes are represented by their external string.
  toTypeString: () -> @this_class

  # Returns a boolean indicating if this class is an instance of the target class.
  # "target" is a ClassData object.
  # The ClassData objects do not need to be initialized; just loaded.
  is_castable: (rs, target) -> @this_class == target.this_class
