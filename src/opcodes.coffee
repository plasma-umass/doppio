
gLong = require '../third_party/gLong.js'
util = require './util'
types = require './types'
{java_throw,BranchException,ReturnException,JavaException} = util
{c2t} = types

root = exports ? this.opcodes = {}

class root.Opcode
  constructor: (@name, params={}) ->
    (@[prop] = val for prop, val of params)
    @execute ?= @_execute
    @byte_count = params.byte_count ? 0

  take_args: (code_array) ->
    @args = (code_array.get_uint(1) for [0...@byte_count])

class root.FieldOpcode extends root.Opcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 2

  take_args: (code_array, constant_pool) ->
    @field_spec_ref = code_array.get_uint(2)
    @field_spec = constant_pool.get(@field_spec_ref).deref()

class root.ClassOpcode extends root.Opcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 2

  take_args: (code_array, constant_pool) ->
    @class_ref = code_array.get_uint(2)
    @class = constant_pool.get(@class_ref).deref()

class root.InvokeOpcode extends root.Opcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 2

  take_args: (code_array, constant_pool) ->
    @method_spec_ref = code_array.get_uint(2)
    # invokeinterface has two redundant bytes
    if @name == 'invokeinterface'
      @count = code_array.get_uint 1
      code_array.skip 1
      @byte_count += 2
    @method_spec = constant_pool.get(@method_spec_ref).deref()

class root.LoadConstantOpcode extends root.Opcode
  take_args: (code_array, constant_pool) ->
    @cls = constant_pool.cls
    @constant_ref = code_array.get_uint @byte_count
    @constant = constant_pool.get @constant_ref

  _execute: (rs) ->
    val = @constant.value
    if @constant.type is 'String'
      rs.push rs.string_redirect(val, @cls)
    else if @constant.type is 'class'
      jvm_str = rs.string_redirect(val,@cls)
      rs.push rs.class_lookup(c2t(rs.jvm2js_str(jvm_str)), true)
    else
      rs.push val

class root.BranchOpcode extends root.Opcode
  constructor: (name, params={}) ->
    params.byte_count ?= 2
    super name, params

  take_args: (code_array) ->
    @offset = code_array.get_int @byte_count

class root.UnaryBranchOpcode extends root.BranchOpcode
  constructor: (name, params) ->
    super name, {
      execute: (rs) ->
        v = rs.pop()
        throw new BranchException rs.curr_pc() + @offset if params.cmp v
    }

class root.BinaryBranchOpcode extends root.BranchOpcode
  constructor: (name, params) ->
    super name, {
      execute: (rs) ->
        v2 = rs.pop()
        v1 = rs.pop()
        throw new BranchException rs.curr_pc() + @offset if params.cmp v1, v2
    }

class root.PushOpcode extends root.Opcode
  take_args: (code_array) ->
    @value = code_array.get_int @byte_count

  _execute: (rs) -> rs.push @value

class root.IIncOpcode extends root.Opcode
  constructor: (name, params) ->
    super name, params

  take_args: (code_array, constant_pool, @wide=false) ->
    if @wide
      @name += "_w"
      arg_size = 2
      @byte_count = 5
    else
      arg_size = 1
      @byte_count = 2
    @index = code_array.get_uint arg_size
    @const = code_array.get_int arg_size

  _execute: (rs) -> rs.put_cl(@index,rs.cl(@index)+@const)

class root.LoadOpcode extends root.Opcode
  constructor: (name, params={}) ->
    params.execute ?=
      if name.match /[ld]load/
        (rs) -> rs.push rs.cl(@var_num), null
      else
        (rs) -> rs.push rs.cl(@var_num)
    super name, params

  take_args: (code_array) ->
    @var_num = parseInt @name[6]  # sneaky hack, works for name =~ /.load_\d/

class root.LoadVarOpcode extends root.LoadOpcode
  take_args: (code_array, constant_pool, @wide=false) ->
    if @wide
      @name += "_w"
      @byte_count = 3
      @var_num = code_array.get_uint 2
    else
      @byte_count = 1
      @var_num = code_array.get_uint 1

class root.StoreOpcode extends root.Opcode
  constructor: (name, params={}) ->
    params.execute ?=
      if name.match /[ld]store/
        (rs) -> rs.put_cl2(@var_num,rs.pop2())
      else
        (rs) -> rs.put_cl(@var_num,rs.pop())
    super name, params

  take_args: (code_array) ->
    @var_num = parseInt @name[7]  # sneaky hack, works for name =~ /.store_\d/

class root.StoreVarOpcode extends root.StoreOpcode
  constructor: (name, params) ->
    super name, params

  take_args: (code_array, constant_pool, @wide=false) ->
    if @wide
      @name += "_w"
      @byte_count = 3
      @var_num = code_array.get_uint 2
    else
      @byte_count = 1
      @var_num = code_array.get_uint 1

class root.SwitchOpcode extends root.BranchOpcode
  constructor: (name, params) ->
    super name, params
    @byte_count = null

  execute: (rs) ->
    key = rs.pop()
    throw new BranchException(
      rs.curr_pc() + if @offsets[key]? then @offsets[key] else @_default
    )

class root.LookupSwitchOpcode extends root.SwitchOpcode
  take_args: (code_array, constant_pool) ->
    # account for padding that ensures alignment
    padding_size = (4 - code_array.pos() % 4) % 4
    code_array.skip padding_size
    @_default = code_array.get_int(4)
    @npairs = code_array.get_int(4)
    @offsets = {}
    for [0...@npairs]
      match = code_array.get_int(4)
      offset = code_array.get_int(4)
      @offsets[match] = offset
    @byte_count = padding_size + 8 * (@npairs + 1)

class root.TableSwitchOpcode extends root.SwitchOpcode
  take_args: (code_array, constant_pool) ->
    # account for padding that ensures alignment
    padding_size = (4 - code_array.pos() % 4) % 4
    code_array.skip padding_size
    @_default = code_array.get_int(4)
    @low = code_array.get_int(4)
    @high = code_array.get_int(4)
    @offsets = {}
    total_offsets = @high - @low + 1
    for i in [0...total_offsets] by 1
      offset = code_array.get_int(4)
      @offsets[@low + i] = offset
    @byte_count = padding_size + 12 + 4 * total_offsets

class root.NewArrayOpcode extends root.Opcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 1
    @arr_types = {4:'Z',5:'C',6:'F',7:'D',8:'B',9:'S',10:'I',11:'J'}

  take_args: (code_array,constant_pool) ->
    type_code = code_array.get_uint 1
    @element_type = @arr_types[type_code]

class root.MultiArrayOpcode extends root.Opcode
  constructor: (name, params={}) ->
    params.byte_count ?= 3
    super name, params

  take_args: (code_array, constant_pool) ->
    @class_ref = code_array.get_uint 2
    @class = constant_pool.get(@class_ref).deref()
    @dim = code_array.get_uint 1

  execute: (rs) ->
    counts = rs.curr_frame().stack.splice(-@dim,@dim)
    init_arr = (curr_dim) =>
      return 0 if curr_dim == @dim
      typestr = @class[curr_dim..]
      rs.init_object typestr, (init_arr(curr_dim+1) for [0...counts[curr_dim]])
    rs.push init_arr 0

class root.ArrayLoadOpcode extends root.Opcode
  execute: (rs) ->
    idx = rs.pop()
    obj = rs.check_null(rs.pop())
    array = obj.array
    unless 0 <= idx < array.length
      java_throw(rs, 'java/lang/ArrayIndexOutOfBoundsException',
        "#{idx} not in length #{array.length} array of type #{obj.type.toClassString()}")
    rs.push array[idx]
    rs.push null if @name.match /[ld]aload/

towards_zero = (a) ->
  Math[if a > 0 then 'floor' else 'ceil'](a)

int_mod = (rs, a, b) ->
  java_throw rs, 'java/lang/ArithmeticException', '/ by zero' if b == 0
  a % b

int_div = (rs, a, b) ->
  java_throw rs, 'java/lang/ArithmeticException', '/ by zero' if b == 0
  towards_zero a / b
  # TODO spec: "if the dividend is the negative integer of largest possible magnitude
  # for the int type, and the divisor is -1, then overflow occurs, and the
  # result is equal to the dividend."

long_mod = (rs, a, b) ->
  java_throw rs, 'java/lang/ArithmeticException', '/ by zero' if b.isZero()
  a.modulo(b)

long_div = (rs, a, b) ->
  java_throw rs, 'java/lang/ArithmeticException', '/ by zero' if b.isZero()
  a.div(b)

float2int = (a) ->
  if a == NaN then 0
  else if a > util.INT_MAX then util.INT_MAX  # these two cases handle d2i issues
  else if a < util.INT_MIN then util.INT_MIN
  else unless a == Infinity or a == -Infinity then towards_zero a
  else if a > 0 then util.INT_MAX
  else util.INT_MIN

wrap_float = (a) ->
  return Infinity if a > 3.40282346638528860e+38
  return 0 if 0 < a < 1.40129846432481707e-45
  return -Infinity if a < -3.40282346638528860e+38
  return 0 if 0 > a > -1.40129846432481707e-45
  a

jsr = (rs) ->
  rs.push(rs.curr_pc()+@byte_count+1); throw new BranchException rs.curr_pc() + @offset

# these objects are used as prototypes for the parsed instructions in the
# classfile
root.opcodes = {
  0: new root.Opcode 'nop', { execute: -> }
  1: new root.Opcode 'aconst_null', { execute: (rs) -> rs.push null }
  2: new root.Opcode 'iconst_m1', { execute: (rs) -> rs.push -1 }
  3: new root.Opcode 'iconst_0', { execute: (rs) -> rs.push 0 }
  4: new root.Opcode 'iconst_1', { execute: (rs) -> rs.push 1 }
  5: new root.Opcode 'iconst_2', { execute: (rs) -> rs.push 2 }
  6: new root.Opcode 'iconst_3', { execute: (rs) -> rs.push 3 }
  7: new root.Opcode 'iconst_4', { execute: (rs) -> rs.push 4 }
  8: new root.Opcode 'iconst_5', { execute: (rs) -> rs.push 5 }
  9: new root.Opcode 'lconst_0', { execute: (rs) -> rs.push gLong.ZERO, null }
  10: new root.Opcode 'lconst_1', { execute: (rs) -> rs.push gLong.ONE, null }
  11: new root.Opcode 'fconst_0', { execute: (rs) -> rs.push 0 }
  12: new root.Opcode 'fconst_1', { execute: (rs) -> rs.push 1 }
  13: new root.Opcode 'fconst_2', { execute: (rs) -> rs.push 2 }
  14: new root.Opcode 'dconst_0', { execute: (rs) -> rs.push 0, null }
  15: new root.Opcode 'dconst_1', { execute: (rs) -> rs.push 1, null }
  16: new root.PushOpcode 'bipush', { byte_count: 1 }
  17: new root.PushOpcode 'sipush', { byte_count: 2 }
  18: new root.LoadConstantOpcode 'ldc', { byte_count: 1 }
  19: new root.LoadConstantOpcode 'ldc_w', { byte_count: 2 }
  20: new root.LoadConstantOpcode 'ldc2_w', { byte_count: 2, execute: ((rs) -> rs.push @constant.value, null) }
  21: new root.LoadVarOpcode 'iload'
  22: new root.LoadVarOpcode 'lload'
  23: new root.LoadVarOpcode 'fload'
  24: new root.LoadVarOpcode 'dload'
  25: new root.LoadVarOpcode 'aload'
  26: new root.LoadOpcode 'iload_0'
  27: new root.LoadOpcode 'iload_1'
  28: new root.LoadOpcode 'iload_2'
  29: new root.LoadOpcode 'iload_3'
  30: new root.LoadOpcode 'lload_0'
  31: new root.LoadOpcode 'lload_1'
  32: new root.LoadOpcode 'lload_2'
  33: new root.LoadOpcode 'lload_3'
  34: new root.LoadOpcode 'fload_0'
  35: new root.LoadOpcode 'fload_1'
  36: new root.LoadOpcode 'fload_2'
  37: new root.LoadOpcode 'fload_3'
  38: new root.LoadOpcode 'dload_0'
  39: new root.LoadOpcode 'dload_1'
  40: new root.LoadOpcode 'dload_2'
  41: new root.LoadOpcode 'dload_3'
  42: new root.LoadOpcode 'aload_0'
  43: new root.LoadOpcode 'aload_1'
  44: new root.LoadOpcode 'aload_2'
  45: new root.LoadOpcode 'aload_3'
  46: new root.ArrayLoadOpcode 'iaload'
  47: new root.ArrayLoadOpcode 'laload'
  48: new root.ArrayLoadOpcode 'faload'
  49: new root.ArrayLoadOpcode 'daload'
  50: new root.ArrayLoadOpcode 'aaload'
  51: new root.ArrayLoadOpcode 'baload'
  52: new root.ArrayLoadOpcode 'caload'
  53: new root.ArrayLoadOpcode 'saload'
  54: new root.StoreVarOpcode 'istore', { execute: (rs) -> rs.put_cl(@var_num,rs.pop()) }
  55: new root.StoreVarOpcode 'lstore', { execute: (rs) -> rs.put_cl2(@var_num,rs.pop2()) }
  56: new root.StoreVarOpcode 'fstore', { execute: (rs) -> rs.put_cl(@var_num,rs.pop()) }
  57: new root.StoreVarOpcode 'dstore', { execute: (rs) -> rs.put_cl2(@var_num,rs.pop2()) }
  58: new root.StoreVarOpcode 'astore', { execute: (rs) -> rs.put_cl(@var_num,rs.pop()) }
  59: new root.StoreOpcode 'istore_0'
  60: new root.StoreOpcode 'istore_1'
  61: new root.StoreOpcode 'istore_2'
  62: new root.StoreOpcode 'istore_3'
  63: new root.StoreOpcode 'lstore_0'
  64: new root.StoreOpcode 'lstore_1'
  65: new root.StoreOpcode 'lstore_2'
  66: new root.StoreOpcode 'lstore_3'
  67: new root.StoreOpcode 'fstore_0'
  68: new root.StoreOpcode 'fstore_1'
  69: new root.StoreOpcode 'fstore_2'
  70: new root.StoreOpcode 'fstore_3'
  71: new root.StoreOpcode 'dstore_0'
  72: new root.StoreOpcode 'dstore_1'
  73: new root.StoreOpcode 'dstore_2'
  74: new root.StoreOpcode 'dstore_3'
  75: new root.StoreOpcode 'astore_0'
  76: new root.StoreOpcode 'astore_1'
  77: new root.StoreOpcode 'astore_2'
  78: new root.StoreOpcode 'astore_3'
  79: new root.Opcode 'iastore', {execute: (rs) -> v=rs.pop(); i=rs.pop();rs.check_null(rs.pop()).array[i]=v }
  80: new root.Opcode 'lastore', {execute: (rs) -> v=rs.pop2();i=rs.pop();rs.check_null(rs.pop()).array[i]=v }
  81: new root.Opcode 'fastore', {execute: (rs) -> v=rs.pop(); i=rs.pop();rs.check_null(rs.pop()).array[i]=v }
  82: new root.Opcode 'dastore', {execute: (rs) -> v=rs.pop2();i=rs.pop();rs.check_null(rs.pop()).array[i]=v }
  83: new root.Opcode 'aastore', {execute: (rs) -> v=rs.pop(); i=rs.pop();rs.check_null(rs.pop()).array[i]=v }
  84: new root.Opcode 'bastore', {execute: (rs) -> v=rs.pop(); i=rs.pop();rs.check_null(rs.pop()).array[i]=v }
  85: new root.Opcode 'castore', {execute: (rs) -> v=rs.pop(); i=rs.pop();rs.check_null(rs.pop()).array[i]=v }
  86: new root.Opcode 'sastore', {execute: (rs) -> v=rs.pop(); i=rs.pop();rs.check_null(rs.pop()).array[i]=v }
  87: new root.Opcode 'pop', { execute: (rs) -> rs.pop() }
  88: new root.Opcode 'pop2', { execute: (rs) -> rs.pop2() }
  89: new root.Opcode 'dup', { execute: (rs) -> v=rs.pop(); rs.push(v,v) }
  90: new root.Opcode 'dup_x1', { execute: (rs) -> v1=rs.pop(); v2=rs.pop(); rs.push(v1,v2,v1) }
  91: new root.Opcode 'dup_x2', {execute: (rs) -> [v1,v2,v3]=[rs.pop(),rs.pop(),rs.pop()];rs.push(v1,v3,v2,v1)}
  92: new root.Opcode 'dup2', {execute: (rs) -> v1=rs.pop(); v2=rs.pop(); rs.push(v2,v1,v2,v1)}
  93: new root.Opcode 'dup2_x1', {execute: (rs) -> [v1,v2,v3]=[rs.pop(),rs.pop(),rs.pop()];rs.push(v2,v1,v3,v2,v1)}
  94: new root.Opcode 'dup2_x2', {execute: (rs) -> [v1,v2,v3,v4]=[rs.pop(),rs.pop(),rs.pop(),rs.pop()];rs.push(v2,v1,v4,v3,v2,v1)}
  95: new root.Opcode 'swap', {execute: (rs) -> v2=rs.pop(); v1=rs.pop(); rs.push(v2,v1)}
  96: new root.Opcode 'iadd', { execute: (rs) -> rs.push util.wrap_int(rs.pop()+rs.pop()) }
  97: new root.Opcode 'ladd', { execute: (rs) -> rs.push(rs.pop2().add(rs.pop2()), null) }
  98: new root.Opcode 'fadd', { execute: (rs) -> rs.push wrap_float(rs.pop()+rs.pop()) }
  99: new root.Opcode 'dadd', { execute: (rs) -> rs.push(rs.pop2()+rs.pop2(), null) }
  100: new root.Opcode 'isub', { execute: (rs) -> rs.push util.wrap_int(-rs.pop()+rs.pop()) }
  101: new root.Opcode 'lsub', { execute: (rs) -> rs.push(rs.pop2().negate().add(rs.pop2()), null) }
  102: new root.Opcode 'fsub', { execute: (rs) -> rs.push wrap_float(-rs.pop()+rs.pop()) }
  103: new root.Opcode 'dsub', { execute: (rs) -> rs.push(-rs.pop2()+rs.pop2(), null) }
  104: new root.Opcode 'imul', { execute: (rs) -> rs.push gLong.fromInt(rs.pop()).multiply(gLong.fromInt rs.pop()).toInt() }
  105: new root.Opcode 'lmul', { execute: (rs) -> rs.push(rs.pop2().multiply(rs.pop2()), null) }
  106: new root.Opcode 'fmul', { execute: (rs) -> rs.push wrap_float(rs.pop()*rs.pop()) }
  107: new root.Opcode 'dmul', { execute: (rs) -> rs.push(rs.pop2()*rs.pop2(), null) }
  108: new root.Opcode 'idiv', { execute: (rs) -> v=rs.pop();rs.push(int_div rs, rs.pop(), v) }
  109: new root.Opcode 'ldiv', { execute: (rs) -> v=rs.pop2();rs.push(long_div(rs, rs.pop2(), v), null) }
  110: new root.Opcode 'fdiv', { execute: (rs) -> v=rs.pop();rs.push wrap_float(rs.pop()/v) }
  111: new root.Opcode 'ddiv', { execute: (rs) -> v=rs.pop2();rs.push(rs.pop2()/v, null) }
  112: new root.Opcode 'irem', { execute: (rs) -> v2=rs.pop();  rs.push int_mod(rs,rs.pop(),v2) }
  113: new root.Opcode 'lrem', { execute: (rs) -> v2=rs.pop2(); rs.push long_mod(rs,rs.pop2(),v2), null }
  114: new root.Opcode 'frem', { execute: (rs) -> v2=rs.pop();  rs.push rs.pop() %v2 }
  115: new root.Opcode 'drem', { execute: (rs) -> v2=rs.pop2(); rs.push rs.pop2()%v2, null }
  116: new root.Opcode 'ineg', { execute: (rs) ->
    i_val = rs.pop();
    rs.push if i_val == util.INT_MIN then i_val else -i_val }
  117: new root.Opcode 'lneg', { execute: (rs) -> rs.push rs.pop2().negate(), null }
  118: new root.Opcode 'fneg', { execute: (rs) -> rs.push -rs.pop() }
  119: new root.Opcode 'dneg', { execute: (rs) -> rs.push -rs.pop2(), null }
  120: new root.Opcode 'ishl', { execute: (rs) -> s=rs.pop()&0x1F; rs.push(rs.pop()<<s) }
  121: new root.Opcode 'lshl', { execute: (rs) -> s=rs.pop()&0x3F; rs.push(rs.pop2().shiftLeft(gLong.fromInt(s)),null) }
  122: new root.Opcode 'ishr', { execute: (rs) -> s=rs.pop()&0x1F; rs.push(rs.pop()>>s) }
  123: new root.Opcode 'lshr', { execute: (rs) -> s=rs.pop()&0x3F; rs.push(rs.pop2().shiftRight(gLong.fromInt(s)), null) }
  124: new root.Opcode 'iushr', { execute: (rs) -> s=rs.pop()&0x1F; rs.push(rs.pop()>>>s) }
  125: new root.Opcode 'lushr', { execute: (rs) -> s=rs.pop()&0x3F; rs.push(rs.pop2().shiftRightUnsigned(gLong.fromInt(s)), null)}
  126: new root.Opcode 'iand', { execute: (rs) -> rs.push(rs.pop()&rs.pop()) }
  127: new root.Opcode 'land', { execute: (rs) -> rs.push(rs.pop2().and(rs.pop2()), null) }
  128: new root.Opcode 'ior',  { execute: (rs) -> rs.push(rs.pop()|rs.pop()) }
  129: new root.Opcode 'lor',  { execute: (rs) -> rs.push(rs.pop2().or(rs.pop2()), null) }
  130: new root.Opcode 'ixor', { execute: (rs) -> rs.push(rs.pop()^rs.pop()) }
  131: new root.Opcode 'lxor', { execute: (rs) -> rs.push(rs.pop2().xor(rs.pop2()), null) }
  132: new root.IIncOpcode 'iinc'
  133: new root.Opcode 'i2l', { execute: (rs) -> rs.push gLong.fromInt(rs.pop()), null }
  134: new root.Opcode 'i2f', { execute: (rs) -> }
  135: new root.Opcode 'i2d', { execute: (rs) -> rs.push null }
  136: new root.Opcode 'l2i', { execute: (rs) -> rs.push rs.pop2().toInt() }
  137: new root.Opcode 'l2f', { execute: (rs) -> rs.push rs.pop2().toNumber() }
  138: new root.Opcode 'l2d', { execute: (rs) -> rs.push rs.pop2().toNumber(), null }
  139: new root.Opcode 'f2i', { execute: (rs) -> rs.push float2int rs.pop() }
  140: new root.Opcode 'f2l', { execute: (rs) -> rs.push gLong.fromNumber(rs.pop()), null }
  141: new root.Opcode 'f2d', { execute: (rs) -> rs.push null }
  142: new root.Opcode 'd2i', { execute: (rs) -> rs.push float2int rs.pop2() }
  143: new root.Opcode 'd2l', { execute: (rs) ->
    d_val = rs.pop2();
    if d_val is Number.POSITIVE_INFINITY
      rs.push gLong.MAX_VALUE, null
    else if d_val is Number.NEGATIVE_INFINITY
      rs.push gLong.MIN_VALUE, null
    else
      rs.push gLong.fromNumber(d_val), null }
  144: new root.Opcode 'd2f', { execute: (rs) -> rs.push wrap_float rs.pop2() }
  145: new root.Opcode 'i2b', { execute: (rs) -> rs.push util.truncate rs.pop(), 8 }
  146: new root.Opcode 'i2c', { execute: (rs) -> rs.push rs.pop()&0xFFFF }  # 16-bit unsigned integer
  147: new root.Opcode 'i2s', { execute: (rs) -> rs.push util.truncate rs.pop(), 16 }
  148: new root.Opcode 'lcmp', { execute: (rs) -> v2=rs.pop2(); rs.push rs.pop2().compare(v2) }
  149: new root.Opcode 'fcmpl', { execute: (rs) -> v2=rs.pop(); rs.push util.cmp(rs.pop(),v2) ? -1 }
  150: new root.Opcode 'fcmpg', { execute: (rs) -> v2=rs.pop(); rs.push util.cmp(rs.pop(),v2) ? 1 }
  151: new root.Opcode 'dcmpl', { execute: (rs) -> v2=rs.pop2(); rs.push util.cmp(rs.pop2(),v2) ? -1 }
  152: new root.Opcode 'dcmpg', { execute: (rs) -> v2=rs.pop2(); rs.push util.cmp(rs.pop2(),v2) ? 1 }
  153: new root.UnaryBranchOpcode 'ifeq', { cmp: (v) -> v == 0 }
  154: new root.UnaryBranchOpcode 'ifne', { cmp: (v) -> v != 0 }
  155: new root.UnaryBranchOpcode 'iflt', { cmp: (v) -> v < 0 }
  156: new root.UnaryBranchOpcode 'ifge', { cmp: (v) -> v >= 0 }
  157: new root.UnaryBranchOpcode 'ifgt', { cmp: (v) -> v > 0 }
  158: new root.UnaryBranchOpcode 'ifle', { cmp: (v) -> v <= 0 }
  159: new root.BinaryBranchOpcode 'if_icmpeq', { cmp: (v1, v2) -> v1 == v2 }
  160: new root.BinaryBranchOpcode 'if_icmpne', { cmp: (v1, v2) -> v1 != v2 }
  161: new root.BinaryBranchOpcode 'if_icmplt', { cmp: (v1, v2) -> v1 < v2 }
  162: new root.BinaryBranchOpcode 'if_icmpge', { cmp: (v1, v2) -> v1 >= v2 }
  163: new root.BinaryBranchOpcode 'if_icmpgt', { cmp: (v1, v2) -> v1 > v2 }
  164: new root.BinaryBranchOpcode 'if_icmple', { cmp: (v1, v2) -> v1 <= v2 }
  165: new root.BinaryBranchOpcode 'if_acmpeq', { cmp: (v1, v2) -> v1 == v2 }
  166: new root.BinaryBranchOpcode 'if_acmpne', { cmp: (v1, v2) -> v1 != v2 }
  167: new root.BranchOpcode 'goto', { execute: (rs) -> throw new BranchException rs.curr_pc() + @offset }
  168: new root.BranchOpcode 'jsr', { execute: jsr }
  169: new root.Opcode 'ret', { byte_count: 1, execute: (rs) -> throw new BranchException rs.cl @args[0] }
  170: new root.TableSwitchOpcode 'tableswitch'
  171: new root.LookupSwitchOpcode 'lookupswitch'
  172: new root.Opcode 'ireturn', { execute: (rs) -> throw new ReturnException rs.curr_frame().stack[0] }
  173: new root.Opcode 'lreturn', { execute: (rs) -> throw new ReturnException rs.curr_frame().stack[0], null }
  174: new root.Opcode 'freturn', { execute: (rs) -> throw new ReturnException rs.curr_frame().stack[0] }
  175: new root.Opcode 'dreturn', { execute: (rs) -> throw new ReturnException rs.curr_frame().stack[0], null }
  176: new root.Opcode 'areturn', { execute: (rs) -> throw new ReturnException rs.curr_frame().stack[0] }
  177: new root.Opcode 'return', { execute: (rs) ->
    throw new Error("too many values on stack for void return") if rs.curr_frame().stack.length > 0
    throw new ReturnException }
  178: new root.FieldOpcode 'getstatic', {execute: (rs)-> rs.push rs.static_get @field_spec; rs.push null if @field_spec.type in ['J','D']}
  179: new root.FieldOpcode 'putstatic', {execute: (rs)-> rs.static_put @field_spec }
  180: new root.FieldOpcode 'getfield', {execute: (rs)-> rs.heap_get @field_spec, rs.pop() }
  181: new root.FieldOpcode 'putfield', {execute: (rs)-> rs.heap_put @field_spec }
  182: new root.InvokeOpcode 'invokevirtual',  { execute: (rs)-> rs.method_lookup(@method_spec).run(rs,true)}
  183: new root.InvokeOpcode 'invokespecial',  { execute: (rs)-> rs.method_lookup(@method_spec).run(rs)}
  184: new root.InvokeOpcode 'invokestatic',   { execute: (rs)-> rs.method_lookup(@method_spec).run(rs)}
  185: new root.InvokeOpcode 'invokeinterface',{ execute: (rs)-> rs.method_lookup(@method_spec).run(rs,true)}
  187: new root.ClassOpcode 'new', { execute: (rs) -> rs.push rs.init_object @class }
  188: new root.NewArrayOpcode 'newarray', { execute: (rs) -> rs.push rs.heap_newarray @element_type, rs.pop() }
  189: new root.ClassOpcode 'anewarray', { execute: (rs) -> rs.push rs.heap_newarray "L#{@class};", rs.pop() }
  190: new root.Opcode 'arraylength', { execute: (rs) -> rs.push rs.check_null(rs.pop()).array.length }
  191: new root.Opcode 'athrow', { execute: (rs) -> throw new JavaException rs, rs.pop() }
  192: new root.ClassOpcode 'checkcast', { execute: (rs) ->
    o = rs.pop()
    if (not o?) or types.check_cast(rs,o,@class)
      rs.push o
    else
      target_class = c2t(@class).toExternalString() # class we wish to cast to
      candidate_class = if o? then o.type.toExternalString() else "null"
      java_throw rs, 'java/lang/ClassCastException', "#{candidate_class} cannot be cast to #{target_class}"
  }
  193: new root.ClassOpcode 'instanceof', { execute: (rs) -> o=rs.pop(); rs.push if o? then types.check_cast(rs,o,@class)+0 else 0 }
  194: new root.Opcode 'monitorenter', { execute: (rs)->
    monitor = rs.pop()
    if (locked_thread = rs.lock_refs[monitor])?
      if locked_thread is rs.curr_thread
        rs.lock_counts[monitor]++  # increment lock counter, to only unlock at zero
      else
        rs.wait monitor
    else  # this lock not held by any thread
      rs.lock_refs[monitor] = rs.curr_thread
      rs.lock_counts[monitor] = 1
  }
  195: new root.Opcode 'monitorexit',  { execute: (rs)->
    monitor = rs.pop()
    if (locked_thread = rs.lock_refs[monitor])? and locked_thread is rs.curr_thread
      rs.lock_counts[monitor]--
      if rs.lock_counts[monitor] == 0
        delete rs.lock_refs[monitor]
    else
      java_throw rs, 'java/lang/IllegalMonitorStateException', "Tried to monitorexit on lock not held by current thread"
  }
  197: new root.MultiArrayOpcode 'multianewarray'
  198: new root.UnaryBranchOpcode 'ifnull', { cmp: (v) -> not v? }
  199: new root.UnaryBranchOpcode 'ifnonnull', { cmp: (v) -> v? }
  200: new root.BranchOpcode 'goto_w', { byte_count: 4, execute: (rs) -> throw new BranchException rs.curr_pc() + @offset }
  201: new root.BranchOpcode 'jsr_w', { byte_count: 4, execute: jsr }
}
