native_methods.java.lang.Class = [
  o 'getPrimitiveClass(L!/!/String;)L!/!/!;', (rs, jvm_str) ->
      type_desc = util.typestr2descriptor jvm_str.jvm2js_str()
      prim_cls = rs.get_bs_class type_desc
      return prim_cls.get_class_object(rs)
  o 'getClassLoader0()L!/!/ClassLoader;', (rs, _this) ->
      # The bootstrap classloader is represented as 'null', which is OK
      # according to the spec.
      loader = _this.$cls.loader
      return loader.loader_obj if loader.loader_obj?
      return null
  o 'desiredAssertionStatus0(L!/!/!;)Z', (rs) -> false # we don't need no stinkin asserts
  o 'getName0()L!/!/String;', (rs, _this) ->
      rs.init_string(_this.$cls.toExternalString())
  o 'forName0(L!/!/String;ZL!/!/ClassLoader;)L!/!/!;', (rs, jvm_str, initialize, loader) ->
      classname = util.int_classname jvm_str.jvm2js_str()
      unless util.verify_int_classname classname
        rs.java_throw rs.get_bs_class('Ljava/lang/ClassNotFoundException;'), classname
      loader = get_cl_from_jclo rs, loader
      rs.async_op (resume_cb, except_cb) ->
        if initialize
          loader.initialize_class rs, classname, ((cls) ->
            resume_cb cls.get_class_object(rs)
          ), except_cb, true
        else
          loader.resolve_class rs, classname, ((cls) ->
            resume_cb cls.get_class_object(rs)
          ), except_cb, true
      return
  o 'getComponentType()L!/!/!;', (rs, _this) ->
      return null unless (_this.$cls instanceof ArrayClassData)

      # As this array type is loaded, the component type is guaranteed
      # to be loaded as well. No need for asynchronicity.
      return _this.$cls.get_component_class().get_class_object(rs)
  o 'getGenericSignature()Ljava/lang/String;', (rs, _this) ->
      sig = _this.$cls.get_attribute('Signature')?.sig
      if sig? then rs.init_string sig else null
  o 'getProtectionDomain0()Ljava/security/ProtectionDomain;', (rs, _this) -> null
  o 'isAssignableFrom(L!/!/!;)Z', (rs, _this, cls) ->
      cls.$cls.is_castable _this.$cls
  o 'isInterface()Z', (rs, _this) ->
      return false unless _this.$cls instanceof ReferenceClassData
      _this.$cls.access_flags.interface
  o 'isInstance(L!/!/Object;)Z', (rs, _this, obj) ->
      obj.cls.is_castable _this.$cls
  o 'isPrimitive()Z', (rs, _this) ->
      _this.$cls instanceof PrimitiveClassData
  o 'isArray()Z', (rs, _this) ->
      _this.$cls instanceof ArrayClassData
  o 'getSuperclass()L!/!/!;', (rs, _this) ->
      return null if _this.$cls instanceof PrimitiveClassData
      cls = _this.$cls
      if cls.access_flags.interface or not cls.get_super_class()?
        return null
      return cls.get_super_class().get_class_object(rs)
  o 'getDeclaredFields0(Z)[Ljava/lang/reflect/Field;', (rs, _this, public_only) ->
      fields = _this.$cls.get_fields()
      fields = (f for f in fields when f.access_flags.public) if public_only
      base_array = []
      rs.async_op (resume_cb, except_cb) ->
        i = -1
        fetch_next_field = () ->
          i++
          if i < fields.length
            f = fields[i]
            f.reflector(rs, ((jco)->base_array.push(jco); fetch_next_field()), except_cb)
          else
            resume_cb new JavaArray(rs, rs.get_bs_class('[Ljava/lang/reflect/Field;'), base_array)

        fetch_next_field()
      return
  o 'getDeclaredMethods0(Z)[Ljava/lang/reflect/Method;', (rs, _this, public_only) ->
      methods = _this.$cls.get_methods()
      methods = (m for sig, m of methods when sig[0] != '<' and (m.access_flags.public or not public_only))

      base_array = []
      rs.async_op (resume_cb, except_cb) ->
        i = -1
        fetch_next_method = () ->
          i++
          if i < methods.length
            m = methods[i]
            m.reflector(rs, false, ((jco)->base_array.push(jco); fetch_next_method()), except_cb)
          else
            resume_cb new JavaArray(rs, rs.get_bs_class('[Ljava/lang/reflect/Method;'), base_array)

        fetch_next_method()
      return
  o 'getDeclaredConstructors0(Z)[Ljava/lang/reflect/Constructor;', (rs, _this, public_only) ->
      methods = _this.$cls.get_methods()
      methods = (m for sig, m of methods when m.name is '<init>')
      methods = (m for m in methods when m.access_flags.public) if public_only
      ctor_array_cdata = rs.get_bs_class('[Ljava/lang/reflect/Constructor;')
      base_array = []
      rs.async_op (resume_cb, except_cb) ->
        i = -1
        fetch_next_method = () ->
          i++
          if i < methods.length
            m = methods[i]
            m.reflector(rs, true, ((jco)->base_array.push(jco); fetch_next_method()), except_cb)
          else
            resume_cb new JavaArray(rs, ctor_array_cdata, base_array)

        fetch_next_method()
      return
  o 'getInterfaces()[L!/!/!;', (rs, _this) ->
      cls = _this.$cls
      ifaces = cls.get_interfaces()
      iface_objs = (iface.get_class_object(rs) for iface in ifaces)
      new JavaArray rs, rs.get_bs_class('[Ljava/lang/Class;'), iface_objs
  o 'getModifiers()I', (rs, _this) -> _this.$cls.access_byte
  o 'getRawAnnotations()[B', (rs, _this) ->
      cls = _this.$cls
      annotations = cls.get_attribute 'RuntimeVisibleAnnotations'
      return new JavaArray rs, rs.get_bs_class('[B'), annotations.raw_bytes if annotations?
      for sig,m of cls.get_methods()
        annotations = m.get_attribute 'RuntimeVisibleAnnotations'
        return new JavaArray rs, rs.get_bs_class('[B'), annotations.raw_bytes if annotations?
      null
  o 'getConstantPool()Lsun/reflect/ConstantPool;', (rs, _this) ->
      cls = _this.$cls
      new JavaObject rs, rs.get_bs_class('Lsun/reflect/ConstantPool;'), {'Lsun/reflect/ConstantPool;constantPoolOop': cls.constant_pool}
  o 'getEnclosingMethod0()[L!/!/Object;', (rs, _this) ->
      return null unless _this.$cls instanceof ReferenceClassData
      cls = _this.$cls
      em = cls.get_attribute 'EnclosingMethod'
      return null unless em?
      enc_cls = cls.loader.get_resolved_class(em.enc_class).get_class_object(rs)
      if em.enc_method?
        enc_name = rs.init_string(em.enc_method.name)
        enc_desc = rs.init_string(em.enc_method.type)
      else
        enc_name = null
        enc_desc = null
      # array w/ 3 elements:
      # - the immediately enclosing class (java/lang/Class)
      # - the immediately enclosing method or constructor's name (can be null). (String)
      # - the immediately enclosing method or constructor's descriptor (null iff name is). (String)
      new JavaArray rs, rs.get_bs_class('[Ljava/lang/Object;'), [enc_cls, enc_name, enc_desc]
  o 'getDeclaringClass()L!/!/!;', (rs, _this) ->
      return null unless _this.$cls instanceof ReferenceClassData
      cls = _this.$cls
      icls = cls.get_attribute 'InnerClasses'
      return null unless icls?
      my_class = _this.$cls.get_type()
      for entry in icls.classes when entry.outer_info_index > 0
        name = cls.constant_pool.get(entry.inner_info_index).deref()
        continue unless name is my_class
        # XXX(jez): this assumes that the first enclosing entry is also
        # the immediate enclosing parent, and I'm not 100% sure this is
        # guaranteed by the spec
        declaring_name = cls.constant_pool.get(entry.outer_info_index).deref()
        return cls.loader.get_resolved_class(declaring_name).get_class_object(rs)
      return null
  o 'getDeclaredClasses0()[L!/!/!;', (rs, _this) ->
      ret = new JavaArray rs, rs.get_bs_class('[Ljava/lang/Class;'), []
      return ret unless _this.$cls instanceof ReferenceClassData
      cls = _this.$cls
      my_class = _this.$cls.get_type()
      iclses = cls.get_attributes 'InnerClasses'
      return ret if iclses.length is 0
      flat_names = []
      for icls in iclses
        for c in icls.classes when c.outer_info_index > 0
          enclosing_name = cls.constant_pool.get(c.outer_info_index).deref()
          continue unless enclosing_name is my_class
          flat_names.push cls.constant_pool.get(c.inner_info_index).deref()
      rs.async_op (resume_cb, except_cb) ->
        i = -1
        fetch_next_jco = () ->
          i++
          if i < flat_names.length
            name = flat_names[i]
            cls.loader.resolve_class(rs, name, ((cls)->ret.array.push cls.get_class_object(rs); fetch_next_jco()), except_cb)
          else
            resume_cb ret
        fetch_next_jco()
      return
]
