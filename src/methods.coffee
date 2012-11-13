
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
      switch(op) {
        case 0x00: //nop
          break;
        case 0x01: //aconst_null
          rs.push(null);
          break;
        case 0x02: //iconst_m1
          rs.push(-1);
          break;
        case 0x03: //iconst_0
          rs.push(0);
          break;
        case 0x04: //iconst_1
          rs.push(1);
          break;
        case 0x05: //iconst_2
          rs.push(2);
          break;
        case 0x06: //iconst_3
          rs.push(3);
          break;
        case 0x07: //iconst_4
          rs.push(4);
          break;
        case 0x08: //iconst_5
          rs.push(5);
          break;
        case 0x09: //lconst_0
          rs.push2(gLong.ZERO)
          break;
        case 0x0a: //lconst_1
          rs.push2(gLong.ONE)
          break;
        case 0x0b: //fconst_0
          rs.push(0);
          break;
        case 0x0c: //fconst_1
          rs.push(1);
          break;
        case 0x0d: //fconst_2
          rs.push(2);
          break;
        case 0x0e: //dconst_0
          rs.push2(0);
          break;
        case 0x0f: //dconst_1
          rs.push2(1);
          break;
        case 0x11: //sipush
          pc++;
        case 0x10: //bipush
          pc++;
          rs.push(op.value);
          break;
        case 0x13: //ldc_w
          pc++;
        case 0x12: //ldc
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
        case 0x14: //ldc2_w
          rs.push2(op.constant.value);
          pc += 2;
          break;
        case 0x15: //iload
        case 0x17: //fload
        case 0x19: //aload
          pc++;
        case 0x1a: //iload_0
        case 0x1b: //iload_1
        case 0x1c: //iload_2
        case 0x1d: //iload_3
        case 0x22: //fload_0
        case 0x23: //fload_1
        case 0x24: //fload_2
        case 0x25: //fload_3
        case 0x2a: //aload_0
        case 0x2b: //aload_1
        case 0x2c: //aload_2
        case 0x2d: //aload_3
          rs.push(rs.cl(op.var_num));
          break;
        case 0x16: //lload
        case 0x18: //dload
          pc++;
        case 0x1e: //lload_0
        case 0x1f: //lload_1
        case 0x20: //lload_2
        case 0x21: //lload_3
        case 0x26: //dload_0
        case 0x27: //dload_1
        case 0x28: //dload_2
        case 0x29: //dload_3
          rs.push2(rs.cl(op.var_num));
          break;
        case 0x2e: //iaload
        case 0x30: //faload
        case 0x32: //aaload
        case 0x35: //saload
        case 0x34: //caload
          pushFnName = 'push';
        case 0x2f: //laload
        case 0x31: //daload
          var idx = rs.pop();
          var obj = rs.check_null(rs.pop());
          var array = obj.array;
          if (!(0 <= idx && idx < array.length))
            java_throw(rs, 'java/lang/ArrayIndexOutOfBoundsException',
              "#{idx} not in length #{array.length} array of type #{obj.type.toClassString()}");
          rs[pushFnName](array[idx]);
          break;
        case 0x36: //istore
        case 0x38: //fstore
        case 0x4f: //iastore
          pc++;
        case 0x3b: //istore_0
        case 0x3c: //istore_1
        case 0x3d: //istore_2
        case 0x3e: //istore_3
        case 0x43: //fstore_0
        case 0x44: //fstore_1
        case 0x45: //fstore_2
        case 0x46: //fstore_3
        case 0x4b: //astore_0
        case 0x4c: //astore_1
        case 0x4d: //astore_2
        case 0x4e: //astore_3
          rs.put_cl(op.var_num, rs.pop());
          break;
        case 0x37: //lstore
        case 0x39: //dstore
          pc++;
        case 0x3f: //lstore_0
        case 0x40: //lstore_1
        case 0x41: //lstore_2
        case 0x42: //lstore_3
        case 0x47: //dstore_0
        case 0x48: //dstore_1
        case 0x49: //dstore_2
        case 0x4a: //dstore_3
          rs.put_cl2(op.var_num, rs.pop2());
          break;
        case 0x4f: //iastore
        case 0x51: //fastore
        case 0x53: //aastore
        case 0x54: //bastore
        case 0x55: //castore
        case 0x56: //sastore
          popValue = rs.pop();
        case 0x50: //lastore
        case 0x52: //dastore
          if (popValue === undefined) popValue = rs.pop2();
          var idx = rs.pop();
          var obj = rs.check_null(rs.pop());
          var array = obj.array;
          if (!(0 <= idx) && idx < array.length)
            java_throw(rs, 'java/lang/ArrayIndexOutOfBoundsException',
              "#{idx} not in length #{array.length} array of type #{obj.type.toClassString()}")
          array[idx] = popValue;
          break;
        case 0x57: //pop
          rs.pop();
          break;
        case 0x58: //pop2
          rs.pop2();
          break;
        case 0x59: //dup
          v1 = rs.pop();
          rs.push_array([v1,v1]);
          break;
        case 0x5a: //dup_x1
          v1 = rs.pop();
          v2 = rs.pop();
          rs.push_array([v1,v2,v1]);
          break;
        case 0x5b: //dup_x2
          v1 = rs.pop();
          v2 = rs.pop();
          v3 = rs.pop();
          rs.push_array([v1,v3,v2,v1]);
          break;
        case 0x5c: //dup2
          v1 = rs.pop();
          v2 = rs.pop();
          rs.push_array([v2,v1,v2,v1]);
          break;
        case 0x5d: //dup2_x1
          v1 = rs.pop();
          v2 = rs.pop();
          v3 = rs.pop();
          rs.push_array([v2,v1,v3,v2,v1]);
          break;
        case 0x5e: //dup2_x2
          v1 = rs.pop();
          v2 = rs.pop();
          v3 = rs.pop();
          v4 = rs.pop();
          rs.push_array([v2,v1,v4,v3,v2,v1]);
          break;
        case 0x5f: //swap
          v1 = rs.pop();
          v2 = rs.pop();
          rs.push_array([v1,v2]);
          break;
        case 0x60: //iadd
          rs.push(util.wrap_int(rs.pop()+rs.pop()));
          break;
        case 0x61: //ladd
          rs.push2(rs.pop2().add(rs.pop2()));
          break;
        case 0x62: //fadd
          rs.push(util.wrap_float(rs.pop()+rs.pop()));
          break;
        case 0x63: //dadd
          rs.push2(rs.pop2()+rs.pop2());
          break;
        case 0x64: //isub
          rs.push(util.wrap_int(-rs.pop()+rs.pop()));
          break;
        case 0x65: //lsub
          v1 = rs.pop2();
          rs.push2(rs.pop2().subtract(v1));
          break;
        case 0x66: //fsub
          rs.push(util.wrap_float(-rs.pop()+rs.pop()));
          break;
        case 0x67: //dsub
          rs.push2(-rs.pop2()+rs.pop2());
          break;
        case 0x68: //imul
          rs.push(gLong.fromInt(rs.pop()).multiply(gLong.fromInt(rs.pop())).toInt());
          break;
        case 0x69: //lmul
          rs.push2(rs.pop2().multiply(rs.pop2()));
          break;
        case 0x6a: //fmul
          rs.push(util.wrap_float(rs.pop()*rs.pop()));
          break;
        case 0x6b: //dmul
          rs.push2(rs.pop2()*rs.pop2());
          break;
        case 0x6c: //idiv
          v1 = rs.pop();
          rs.push(util.int_div(rs, rs.pop(), v));
          break;
        case 0x6d: //ldiv
          v1 = rs.pop2();
          rs.push2(util.long_div(rs, rs.pop2(), v));
          break;
        case 0x6e: //fdiv
          v1 = rs.pop();
          rs.push(util.wrap_float(rs.pop()/v1));
          break;
        case 0x6f: //ddiv
          v1 = rs.pop2();
          rs.push2(rs.pop2()/v1);
          break;
        case 0x70: //irem
          v1 = rs.pop();
          rs.push(util.int_mod(rs,rs.pop(),v1));
          break;
        case 0x71: //lrem
          v1 = rs.pop2();
          rs.push2(util.long_mod(rs,rs.pop2(),v1));
          break;
        case 0x72: //frem
          v1 = rs.pop();
          rs.push(rs.pop() % v1);
          break;
        case 0x73: //drem
          v1 = rs.pop2();
          rs.push2(rs.pop2() % v1);
          break;
        case 0x74: //ineg
          v1 = rs.pop()
          if (v1 === util.INT_MIN) rs.push(v1);
          else rs.push(-v1);
          break;
        case 0x75: //lneg
          rs.push2(rs.pop2().negate());
          break;
        case 0x76: //fneg
          rs.push(-rs.pop());
          break;
        case 0x77: //dneg
          rs.push2(-rs.pop2());
          break;
        case 0x78: //ishl
          v1=rs.pop()&0x1F;
          rs.push(rs.pop()<<v1);
          break;
        case 0x79: //lshl
          v1=rs.pop2()&0x3F;
          rs.push2(rs.pop2().shiftLeft(gLong.fromInt(v1)));
          break;
        case 0x7a: //ishr
          v1=rs.pop()&0x1F;
          rs.push(rs.pop()>>v1);
          break;
        case 0x7b: //lshr
          v1=rs.pop2()&0x3F;
          rs.push2(rs.pop2().shiftRight(gLong.fromInt(v1)));
          break;
        case 0x7c: //iushr
          v1=rs.pop()&0x1F;
          rs.push(rs.pop()>>>v1);
          break;
        case 0x7d: //lushr
          v1=rs.pop2()&0x1F;
          rs.push2(rs.pop2().shiftRightUnsigned(gLong.fromInt(v1)));
          break;
        case 0x7e: //iand
          rs.push(rs.pop() & rs.pop());
          break;
        case 0x7f: //land
          rs.push2(rs.pop2().and(rs.pop2()));
          break;
        case 0x80: //ior
          rs.push(rs.pop() | rs.pop());
          break;
        case 0x81: //lor
          rs.push2(rs.pop2().or(rs.pop2()));
          break;
        case 0x82: //ixor
          rs.push(rs.pop() ^ rs.pop());
          break;
        case 0x83: //lxor
          rs.push2(rs.pop2().xor(rs.pop2()));
          break;
        case 0x84: //iinc
          v1 = rs.cl(op.index) + op.const;
          rs.put_cl(op.index, util.wrap_int(v1));
          pc += 2;
          break;
        case 0x85: //i2l
          rs.push2(gLong.fromInt(rs.pop()));
          break;
        case 0x86: //i2f
          break;
        case 0x87: //i2d
          rs.push(null);
          break;
        case 0x88: //l2i
          rs.push(rs.pop2().toInt());
          break;
        case 0x89: //l2f
          rs.push(rs.pop2().toNumber());
          break;
        case 0x8a: //l2d
          rs.push2(rs.pop2().toNumber());
          break;
        case 0x8b: //f2i
          rs.push(util.float2int(rs.pop()));
          break;
        case 0x8c: //f2l
          rs.push2(gLong.fromNumber(rs.pop()));
          break;
        case 0x8d: //f2d
          rs.push(null);
          break;
        case 0x8e: //d2i
          rs.push(util.float2int(rs.pop2()));
          break;
        case 0x8f: //d2l
          v1 = rs.pop2();
          if (v1 === Number.POSITIVE_INFINITY) rs.push2(gLong.MAX_VALUE);
          else if (v1 === Number.NEGATIVE_INFINITY) rs.push2(gLong.MIN_VALUE);
          else rs.push2(gLong.fromNumber(v1));
          break;
        case 0x90: //d2f
          rs.push(util.wrap_float(rs.pop2()));
          break;
        case 0x91: //i2b
          rs.push(util.truncate(rs.pop(), 8));
          break;
        case 0x92: //i2c
          rs.push(rs.pop()&0xffff);
          break;
        case 0x93: //i2s
          rs.push(util.truncate(rs.pop(), 16));
          break;
        case 0x94: //lcmp
          v1 = rs.pop2();
          rs.push(rs.pop2().compare(v1));
          break;
        case 0x95: //fcmpl
          v1 = rs.pop();
          v2 = util.cmp(rs.pop(),v1);
          if (v2 === null) rs.push(-1);
          else rs.push(v2);
          break;
        case 0x96: //fcmpg
          v1 = rs.pop();
          v2 = util.cmp(rs.pop(),v1);
          if (v2 === null) rs.push(1);
          else rs.push(v2);
          break;
        case 0x97: //dcmpl
          v1 = rs.pop2();
          v2 = util.cmp(rs.pop2(),v1);
          if (v2 === null) rs.push(-1);
          else rs.push(v2);
          break;
        case 0x98: //dcmpg
          v1 = rs.pop2();
          v2 = util.cmp(rs.pop2(),v1);
          if (v2 === null) rs.push(1);
          else rs.push(v2);
          break;
        case 0x99: //ifeq
          pc += rs.pop() === 0 ? op.offset : 3;
          continue;
        case 0x9a: //ifne
          pc += rs.pop() !== 0 ? op.offset : 3;
          continue;
        case 0x9b: //iflt
          pc += rs.pop() < 0 ? op.offset : 3;
          continue;
        case 0x9c: //ifge
          pc += rs.pop() >= 0 ? op.offset : 3;
          continue;
        case 0x9d: //ifgt
          pc += rs.pop() > 0 ? op.offset : 3;
          continue;
        case 0x9e: //ifle
          pc += rs.pop() <= 0 ? op.offset : 3;
          continue;
        case 0x9f: //if_icmpeq
        case 0xa5: //if_acmpeq
          pc += rs.pop() === rs.pop() ? op.offset : 3;
          continue;
        case 0xa0: //if_icmpne
        case 0xa6: //if_acmpne // maybe split this up so call is monomorphic?
          pc += rs.pop() !== rs.pop() ? op.offset : 3;
          continue;
        case 0xa1: //if_icmplt
          v1 = rs.pop();
          pc += rs.pop() < v1 ? op.offset : 3;
          continue;
        case 0xa2: //if_icmpge
          v1 = rs.pop();
          pc += rs.pop() >= v1 ? op.offset : 3;
          continue;
        case 0xa3: //if_icmpgt
          v1 = rs.pop();
          pc += rs.pop() > v1 ? op.offset : 3;
          continue;
        case 0xa4: //if_icmple
          v1 = rs.pop();
          pc += rs.pop() <= v1 ? op.offset : 3;
          continue;
        case 0xa7: //goto
          pc += op.offset;
          continue;
        case 0xa8: //jsr
          rs.push(pc+3);
          pc += op.offset;
          continue;
        case 0xa9: //ret
          pc += rs.cl(op.args[0]);
          continue;
        case 0xaa: //tableswitch
        case 0xab: //lookupswitch
          throw 'NYI';
          break;
        case 0xac: //ireturn
        case 0xae: //freturn
        case 0xb0: //areturn
          var cf = rs.meta_stack().pop();
          //vtrace("#{padding}stack: [#{debug_vars cf.stack}],\nlocal: [#{debug_vars cf.locals}] (end method #{method.class_type.toClassString()}::#{method.name})")
          rs.push(cf.stack[0]);
          return;
        case 0xad: //lreturn
        case 0xaf: //dreturn
          var cf = rs.meta_stack().pop();
          //vtrace("#{padding}stack: [#{debug_vars cf.stack}],\nlocal: [#{debug_vars cf.locals}] (end method #{method.class_type.toClassString()}::#{method.name})")
          rs.push2(cf.stack[0]);
          return;
        case 0xb1: //return
          rs.meta_stack().pop();
          return;
        case 0xb2: //getstatic
          rs.push(rs.static_get(op.field_spec));
          if (op.field_spec.type in {J:1, D:1}) rs.push(null);
          pc += 2;
          break;
        case 0xb3: //putstatic
          rs.static_put(op.field_spec);
          pc += 2;
          break;
        case 0xb4: //getfield
          rs.heap_get(op.field_spec, rs.pop());
          pc += 2;
          break;
        case 0xb5: //putfield
          rs.heap_put(op.field_spec);
          pc += 2;
          break;
        case 0xb9: //invokeinterface
          pc += 2;
        case 0xb6: //invokevirtual
          rs.method_lookup(op.method_spec).run(rs, true);
          pc += 2;
          break;
        case 0xb7: //invokespecial
        case 0xb8: //invokestatic
          rs.method_lookup(op.method_spec).run(rs);
          pc += 2;
          break;
        case 0xbb: //new
          rs.push(rs.init_object(op.class));
          pc += 2;
          break;
        case 0xbc: //newarray
          rs.push(rs.heap_newarray(op.element_type, rs.pop()));
          pc++;
          break;
        case 0xbd: //anewarray
          rs.push(rs.heap_newarray('L' + op.class + ';',rs.pop()));
          pc += 2;
          break;
        case 0xbe: //arraylength
          rs.push(rs.check_null(rs.pop()).array.length);
          break;
        case 0xbf: //athrow
          return new JavaException(rs.pop());
        case 0xc0: //checkcast
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
        case 0xc1: //instanceof
          v1 = rs.pop();
          if (v1 === null) rs.push(0);
          else rs.push(types.check_cast(rs,v1,op.class)+0);
          pc += 2;
          break;
        case 0xc2: //monitorenter
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
        case 0xc3: //monitorexit
          var monitor = rs.pop();
          var locked_thread = rs.lock_refs[monitor];
          if (locked_thread != null && locked_thread === rs.curr_thread) {
            rs.lock_counts[monitor]--;
            if (rs.lock_counts[monitor] === 0)
              delete rs.lock_refs[monitor];
            break;
          } else
            java_throw(rs, 'java/lang/IllegalMonitorStateException', "Tried to monitorexit on lock not held by current thread");
        case 0xc6: //ifnull
          pc += rs.pop() === null ? op.offset : 3;
          continue;
        case 0xc7: //ifnonnull
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
