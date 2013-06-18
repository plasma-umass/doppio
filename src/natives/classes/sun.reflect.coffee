
# Used by invoke0 to handle manually setting up the caller's stack frame
setup_caller_stack = (rs, method, obj, params) ->
  rs.push obj unless method.access_flags.static
  # we don't get unboxing for free anymore, so we have to do it ourselves
  i = 0
  for p_type in method.param_types
    p = params.array[i++]
    if p_type in ['J','D']  # cat 2 primitives
      if p?.ref?
        primitive_value = p.get_field rs, p.cls.get_type()+'value'
        rs.push2 primitive_value, null
      else
        rs.push2 p, null
        i++  # skip past the null spacer
    else if util.is_primitive_type(p_type)  # any other primitive
      if p?.ref?
        primitive_value = p.get_field rs, p.cls.get_type()+'value'
        rs.push primitive_value
      else
        rs.push p
    else
      rs.push p
  return rs.curr_frame()


native_methods.sun.reflect =
  ConstantPool: [
    o 'getLongAt0(Ljava/lang/Object;I)J', (rs, _this, cp, idx) ->
        cp.get(idx).value
    o 'getUTF8At0(Ljava/lang/Object;I)Ljava/lang/String;', (rs, _this, cp, idx) ->
        rs.init_string cp.get(idx).value
  ]
  NativeMethodAccessorImpl: [
    o 'invoke0(Ljava/lang/reflect/Method;Ljava/lang/Object;[Ljava/lang/Object;)Ljava/lang/Object;', (rs,m,obj,params) ->
        cls = m.get_field rs, 'Ljava/lang/reflect/Method;clazz'

        # make the cleanup runner, before we branch too much
        ret_type = m.get_field rs, 'Ljava/lang/reflect/Method;returnType'
        ret_descriptor = ret_type.$cls.get_type()
        if util.is_primitive_type(ret_descriptor) and ret_descriptor != 'V'
          cleanup_runner = ->
            rv = if ret_descriptor in ['J','D'] then rs.pop2() else rs.pop()
            rs.meta_stack().pop()
            # wrap up primitives in their Object box
            rs.push ret_type.$cls.create_wrapper_object(rs, rv)
        else
          cleanup_runner = ->
            rv = rs.pop()
            rs.meta_stack().pop()
            rs.push rv

        # dispatch this sucka
        if cls.$cls.access_byte & 0x200  # cls is an interface, so we need to virtual dispatch
          cls_obj = rs.check_null(obj).cls
          name = m.get_field(rs, 'Ljava/lang/reflect/Method;name').jvm2js_str(rs)
          p_types = m.get_field rs, 'Ljava/lang/reflect/Method;parameterTypes'
          p_desc = (pt.$cls.get_type() for pt in p_types.array).join('')
          m_sig = "#{name}(#{p_desc})#{ret_descriptor}"
          method = cls_obj.method_lookup(rs, m_sig)
          caller_sf = setup_caller_stack(rs, method, obj, params)
          method.setup_stack(rs)
          caller_sf.runner = cleanup_runner
          throw exceptions.ReturnException
        else
          slot = m.get_field rs, 'Ljava/lang/reflect/Method;slot'
          rs.async_op (resume_cb, except_cb) ->
            cls.$cls.loader.initialize_class rs, cls.$cls.get_type(), ((cls_obj)->
              method = (method for sig, method of cls_obj.get_methods() when method.idx is slot)[0]
              caller_sf = setup_caller_stack(rs, method, obj, params)
              # Reenter the RuntimeState loop, which should run our new StackFrame.
              # XXX: We use except_cb because it just replaces the runner function of the
              # current frame. We need a better story for calling Java threads through
              # native functions.
              except_cb ->
                method.setup_stack(rs)
                caller_sf.runner = cleanup_runner
            ), except_cb
  ]
  NativeConstructorAccessorImpl: [
    o 'newInstance0(Ljava/lang/reflect/Constructor;[Ljava/lang/Object;)Ljava/lang/Object;', (rs,m,params) ->
        cls = m.get_field rs, 'Ljava/lang/reflect/Constructor;clazz'
        slot = m.get_field rs, 'Ljava/lang/reflect/Constructor;slot'
        rs.async_op (resume_cb, except_cb) ->
          cls.$cls.loader.initialize_class rs, cls.$cls.get_type(), ((cls_obj)->
            method = (method for sig, method of cls_obj.get_methods() when method.idx is slot)[0]
            my_sf = rs.curr_frame()
            obj = new JavaObject rs, cls_obj
            rs.push obj
            rs.push_array(params.array) if params?
            # Reenter the RuntimeState loop, which should run our new StackFrame.
            # XXX: We use except_cb because it just replaces the runner function of the
            # current frame. We need a better story for calling Java threads through
            # native functions.
            except_cb ->
              # Push the constructor's frame onto the stack.
              method.setup_stack(rs)
              # Overwrite my runner.
              my_sf.runner = ->
                rs.meta_stack().pop()
                rs.push obj
          ), except_cb
  ]
  Reflection: [
    o 'getCallerClass(I)Ljava/lang/Class;', (rs, frames_to_skip) ->
        caller = rs.meta_stack().get_caller(frames_to_skip)
        # Note: disregard frames associated with
        #   java.lang.reflect.Method.invoke() and its implementation.
        if caller.name.indexOf('Ljava/lang/reflect/Method;::invoke') is 0
          caller = rs.meta_stack().get_caller(frames_to_skip + 1)
        cls = caller.method.cls
        return cls.get_class_object(rs)
    o 'getClassAccessFlags(Ljava/lang/Class;)I', (rs, class_obj) ->
        class_obj.$cls.access_byte
  ]
