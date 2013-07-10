"use strict"

# pull in external modules
util = require './util'
ConstantPool = require './ConstantPool'
attributes = require './attributes'
opcodes = require './opcodes'
# Define `methods` later to avoid circular dependency; methods references
# natives, natives references ClassData
methods = null
{JavaObject,JavaClassObject} = require './java_object'
{trace} = require './logging'

root = exports ? this.ClassData = {}

# Represents a single Class in the JVM.
class ClassData
  # Responsible for setting up all of the fields that are guaranteed to be
  # present on any ClassData object.
  constructor: (@loader=null) ->
    @access_flags = {}
    @initialized = false
    @resolved = false
    @jco = null
    # Flip to 1 to trigger reset() call on load.
    @reset_bit = 0

  # Resets any ClassData state that may have been built up
  # We do not reset 'initialized' here; only reference types need to reset that.
  reset: ->
    @jco = null
    @reset_bit = 0

    # Reset any referenced classes if they are up for reset.
    sc = @get_super_class()
    if sc?.reset_bit is 1
      sc.reset()
    for iface in @get_interfaces
      if iface.reset_bit is 1 then iface.reset()
    return

  toExternalString: () -> util.ext_classname @this_class

  getLoadState: ->
    if @initialized then 'initialized'
    else if @resolved then 'resolved'
    else 'loaded'

  # Returns the ClassLoader object of the classloader that initialized this
  # class. Returns null for the default classloader.
  get_class_loader: -> @loader
  get_type: -> @this_class
  get_super_class_type: -> @super_class
  get_super_class: -> @super_class_cdata
  get_interface_types: -> []
  get_interfaces: -> []
  get_class_object: (rs) ->
    @jco = new JavaClassObject(rs, @) unless @jco?
    @jco
  get_method: -> null
  get_methods: -> {}
  get_fields: -> []
  method_lookup: (rs, sig) ->
    rs.java_throw rs.get_bs_class('Ljava/lang/NoSuchMethodError;'),
      "No such method found in #{util.ext_classname(@get_type())}::#{sig}"
  field_lookup: (rs, name) ->
    rs.java_throw rs.get_bs_class('Ljava/lang/NoSuchFieldError;'),
      "No such field found in #{util.ext_classname(@get_type())}::#{name}"

  # Checks if the class file is initialized. It will set @initialized to 'true'
  # if this class has no static initialization method and its parent classes
  # are initialized, too.
  is_initialized: ->
    return true if @initialized
    return false unless @is_resolved()
    return false if @get_method('<clinit>()V')?
    @initialized = if @get_super_class()?.is_initialized() else false
    return @initialized
  is_resolved: -> @resolved
  is_subinterface: -> false
  is_subclass: (target) ->
    return true if @ is target
    return false unless @get_super_class()?  # I'm java/lang/Object, can't go further
    return @get_super_class().is_subclass target

class root.PrimitiveClassData extends ClassData
  constructor: (@this_class, loader) ->
    super loader
    @initialized = true
    @resolved = true

  # Returns a boolean indicating if this class is an instance of the target class.
  # "target" is a ClassData object.
  # The ClassData objects do not need to be initialized; just loaded.
  is_castable: (target) -> @this_class == target.this_class

  box_class_name: ->
    switch @this_class
      when 'B' then 'Ljava/lang/Byte;'
      when 'C' then 'Ljava/lang/Character;'
      when 'D' then 'Ljava/lang/Double;'
      when 'F' then 'Ljava/lang/Float;'
      when 'I' then 'Ljava/lang/Integer;'
      when 'J' then 'Ljava/lang/Long;'
      when 'S' then 'Ljava/lang/Short;'
      when 'Z' then 'Ljava/lang/Boolean;'
      else throw new Error "Tried to box a non-primitive class: #{@this_class}"

  create_wrapper_object: (rs, value) ->
    box_name = @box_class_name()
    # these are all initialized in preinit (for the BSCL, at least)
    wrapped = new JavaObject rs, rs.get_bs_class(box_name)
    # HACK: all primitive wrappers store their value in a private static final field named 'value'
    wrapped.fields[box_name+'value'] = value
    return wrapped

class root.ArrayClassData extends ClassData
  constructor: (@component_type, loader) ->
    super loader
    @this_class = "[#{@component_type}"
    @super_class = 'Ljava/lang/Object;'

  reset: ->
    super()
    ccls = @get_component_class()
    if ccls?.reset_bit
      ccls.reset()
    return

  get_component_type: -> return @component_type
  get_component_class: -> return @component_class_cdata
  # This class itself has no fields/methods, but java/lang/Object does.
  field_lookup: (rs, name) -> @super_class_cdata.field_lookup rs, name
  method_lookup: (rs, sig) -> @super_class_cdata.method_lookup rs, sig

  # Resolved and initialized are the same for array types.
  set_resolved: (@super_class_cdata, @component_class_cdata) ->
    @resolved = true
    @initialized = true

  # Returns a boolean indicating if this class is an instance of the target class.
  # "target" is a ClassData object.
  # The ClassData objects do not need to be initialized; just loaded.
  # See §2.6.7 for casting rules.
  is_castable: (target) -> # target is c2
    unless target instanceof root.ArrayClassData
      return false if target instanceof root.PrimitiveClassData
      # Must be a reference type.
      if target.access_flags.interface
        # Interface reference type
        return target.get_type() in ['Ljava/lang/Cloneable;','Ljava/io/Serializable;']
      # Non-interface reference type
      return target.get_type() is 'Ljava/lang/Object;'

    # We are both array types, so it only matters if my component type can be
    # cast to its component type.
    return @get_component_class().is_castable(target.get_component_class())

# Represents a "reference" Class -- that is, a class that neither represents a
# primitive nor an array.
class root.ReferenceClassData extends ClassData
  constructor: (bytes_array, loader) ->
    # XXX: Circular dependency hack.
    unless methods?
      methods = require './methods'

    super loader

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
    @interfaces = (@constant_pool.get(bytes_array.get_uint 2).deref() for i in [0...isize] by 1)
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
    @ml_cache = {}
    # XXX: we may want to populate ml_cache with methods whose exception
    # handler classes we have already loaded
    for i in [0...num_methods] by 1
      m = new methods.Method(@)
      m.parse(bytes_array,@constant_pool,i)
      mkey = m.name + m.raw_descriptor
      @methods[mkey] = m
    # class attributes
    @attrs = attributes.make_attributes(bytes_array,@constant_pool)
    throw "Leftover bytes in classfile: #{bytes_array}" if bytes_array.has_bytes()

    # Contains the value of all static fields. Will be reset when reset()
    # is run.
    @static_fields = Object.create null

  # Resets the ClassData for subsequent JVM invocations. Resets all
  # of the built up state / caches present in the opcode instructions.
  # Eventually, this will also handle `clinit` duties.
  reset: ->
    super()
    @initialized = false
    @static_fields = Object.create null
    for method in @methods
      method.initialize()
    return

  get_interfaces: -> @interface_cdatas
  get_interface_types: -> @interfaces
  get_fields: -> @fields
  get_method: (sig) -> @methods[sig]
  get_methods: -> @methods
  get_attribute: (name) ->
    for attr in @attrs then if attr.name is name then return attr
    return null
  get_attributes: (name) -> attr for attr in @attrs when attr.name is name
  get_default_fields: ->
    return @default_fields unless @default_fields is undefined
    @construct_default_fields()
    return @default_fields

  # Handles static fields. We lazily create them, since we cannot initialize static
  # default String values before Ljava/lang/String; is initialized.
  _initialize_static_field: (rs, name) ->
    f = @fl_cache[name]
    if f?.access_flags.static
      cva = f.get_attribute 'ConstantValue'
      if cva?
        cv = if f.type is 'Ljava/lang/String;' then rs.init_string cva.value else cva.value
      @static_fields[name] = if cv? then cv else util.initial_value f.raw_descriptor
    else
      rs.java_throw @loader.get_initialized_class('Ljava/lang/NoSuchFieldError;'), name
    return
  static_get: (rs, name) ->
    return @static_fields[name] unless @static_fields[name] is undefined
    @_initialize_static_field rs, name
    return @static_get rs, name
  static_put: (rs, name, val) ->
    unless @static_fields[name] is undefined
      @static_fields[name] = val
    else
      @_initialize_static_field rs, name
      @static_put rs, name, val

  set_resolved: (@super_class_cdata, interface_cdatas) ->
    trace "Class #{@get_type()} is now resolved."
    @interface_cdatas = if interface_cdatas? then interface_cdatas else []
    @resolved = true

  construct_default_fields: () ->
    # init fields from this and inherited ClassDatas
    cls = @
    # Object.create(null) avoids interference with Object.prototype's properties
    @default_fields = Object.create null
    while cls?
      for f in cls.fields when not f.access_flags.static
        val = util.initial_value f.raw_descriptor
        @default_fields[cls.get_type() + f.name] = val
      cls = cls.get_super_class()
    return

  # Spec [5.4.3.2][1].
  # [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#77678
  field_lookup: (rs, name, null_handled) ->
    field = @fl_cache[name]
    return field if field?

    field = @_field_lookup(rs, name)
    if field? or null_handled is true
      @fl_cache[name] = field
      return field

    # Throw exception
    rs.java_throw rs.get_bs_class('Ljava/lang/NoSuchFieldError;'),
      "No such field found in #{util.ext_classname(@get_type())}::#{name}"

  _field_lookup: (rs, name) ->
    for field in @fields
      if field.name is name
        return field

    # These may not be initialized! But we have them loaded.
    for ifc_cls in @get_interfaces()
      field = ifc_cls.field_lookup(rs, name, true)
      return field if field?

    sc = @get_super_class()
    if sc?
      field = sc.field_lookup(rs, name, true)
      return field if field?
    return null

  # Spec [5.4.3.3][1], [5.4.3.4][2].
  # [1]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#79473
  # [2]: http://docs.oracle.com/javase/specs/jvms/se5.0/html/ConstantPool.doc.html#78621
  method_lookup: (rs, sig) ->
    return @ml_cache[sig] if @ml_cache[sig]?

    method = @_method_lookup(rs, sig)

    unless method?
      rs.java_throw rs.get_bs_class('Ljava/lang/NoSuchMethodError;'),
        "No such method found in #{util.ext_classname(@get_type())}::#{sig}"

    if (handlers = method.code?.exception_handlers)?
      for eh in handlers
        unless eh.catch_type is '<any>' or (@loader.get_resolved_class eh.catch_type, true)?
          return null # we found it, but it needs to be resolved

    method

  _method_lookup: (rs, sig) ->
    return @ml_cache[sig] if sig of @ml_cache

    if sig of @methods
      return @ml_cache[sig] = @methods[sig]

    parent = @get_super_class()
    if parent?
      @ml_cache[sig] = parent._method_lookup(rs, sig)
      return @ml_cache[sig] if @ml_cache[sig]?

    for ifc in @get_interfaces()
      @ml_cache[sig] = ifc._method_lookup(rs, sig)
      return @ml_cache[sig] if @ml_cache[sig]?

    return @ml_cache[sig] = null

  # this should only be called after method_lookup returns null!
  # in particular, we assume that the method exists and has exception handlers.
  resolve_method: (rs, sig, success_fn, failure_fn) ->
    trace "ASYNCHRONOUS: resolve_method #{sig}"
    m = @method_lookup(rs, sig)
    handlers = m.code.exception_handlers
    i = 0
    next_handler = =>
      if i == handlers.length
        success_fn(m)
      else
        eh = handlers[i++]
        unless eh.catch_type is '<any>' or @loader.get_resolved_class eh.catch_type, true
          @loader.resolve_class rs, eh.catch_type, next_handler, failure_fn
        else
          next_handler()
    next_handler()

  # Returns a boolean indicating if this class is an instance of the target class.
  # "target" is a ClassData object.
  # The ClassData objects do not need to be initialized; just loaded.
  # See §2.6.7 for casting rules.
  is_castable: (target) ->
    return false unless target instanceof root.ReferenceClassData

    if @access_flags.interface
      # We are both interfaces
      if target.access_flags.interface then return @is_subinterface(target)
      # Only I am an interface
      return target.get_type() is 'Ljava/lang/Object;' unless target.access_flags.interface
    else
      # I am a regular class, target is an interface
      if target.access_flags.interface then return @is_subinterface(target)
      # We are both regular classes
      return @is_subclass(target)

  # Returns 'true' if I implement the target interface.
  is_subinterface: (target) ->
    return true if @this_class is target.this_class
    for super_iface in @get_interfaces()
      return true if super_iface.is_subinterface target
    return false unless @get_super_class()?  # I'm java/lang/Object, can't go further
    return @get_super_class().is_subinterface target
