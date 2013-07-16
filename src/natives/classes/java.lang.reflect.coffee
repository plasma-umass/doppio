
native_methods.java.lang.reflect =
  Array: [
    o 'multiNewArray(L!/!/Class;[I)L!/!/Object;', (rs, jco, lens) ->
        counts = lens.array
        cls = rs.get_class jco.$cls.get_type(), true
        unless cls?
          rs.async_op (resume_cb, except_cb) =>
            rs.get_cl().initialize_class rs, jco.$cls.get_type(), ((cls)->
              type_str = (new Array(counts.length+1)).join('[') + cls.get_type()
              rs.heap_multinewarray(cls, counts)
              resume_cb()
            ), except_cb
          return
        type_str = (new Array(counts.length+1)).join('[') + cls.get_type()
        return rs.heap_multinewarray(type_str, counts)
    o 'newArray(L!/!/Class;I)L!/!/Object;', (rs, jco, len) ->
        rs.heap_newarray jco.$cls.get_type(), len
    o 'getLength(Ljava/lang/Object;)I', (rs, arr) ->
        rs.check_null(arr).array.length
    o 'set(Ljava/lang/Object;ILjava/lang/Object;)V', (rs, arr, idx, val) ->
        my_sf = rs.curr_frame()
        array = rs.check_null(arr).array

        unless idx < array.length
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
