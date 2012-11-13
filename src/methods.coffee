
# pull in external modules
_ = require '../vendor/_.js'
gLong = require '../vendor/gLong.js'
util = require './util'
opcodes = require './opcodes'
attributes = require './attributes'
disassembler = require './disassembler'
types = require './types'
natives = require './natives'
runtime = require './runtime'
logging = require './logging'
{vtrace,trace,debug_vars} = logging
{java_throw} = require './exceptions'
{opcode_annotators} = disassembler
{str2type,carr2type,c2t} = types
{native_methods,trapped_methods} = natives

"use strict"

# things assigned to root will be available outside this module
root = exports ? this.methods = {}

class AbstractMethodField
  # Subclasses need to implement parse_descriptor(String)
  constructor: (@class_type) ->

  parse: (bytes_array,constant_pool,@idx) ->
    @access_byte = bytes_array.get_uint 2
    @access_flags = util.parse_flags @access_byte
    @name = constant_pool.get(bytes_array.get_uint 2).value
    @raw_descriptor = constant_pool.get(bytes_array.get_uint 2).value
    @parse_descriptor @raw_descriptor
    @attrs = attributes.make_attributes(bytes_array,constant_pool)
    @code = _.find(@attrs, (a) -> a.constructor.name == "Code")

class root.Field extends AbstractMethodField
  parse_descriptor: (raw_descriptor) ->
    @type = str2type raw_descriptor

  reflector: (rs) ->
    rs.init_object 'java/lang/reflect/Field', {
      # XXX this leaves out 'annotations'
      clazz: rs.class_lookup(@class_type,true)
      name: rs.init_string @name, true
      type: rs.class_lookup @type, true
      modifiers: @access_byte
      slot: @idx
      signature: rs.init_string @raw_descriptor
    }

class root.Method extends AbstractMethodField
  parse_descriptor: (raw_descriptor) ->
    [__,param_str,return_str] = /\(([^)]*)\)(.*)/.exec(raw_descriptor)
    param_carr = param_str.split ''
    @param_types = (field while (field = carr2type param_carr))
    @param_bytes = 0
    for p in @param_types
      @param_bytes += if p.toString() in ['D','J'] then 2 else 1
    @param_bytes++ unless @access_flags.static
    @num_args = @param_types.length
    @num_args++ unless @access_flags.static # nonstatic methods get 'this'
    @return_type = str2type return_str

  full_signature: -> "#{@class_type.toClassString()}::#{@name}#{@raw_descriptor}"

  reflector: (rs, is_constructor=false) ->
    typestr = if is_constructor then 'java/lang/reflect/Constructor' else 'java/lang/reflect/Method'
    rs.init_object typestr, {
      # XXX: missing checkedExceptions, annotations, parameterAnnotations, annotationDefault
      clazz: rs.class_lookup(@class_type, true)
      name: rs.init_string @name, true
      parameterTypes: rs.init_object "[Ljava/lang/Class;", (rs.class_lookup(f,true) for f in @param_types)
      returnType: rs.class_lookup @return_type, true
      modifiers: @access_byte
      slot: @idx
      signature: rs.init_string @raw_descriptor
    }

  take_params: (caller_stack) ->
    params = new Array @param_bytes
    start = caller_stack.length - @param_bytes
    for i in [0...@param_bytes] by 1
      params[i] = caller_stack[start + i]
    # this is faster than splice()
    caller_stack.length -= @param_bytes
    params

  run_manually: (func, rs) ->
    params = rs.curr_frame().locals.slice(0) # make a copy
    converted_params = []
    if not @access_flags.static
      converted_params.push params.shift()
    param_idx = 0
    for p in @param_types
      converted_params.push params[param_idx]
      param_idx += if (p.toString() in ['J', 'D']) then 2 else 1
    try
      rv = func rs, converted_params...
    catch e
      e.method_catch_handler?(rs, @)  # handles stack pop, if it's a JavaException
      throw e
    rs.meta_stack().pop()
    ret_type = @return_type.toString()
    unless ret_type == 'V'
      if ret_type == 'Z' then rs.push rv + 0 # cast booleans to a Number
      else rs.push rv
      rs.push null if ret_type in [ 'J', 'D' ]

  run_bytecode: (rs, padding) ->
    # main eval loop: execute each opcode, using the pc to iterate through
    code = @code.opcodes
    cf = rs.curr_frame()
    `var v1, v2, v3, v4`
    pc = cf.pc
    while true
      op = code[pc]
      unless RELEASE? or logging.log_level < logging.STRACE
        throw "#{@name}:#{pc} => (null)" unless op
        vtrace "#{padding}stack: [#{debug_vars cf.stack}], local: [#{debug_vars cf.locals}]"
        annotation =
          util.call_handler(opcode_annotators, op, pc, rs.class_lookup(@class_type).constant_pool) or ""
        vtrace "#{padding}#{@class_type.toClassString()}::#{@name}:#{pc} => #{op.name}" + annotation

      `
      var pushFnName = 'push2';
      var popValue = undefined;
      switch(op.name) {
        case 'nop':
          break;
        case 'aconst_null':
          rs.push(null);
          break;
        case 'iconst_m1':
          rs.push(-1);
          break;
        case 'iconst_0':
          rs.push(0);
          break;
        case 'iconst_1':
          rs.push(1);
          break;
        case 'iconst_2':
          rs.push(2);
          break;
        case 'iconst_3':
          rs.push(3);
          break;
        case 'iconst_4':
          rs.push(4);
          break;
        case 'iconst_5':
          rs.push(5);
          break;
        case 'lconst_0':
          rs.push2(gLong.ZERO)
          break;
        case 'lconst_1':
          rs.push2(gLong.ONE)
          break;
        case 'fconst_0':
          rs.push(0);
          break;
        case 'fconst_1':
          rs.push(1);
          break;
        case 'fconst_2':
          rs.push(2);
          break;
        case 'dconst_0':
          rs.push2(0);
          break;
        case 'dconst_1':
          rs.push2(1);
          break;
        case 'sipush':
          pc++;
        case 'bipush':
          pc++;
          rs.push(op.value);
          break;
        case 'ldc_w':
          pc++;
        case 'ldc':
          pc++;
          switch (op.constant.type) {
            case 'String':
              rs.push(rs.init_string(op.str_constant.value, true));
              break;
            case 'class':
              rs.push(rs.class_lookup(c2t(op.str_constant.value), true));
              break;
            default:
              rs.push(op.constant.value);
          }
          break;
        case 'ldc2_w':
          rs.push2(op.constant.value);
          pc += 2;
          break;
        case 'iload':
        case 'fload':
        case 'aload':
          pc++;
        case 'iload_0':
        case 'iload_1':
        case 'iload_2':
        case 'iload_3':
        case 'fload_0':
        case 'fload_1':
        case 'fload_2':
        case 'fload_3':
        case 'aload_0':
        case 'aload_1':
        case 'aload_2':
        case 'aload_3':
          rs.push(rs.cl(op.var_num));
          break;
        case 'lload':
        case 'dload':
          pc++;
        case 'lload_0':
        case 'lload_1':
        case 'lload_2':
        case 'lload_3':
        case 'dload_0':
        case 'dload_1':
        case 'dload_2':
        case 'dload_3':
          rs.push2(rs.cl(op.var_num));
          break;
        case 'iaload':
        case 'faload':
        case 'aaload':
        case 'saload':
        case 'caload':
          pushFnName = 'push';
        case 'laload':
        case 'daload':
          var idx = rs.pop();
          var obj = rs.check_null(rs.pop());
          var array = obj.array;
          if (!(0 <= idx && idx < array.length))
            java_throw(rs, 'java/lang/ArrayIndexOutOfBoundsException',
              "#{idx} not in length #{array.length} array of type #{obj.type.toClassString()}");
          rs[pushFnName](array[idx]);
          break;
        case 'istore':
        case 'fstore':
        case 'astore':
          pc++;
        case 'istore_0':
        case 'istore_1':
        case 'istore_2':
        case 'istore_3':
        case 'fstore_0':
        case 'fstore_1':
        case 'fstore_2':
        case 'fstore_3':
        case 'astore_0':
        case 'astore_1':
        case 'astore_2':
        case 'astore_3':
          rs.put_cl(op.var_num, rs.pop());
          break;
        case 'lstore':
        case 'dstore':
          pc++;
        case 'lstore_0':
        case 'lstore_1':
        case 'lstore_2':
        case 'lstore_3':
        case 'dstore_0':
        case 'dstore_1':
        case 'dstore_2':
        case 'dstore_3':
          rs.put_cl2(op.var_num, rs.pop2());
          break;
        case 'iastore':
        case 'fastore':
        case 'aastore':
        case 'bastore':
        case 'castore':
        case 'sastore':
          popValue = rs.pop();
        case 'lastore':
        case 'dastore':
          if (popValue === undefined) popValue = rs.pop2();
          var idx = rs.pop();
          var obj = rs.check_null(rs.pop());
          var array = obj.array;
          if (!(0 <= idx) && idx < array.length)
            java_throw(rs, 'java/lang/ArrayIndexOutOfBoundsException',
              "#{idx} not in length #{array.length} array of type #{obj.type.toClassString()}")
          array[idx] = popValue;
          break;
        case 'pop':
          rs.pop();
          break;
        case 'pop2':
          rs.pop2();
          break;
        case 'dup':
          v1 = rs.pop();
          rs.push_array([v1,v1]);
          break;
        case 'dup_x1':
          v1 = rs.pop();
          v2 = rs.pop();
          rs.push_array([v1,v2,v1]);
          break;
        case 'dup_x2':
          v1 = rs.pop();
          v2 = rs.pop();
          v3 = rs.pop();
          rs.push_array([v1,v3,v2,v1]);
          break;
        case 'dup2':
          v1 = rs.pop();
          v2 = rs.pop();
          rs.push_array([v2,v1,v2,v1]);
          break;
        case 'dup2_x1':
          v1 = rs.pop();
          v2 = rs.pop();
          v3 = rs.pop();
          rs.push_array([v2,v1,v3,v2,v1]);
          break;
        case 'dup2_x2':
          v1 = rs.pop();
          v2 = rs.pop();
          v3 = rs.pop();
          v4 = rs.pop();
          rs.push_array([v2,v1,v4,v3,v2,v1]);
          break;
        case 'swap':
          v1 = rs.pop();
          v2 = rs.pop();
          rs.push_array([v1,v2]);
          break;
        case 'iadd':
          rs.push(util.wrap_int(rs.pop()+rs.pop()));
          break;
        case 'ladd':
          rs.push2(rs.pop2().add(rs.pop2()));
          break;
        case 'fadd':
          rs.push(util.wrap_float(rs.pop()+rs.pop()));
          break;
        case 'dadd':
          rs.push2(rs.pop2()+rs.pop2());
          break;
        case 'isub':
          rs.push(util.wrap_int(-rs.pop()+rs.pop()));
          break;
        case 'lsub':
          v1 = rs.pop2();
          rs.push2(rs.pop2().subtract(v1));
          break;
        case 'fsub':
          rs.push(util.wrap_float(-rs.pop()+rs.pop()));
          break;
        case 'dsub':
          rs.push2(-rs.pop2()+rs.pop2());
          break;
        case 'imul':
          rs.push(gLong.fromInt(rs.pop()).multiply(gLong.fromInt(rs.pop())).toInt());
          break;
        case 'lmul':
          rs.push2(rs.pop2().multiply(rs.pop2()));
          break;
        case 'fmul':
          rs.push(util.wrap_float(rs.pop()*rs.pop()));
          break;
        case 'dmul':
          rs.push2(rs.pop2()*rs.pop2());
          break;
        case 'idiv':
          v1 = rs.pop();
          rs.push(util.int_div(rs, rs.pop(), v));
          break;
        case 'ldiv':
          v1 = rs.pop2();
          rs.push2(util.long_div(rs, rs.pop2(), v));
          break;
        case 'fdiv':
          v1 = rs.pop();
          rs.push(util.wrap_float(rs.pop()/v1));
          break;
        case 'ddiv':
          v1 = rs.pop2();
          rs.push2(rs.pop2()/v1);
          break;
        case 'irem':
          v1 = rs.pop();
          rs.push(util.int_mod(rs,rs.pop(),v1));
          break;
        case 'lrem':
          v1 = rs.pop2();
          rs.push2(util.long_mod(rs,rs.pop2(),v1));
          break;
        case 'frem':
          v1 = rs.pop();
          rs.push(rs.pop() % v1);
          break;
        case 'drem':
          v1 = rs.pop2();
          rs.push2(rs.pop2() % v1);
          break;
        case 'ineg':
          v1 = rs.pop()
          if (v1 === util.INT_MIN) rs.push(v1);
          else rs.push(-v1);
          break;
        case 'lneg':
          rs.push2(rs.pop2().negate());
          break;
        case 'fneg':
          rs.push(-rs.pop());
          break;
        case 'dneg':
          rs.push2(-rs.pop2());
          break;
        case 'ishl':
          v1=rs.pop()&0x1F;
          rs.push(rs.pop()<<v1);
          break;
        case 'lshl':
          v1=rs.pop2()&0x3F;
          rs.push2(rs.pop2().shiftLeft(gLong.fromInt(v1)));
          break;
        case 'ishr':
          v1=rs.pop()&0x1F;
          rs.push(rs.pop()>>v1);
          break;
        case 'lshr':
          v1=rs.pop2()&0x3F;
          rs.push2(rs.pop2().shiftRight(gLong.fromInt(v1)));
          break;
        case 'iushr':
          v1=rs.pop()&0x1F;
          rs.push(rs.pop()>>>v1);
          break;
        case 'lushr':
          v1=rs.pop2()&0x1F;
          rs.push2(rs.pop2().shiftRightUnsigned(gLong.fromInt(v1)));
          break;
        case 'iand':
          rs.push(rs.pop() & rs.pop());
          break;
        case 'land':
          rs.push2(rs.pop2().and(rs.pop2()));
          break;
        case 'ior':
          rs.push(rs.pop() | rs.pop());
          break;
        case 'lor':
          rs.push2(rs.pop2().or(rs.pop2()));
          break;
        case 'ixor':
          rs.push(rs.pop() ^ rs.pop());
          break;
        case 'lxor':
          rs.push2(rs.pop2().xor(rs.pop2()));
          break;
        case 'iinc':
          v1 = rs.cl(op.index) + op.const;
          rs.put_cl(op.index, util.wrap_int(v1));
          pc += 2;
          break;
        case 'i2l':
          rs.push2(gLong.fromInt(rs.pop()));
          break;
        case 'i2f':
          break;
        case 'i2d':
          rs.push(null);
          break;
        case 'l2i':
          rs.push(rs.pop2().toInt());
          break;
        case 'l2f':
          rs.push(rs.pop2().toNumber());
          break;
        case 'l2d':
          rs.push2(rs.pop2().toNumber());
          break;
        case 'f2i':
          rs.push(util.float2int(rs.pop()));
          break;
        case 'f2l':
          rs.push2(gLong.fromNumber(rs.pop()));
          break;
        case 'f2d':
          rs.push(null);
          break;
        case 'd2i':
          rs.push(util.float2int(rs.pop2()));
          break;
        case 'd2l':
          v1 = rs.pop2();
          if (v1 === Number.POSITIVE_INFINITY) rs.push2(gLong.MAX_VALUE);
          else if (v1 === Number.NEGATIVE_INFINITY) rs.push2(gLong.MIN_VALUE);
          else rs.push2(gLong.fromNumber(v1));
          break;
        case 'd2f':
          rs.push(util.wrap_float(rs.pop2()));
          break;
        case 'i2b':
          rs.push(util.truncate(rs.pop(), 8));
          break;
        case 'i2c':
          rs.push(rs.pop()&0xffff);
          break;
        case 'i2s':
          rs.push(util.truncate(rs.pop(), 16));
          break;
        case 'lcmp':
          v1 = rs.pop2();
          rs.push(rs.pop2().compare(v1));
          break;
        case 'fcmpl':
          v1 = rs.pop();
          v2 = util.cmp(rs.pop(),v1);
          if (v2 === null) rs.push(-1);
          else rs.push(v2);
          break;
        case 'fcmpg':
          v1 = rs.pop();
          v2 = util.cmp(rs.pop(),v1);
          if (v2 === null) rs.push(1);
          else rs.push(v2);
          break;
        case 'dcmpl':
          v1 = rs.pop2();
          v2 = util.cmp(rs.pop2(),v1);
          if (v2 === null) rs.push(-1);
          else rs.push(v2);
          break;
        case 'dcmpl':
          v1 = rs.pop2();
          v2 = util.cmp(rs.pop2(),v1);
          if (v2 === null) rs.push(1);
          else rs.push(v2);
          break;
        case 'ifeq':
          pc += rs.pop() === 0 ? op.offset : 3;
          continue;
        case 'ifne':
          pc += rs.pop() !== 0 ? op.offset : 3;
          continue;
        case 'iflt':
          pc += rs.pop() < 0 ? op.offset : 3;
          continue;
        case 'ifge':
          pc += rs.pop() >= 0 ? op.offset : 3;
          continue;
        case 'ifgt':
          pc += rs.pop() > 0 ? op.offset : 3;
          continue;
        case 'ifle':
          pc += rs.pop() <= 0 ? op.offset : 3;
          continue;
        case 'if_icmpeq':
        case 'if_acmpeq':
          pc += rs.pop() === rs.pop() ? op.offset : 3;
          continue;
        case 'if_icmpne':
        case 'if_acmpne': // maybe split this up so call is monomorphic?
          pc += rs.pop() !== rs.pop() ? op.offset : 3;
          continue;
        case 'if_icmplt':
          v1 = rs.pop();
          pc += rs.pop() < v1 ? op.offset : 3;
          continue;
        case 'if_icmpge':
          v1 = rs.pop();
          pc += rs.pop() >= v1 ? op.offset : 3;
          continue;
        case 'if_icmpgt':
          v1 = rs.pop();
          pc += rs.pop() > v1 ? op.offset : 3;
          continue;
        case 'if_icmple':
          v1 = rs.pop();
          pc += rs.pop() <= v1 ? op.offset : 3;
          continue;
        case 'goto':
          pc += op.offset;
          continue;
        case 'jsr':
          rs.push(pc+3);
          pc += op.offset;
          continue;
        case 'ret':
          pc += rs.cl(op.args[0]);
          continue;
        case 'tableswitch':
        case 'lookupswitch':
          throw 'NYI';
          break;
        case 'ireturn':
        case 'freturn':
        case 'areturn':
          var cf = rs.meta_stack().pop();
          //vtrace("#{padding}stack: [#{debug_vars cf.stack}],\nlocal: [#{debug_vars cf.locals}] (end method #{method.class_type.toClassString()}::#{method.name})")
          rs.push(cf.stack[0]);
          return;
        case 'lreturn':
        case 'dreturn':
          var cf = rs.meta_stack().pop();
          //vtrace("#{padding}stack: [#{debug_vars cf.stack}],\nlocal: [#{debug_vars cf.locals}] (end method #{method.class_type.toClassString()}::#{method.name})")
          rs.push2(cf.stack[0]);
          return;
        case 'return':
          rs.meta_stack().pop();
          return;
        case 'getstatic':
          rs.push(rs.static_get(op.field_spec));
          if (op.field_spec.type in {J:1, D:1}) rs.push(null);
          pc += 2;
          break;
        case 'putstatic':
          rs.static_put(op.field_spec);
          pc += 2;
          break;
        case 'getfield':
          rs.heap_get(op.field_spec, rs.pop());
          pc += 2;
          break;
        case 'putfield':
          rs.heap_put(op.field_spec);
          pc += 2;
          break;
        case 'invokeinterface':
          pc += 2;
        case 'invokevirtual':
          rs.method_lookup(op.method_spec).run(rs, true);
          pc += 2;
          break;
        case 'invokespecial':
        case 'invokestatic':
          rs.method_lookup(op.method_spec).run(rs);
          pc += 2;
          break;
        case 'new':
          rs.push(rs.init_object(op.class));
          pc += 2;
          break;
        case 'newarray':
          rs.push(rs.heap_newarray(op.element_type, rs.pop()));
          pc++;
          break;
        case 'anewarray':
          rs.push(rs.heap_newarray('L' + op.class + ';',rs.pop()));
          pc += 2;
          break;
        case 'arraylength':
          rs.push(rs.check_null(rs.pop()).array.length);
          break;
        case 'athrow':
          return new JavaException(rs.pop());
        case 'checkcast':
          v1 = rs.pop();
          if (v1 === null || types.check_cast(rs,v1,op.class)) {
            rs.push(v1);
            pc += 2;
            break;
          } else {
            var target_class = c2t(op.class).toExternalString(); // class we wish to cast to
            var candidate_class = v1.type.toExternalString();
            java_throw(rs, 'java/lang/ClassCastException', candidate_class + " cannot be cast to " + target_class);
          }
        case 'instanceof':
          v1 = rs.pop();
          if (v1 === null) rs.push(0);
          else rs.push(types.check_cast(rs,v1,op.class)+0);
          pc += 2;
          break;
        case 'monitorenter':
          var monitor = rs.pop();
          var locked_thread = rs.lock_refs[monitor];
          if (locked_thread != null) {
            if (locked_thread === rs.curr_thread)
              rs.lock_counts[monitor]++;  // increment lock counter, to only unlock at zero
            else
              rs.wait(monitor);
          }
          else { // this lock not held by any thread
            rs.lock_refs[monitor] = rs.curr_thread;
            rs.lock_counts[monitor] = 1;
          }
          break;
        case 'monitorexit':
          var monitor = rs.pop();
          var locked_thread = rs.lock_refs[monitor];
          if (locked_thread != null && locked_thread === rs.curr_thread) {
            rs.lock_counts[monitor]--;
            if (rs.lock_counts[monitor] === 0)
              delete rs.lock_refs[monitor];
            break;
          } else
            java_throw(rs, 'java/lang/IllegalMonitorStateException', "Tried to monitorexit on lock not held by current thread");
        case 'ifnull':
          pc += rs.pop() === null ? op.offset : 3;
          continue;
        case 'ifnonnull':
          pc += rs.pop() !== null ? op.offset : 3;
          continue;

        default:
          console.error(op.name);
          throw 'NYI';
      }
      `
      pc++

    # Must explicitly return here, to avoid Coffeescript accumulating an array of cf.pc values
    return

  run: (runtime_state,virtual=false) ->
    sig = @full_signature()
    ms = runtime_state.meta_stack()
    if ms.resuming_stack?
      trace "resuming at ", sig
      ms.resuming_stack++
      if virtual
        cf = ms.curr_frame()
        unless cf.method is @
          ms.resuming_stack--
          return cf.method.run(runtime_state)
      if ms.resuming_stack == ms.length() - 1
        ms.resuming_stack = null
    else
      caller_stack = runtime_state.curr_frame().stack
      if virtual
        # dirty hack to bounce up the inheritance tree, to make sure we call the
        # method on the most specific type
        obj = caller_stack[caller_stack.length-@param_bytes]
        unless caller_stack.length-@param_bytes >= 0 and obj?
          java_throw runtime_state, 'java/lang/NullPointerException',
            "null 'this' in virtual lookup for #{sig}"
        return runtime_state.method_lookup({
            class: obj.type.toClassString(),
            sig: @name + @raw_descriptor
          }).run(runtime_state)
      params = @take_params caller_stack
      ms.push(new runtime.StackFrame(this,params,[]))
    padding = (' ' for [2...ms.length()]).join('')
    # check for trapped and native methods, run those manually
    cf = runtime_state.curr_frame()
    if cf.resume? # we are resuming from a yield, and this was a manually run method
      trace "#{padding}resuming method #{sig}"
      @run_manually cf.resume, runtime_state
      cf.resume = null
      return
    if trapped_methods[sig]
      trace "#{padding}entering trapped method #{sig}"
      return @run_manually trapped_methods[sig], runtime_state
    if @access_flags.native
      if sig.indexOf('::registerNatives()V',1) >= 0 or sig.indexOf('::initIDs()V',1) >= 0
        ms.pop() # these are all just NOPs
        return
      if native_methods[sig]
        trace "#{padding}entering native method #{sig}"
        return @run_manually native_methods[sig], runtime_state
      try
        java_throw runtime_state, 'java/lang/Error', "native method NYI: #{sig}"
      finally
        runtime_state.meta_stack().pop()
    if @access_flags.abstract
      java_throw runtime_state, 'java/lang/Error', "called abstract method: #{sig}"

    # Finally, the normal case: running a Java method
    trace "#{padding}entering method #{sig}"
    @run_bytecode runtime_state, padding
