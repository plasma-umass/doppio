
array_get = (rs, arr, idx) ->
  array = rs.check_null(arr).array
  unless 0 <= idx < array.length
    err_cls = rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;')
    rs.java_throw err_cls, 'Tried to access an illegal index in an array.'
  array[idx]

native_methods.java.lang.reflect =
  Array: [
    o 'multiNewArray(L!/!/Class;[I)L!/!/Object;', (rs, jco, lens) ->
        counts = lens.array
        cls = rs.get_class jco.$cls.get_type(), true
        unless cls?
          rs.async_op (resume_cb, except_cb) =>
            rs.get_cl().initialize_class rs, jco.$cls.get_type(), ((cls)->
              type_str = (new Array(counts.length+1)).join('[') + cls.get_type()
              rs.heap_multinewarray(type_str, counts)
              resume_cb()
            ), except_cb
          return
        type_str = (new Array(counts.length+1)).join('[') + cls.get_type()
        return rs.heap_multinewarray(type_str, counts)
    o 'newArray(L!/!/Class;I)L!/!/Object;', (rs, jco, len) ->
        rs.heap_newarray jco.$cls.get_type(), len
    o 'getLength(Ljava/lang/Object;)I', (rs, arr) ->
        rs.check_null(arr).array.length
    o 'getBoolean(Ljava/lang/Object;I)Z', array_get
    o 'getByte(Ljava/lang/Object;I)B', array_get
    o 'getChar(Ljava/lang/Object;I)C', array_get
    o 'getDouble(Ljava/lang/Object;I)D', array_get
    o 'getFloat(Ljava/lang/Object;I)F', array_get
    o 'getInt(Ljava/lang/Object;I)I', array_get
    o 'getLong(Ljava/lang/Object;I)J', array_get
    o 'getShort(Ljava/lang/Object;I)S', array_get
    o 'get(Ljava/lang/Object;I)Ljava/lang/Object;', (rs, arr, idx) ->
        val = array_get(rs, arr, idx)
        # Box primitive values (fast check: prims don't have .ref attributes).
        unless val.ref?
          return arr.cls.get_component_class().create_wrapper_object(rs, val)
        val
    o 'set(Ljava/lang/Object;ILjava/lang/Object;)V', (rs, arr, idx, val) ->
        my_sf = rs.curr_frame()
        array = rs.check_null(arr).array

        unless 0 <= idx < array.length
          rs.java_throw rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;'), 'Tried to write to an illegal index in an array.'

        if (ccls = arr.cls.get_component_class()) instanceof PrimitiveClassData
          if val.cls.is_subclass rs.get_bs_class ccls.box_class_name()
            ccname = ccls.get_type()
            m = val.cls.method_lookup(rs, "#{util.internal2external[ccname]}Value()#{ccname}")
            rs.push val
            m.setup_stack rs
            my_sf.runner = ->
              array[idx] = if ccname in ['J', 'D'] then rs.pop2() else rs.pop()
              rs.meta_stack().pop()
            throw exceptions.ReturnException
        else if val.cls.is_subclass ccls
          array[idx] = val
          return

        illegal_exc = 'Ljava/lang/IllegalArgumentException;'
        if (ecls = rs.get_bs_class(illegal_exc, true))?
          rs.java_throw ecls, 'argument type mismatch'
        else
          rs.async_op (resume_cb, except_cb) ->
            rs.get_cl().initialize_class rs, illegal_exc,
              ((ecls) -> except_cb (-> rs.java_throw ecls, 'argument type mismatch')), except_cb
  ]
  Proxy: [
    o 'defineClass0(L!/!/ClassLoader;L!/!/String;[BII)L!/!/Class;', (rs,cl,name,bytes,offset,len) ->
        rs.async_op (success_cb, except_cb) ->
          native_define_class rs, name, bytes, offset, len, get_cl_from_jclo(rs, cl), success_cb, except_cb
  ]
