
util ?= require './util'
root = exports ? this.opcodes = {}

class root.Opcode
  constructor: (@name, params={}) ->
    (@[prop] ?= val for prop, val of params)
    @execute ?= @_execute
    @byte_count = params.byte_count ? 0

  take_args: (code_array) ->
    @args = [code_array.get_uint(1) for i in [0...@byte_count]]
  
  _execute: (rs) -> throw "#{@name} is a NOP"

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
    code_array.index += 2 if @name == 'invokeinterface'
    @method_spec = constant_pool.get(@method_spec_ref).deref()

class root.LoadConstantOpcode extends root.Opcode
  take_args: (code_array, constant_pool) ->
    @cls = constant_pool.cls
    throw new Error "asdflajsdhfa" unless @cls
    @constant_ref = code_array.get_uint @byte_count
    @constant = constant_pool.get @constant_ref
  
  _execute: (rs) ->
    val = @constant.value
    val = rs.string_redirect(val, @cls) if @constant.type is 'String'
    if @constant.type is 'class'
      jvm_str = rs.get_obj(rs.string_redirect(val,@cls))
      carr = rs.get_obj(jvm_str.value).array
      val = rs.set_obj({'type':'java/lang/Class','name':(String.fromCharCode(c) for c in carr).join('')})
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
        rs.inc_pc(if params.cmp v then @offset else 1 + @byte_count)
    }

class root.BinaryBranchOpcode extends root.BranchOpcode
  constructor: (name, params) ->
    super name, {
      execute: (rs) ->
        v2 = rs.pop()
        v1 = rs.pop()
        rs.inc_pc(if params.cmp v1,v2 then @offset else 1 + @byte_count)
    }

class root.PushOpcode extends root.Opcode
  take_args: (code_array) ->
    @value = code_array.get_int @byte_count

  _execute: (rs) -> rs.push @value

class root.IIncOpcode extends root.Opcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 2
    
  take_args: (code_array) ->
    @index = code_array.get_uint 1
    @const = code_array.get_int 1

  _execute: (rs) -> rs.put_cl(@index,rs.cl(@index)+@const)

class root.LoadOpcode extends root.Opcode
  take_args: (code_array) ->
    @var_num = parseInt @name[6]  # sneaky hack, works for name =~ /.load_\d/

  _execute: (rs) ->
    rs.push rs.cl(@var_num)
    rs.push undefined if @name.match /[ld]load/

class root.LoadVarOpcode extends root.LoadOpcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 1

  take_args: (code_array) ->
    @var_num = code_array.get_uint(1)

class root.StoreOpcode extends root.Opcode
  take_args: (code_array) ->
    @var_num = parseInt @name[7]  # sneaky hack, works for name =~ /.store_\d/

  _execute: (rs) -> 
    if @name.match /[ld]store/
      rs.put_cl2(@var_num,rs.pop2())
    else
      rs.put_cl(@var_num,rs.pop())

class root.StoreVarOpcode extends root.StoreOpcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 1
  take_args: (code_array) ->
    @var_num = code_array.get_uint(1)

class root.SwitchOpcode extends root.BranchOpcode
  constructor: (name, params) ->
    super name, params
    @byte_count = null

  execute: (rs) ->
    key = rs.pop()
    if @offsets[key]?
      rs.inc_pc @offsets[key]
    else
      rs.inc_pc @_default

class root.LookupSwitchOpcode extends root.SwitchOpcode
  take_args: (code_array, constant_pool) ->
    # account for padding that ensures alignment
    padding_size = (4 - code_array.index % 4) % 4
    code_array.index += padding_size
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
    padding_size = (4 - code_array.index % 4) % 4
    code_array.index += padding_size
    @_default = code_array.get_int(4)
    @low = code_array.get_int(4)
    @high = code_array.get_int(4)
    @offsets = {}
    total_offsets = @high - @low + 1
    for i in [0...total_offsets]
      offset = code_array.get_int(4)
      @offsets[@low + i] = offset
    @byte_count = padding_size + 12 + 4 * total_offsets

# these objects are used as prototypes for the parsed instructions in the
# classfile
root.opcodes = {
  00: new root.Opcode 'nop'
  01: new root.Opcode 'aconst_null', { execute: (rs) -> rs.push 0 }
  02: new root.Opcode 'iconst_m1', { execute: (rs) -> rs.push -1 }
  03: new root.Opcode 'iconst_0', { execute: (rs) -> rs.push 0 }
  04: new root.Opcode 'iconst_1', { execute: (rs) -> rs.push 1 }
  05: new root.Opcode 'iconst_2', { execute: (rs) -> rs.push 2 }
  06: new root.Opcode 'iconst_3', { execute: (rs) -> rs.push 3 }
  07: new root.Opcode 'iconst_4', { execute: (rs) -> rs.push 4 }
  08: new root.Opcode 'iconst_5', { execute: (rs) -> rs.push 5 }
  09: new root.Opcode 'lconst_0', { execute: (rs) -> rs.push 0, null }
  10: new root.Opcode 'lconst_1', { execute: (rs) -> rs.push 1, null }
  11: new root.Opcode 'fconst_0', { execute: (rs) -> rs.push 0 }
  12: new root.Opcode 'fconst_1', { execute: (rs) -> rs.push 1 }
  13: new root.Opcode 'fconst_2', { execute: (rs) -> rs.push 2 }
  14: new root.Opcode 'dconst_0', { execute: (rs) -> rs.push 0, null }
  15: new root.Opcode 'dconst_1', { execute: (rs) -> rs.push 1, null }
  16: new root.PushOpcode 'bipush', { byte_count: 1 }
  17: new root.PushOpcode 'sipush', { byte_count: 2 }
  18: new root.LoadConstantOpcode 'ldc', { byte_count: 1 }
  19: new root.LoadConstantOpcode 'ldc_w', { byte_count: 2 }
  20: new root.LoadConstantOpcode 'ldc2_w', { byte_count: 2 }
  21: new root.LoadVarOpcode 'iload', { execute: (rs) -> rs.push rs.cl(@var_num) }
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
  46: new root.Opcode 'iaload', { execute: (rs) -> i=rs.pop(); rs.push rs.get_obj(rs.pop()).array[i] }
  47: new root.Opcode 'laload'
  48: new root.Opcode 'faload', { execute: (rs) -> i=rs.pop(); rs.push rs.get_obj(rs.pop()).array[i] }
  49: new root.Opcode 'daload'
  50: new root.Opcode 'aaload', { execute: (rs) -> i=rs.pop(); rs.push rs.get_obj(rs.pop()).array[i] }
  51: new root.Opcode 'baload', { execute: (rs) -> i=rs.pop(); rs.push rs.get_obj(rs.pop()).array[i] }
  52: new root.Opcode 'caload', { execute: (rs) -> i=rs.pop(); rs.push rs.get_obj(rs.pop()).array[i] }
  53: new root.Opcode 'saload', { execute: (rs) -> i=rs.pop(); rs.push rs.get_obj(rs.pop()).array[i] }
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
  79: new root.Opcode 'iastore', {execute: (rs) -> v=rs.pop();i=rs.pop();rs.get_obj(rs.pop()).array[i]=v }
  80: new root.Opcode 'lastore'
  81: new root.Opcode 'fastore', {execute: (rs) -> v=rs.pop();i=rs.pop();rs.get_obj(rs.pop()).array[i]=v }
  82: new root.Opcode 'dastore'
  83: new root.Opcode 'aastore', {execute: (rs) -> v=rs.pop();i=rs.pop();rs.get_obj(rs.pop()).array[i]=v }
  84: new root.Opcode 'bastore', {execute: (rs) -> v=rs.pop();i=rs.pop();rs.get_obj(rs.pop()).array[i]=v }
  85: new root.Opcode 'castore', {execute: (rs) -> v=rs.pop();i=rs.pop();rs.get_obj(rs.pop()).array[i]=v }
  86: new root.Opcode 'sastore', {execute: (rs) -> v=rs.pop();i=rs.pop();rs.get_obj(rs.pop()).array[i]=v }
  87: new root.Opcode 'pop', { execute: (rs) -> rs.pop() }
  88: new root.Opcode 'pop2', { execute: (rs) -> rs.pop2() }
  089: new root.Opcode 'dup', { execute: (rs) -> v=rs.pop(); rs.push(v,v) }
  090: new root.Opcode 'dup_x1', { execute: (rs) -> v1=rs.pop(); v2=rs.pop(); rs.push(v1,v2,v1) }
  091: new root.Opcode 'dup_x2'
  092: new root.Opcode 'dup2', {execute: (rs) -> v2=rs.pop(); v1=rs.pop(); rs.push(v1,v2,v1,v2)}
  093: new root.Opcode 'dup2_x1'
  094: new root.Opcode 'dup2_x2'
  095: new root.Opcode 'swap', {execute: (rs) -> v2=rs.pop(); v1=rs.pop(); rs.push(v2,v1)}
  # TODO handle overflow?
  096: new root.Opcode 'iadd', { execute: (rs) -> rs.push(rs.pop()+rs.pop()) }
  097: new root.Opcode 'ladd', { execute: (rs) -> rs.push(rs.pop2()+rs.pop2(), null) }
  098: new root.Opcode 'fadd', { execute: (rs) -> rs.push(rs.pop()+rs.pop()) }
  099: new root.Opcode 'dadd', { execute: (rs) -> rs.push(rs.pop2()+rs.pop2(), null) }
  100: new root.Opcode 'isub', { execute: (rs) -> rs.push(-rs.pop()+rs.pop()) }
  101: new root.Opcode 'lsub', { execute: (rs) -> rs.push(-rs.pop2()+rs.pop2(), null) }
  102: new root.Opcode 'fsub', { execute: (rs) -> rs.push(-rs.pop()+rs.pop()) }
  103: new root.Opcode 'dsub', { execute: (rs) -> rs.push(-rs.pop2()+rs.pop2(), null) }
  104: new root.Opcode 'imul', { execute: (rs) -> rs.push(rs.pop()*rs.pop()) }
  105: new root.Opcode 'lmul', { execute: (rs) -> rs.push(rs.pop2()*rs.pop2(), null) }
  106: new root.Opcode 'fmul', { execute: (rs) -> rs.push(rs.pop()*rs.pop()) }
  107: new root.Opcode 'dmul', { execute: (rs) -> rs.push(rs.pop2()*rs.pop2(), null) }
  108: new root.Opcode 'idiv', { execute: (rs) -> rs.push(rs.pop()/rs.pop()) }          #TODO: do int division!
  109: new root.Opcode 'ldiv', { execute: (rs) -> rs.push(rs.pop2()/rs.pop2(), null) }  #TODO: do int division!
  110: new root.Opcode 'fdiv', { execute: (rs) -> rs.push(rs.pop()/rs.pop()) }
  111: new root.Opcode 'ddiv', { execute: (rs) -> rs.push(rs.pop2()/rs.pop2(), null) }
  # TODO throw an ArithmeticException if modulus is zero
  112: new root.Opcode 'irem', { execute: (rs) -> v2=rs.pop();  rs.push rs.pop() %v2 }
  113: new root.Opcode 'lrem', { execute: (rs) -> v2=rs.pop2(); rs.push rs.pop2()%v2, null }
  114: new root.Opcode 'frem', { execute: (rs) -> v2=rs.pop();  rs.push rs.pop() %v2 }
  115: new root.Opcode 'drem', { execute: (rs) -> v2=rs.pop2(); rs.push rs.pop2()%v2, null }
  116: new root.Opcode 'ineg', { execute: (rs) -> rs.push -rs.pop() }
  117: new root.Opcode 'lneg', { execute: (rs) -> rs.push -rs.pop2(), null }
  118: new root.Opcode 'fneg', { execute: (rs) -> rs.push -rs.pop() }
  119: new root.Opcode 'dneg', { execute: (rs) -> rs.push -rs.pop2(), null }
  120: new root.Opcode 'ishl', { execute: (rs) -> s=rs.pop()&0x1F; rs.push(rs.pop()<<s) }
  121: new root.Opcode 'lshl'
  122: new root.Opcode 'ishr', { execute: (rs) -> s=rs.pop()&0x1F; rs.push(rs.pop()>>>s) }
  123: new root.Opcode 'lshr'
  124: new root.Opcode 'iushr', { execute: (rs) -> s=rs.pop()&0x1F; rs.push(rs.pop()>>s) }
  125: new root.Opcode 'lushr'
  126: new root.Opcode 'iand', { execute: (rs) -> rs.push(rs.pop()&rs.pop()) }
  127: new root.Opcode 'land', { execute: (rs) -> rs.push(rs.pop2()&rs.pop2(), null) }
  128: new root.Opcode 'ior',  { execute: (rs) -> rs.push(rs.pop()|rs.pop()) }
  129: new root.Opcode 'lor',  { execute: (rs) -> rs.push(rs.pop2()|rs.pop2(), null) }
  130: new root.Opcode 'ixor', { execute: (rs) -> rs.push(rs.pop()^rs.pop()) }
  131: new root.Opcode 'lxor', { execute: (rs) -> rs.push(rs.pop2()^rs.pop2(), null) }
  132: new root.IIncOpcode 'iinc'
  133: new root.Opcode 'i2l', { execute: (rs) -> rs.push null }
  134: new root.Opcode 'i2f', { execute: (rs) -> }
  135: new root.Opcode 'i2d', { execute: (rs) -> rs.push null }
  136: new root.Opcode 'l2i', { execute: (rs) -> rs.push rs.pop2() }  #TODO: truncate to 32 bit int
  137: new root.Opcode 'l2f', { execute: (rs) -> rs.push rs.pop2() }
  138: new root.Opcode 'l2d', { execute: (rs) -> }
  139: new root.Opcode 'f2i', { execute: (rs) -> rs.push Math.floor(rs.pop()) }
  140: new root.Opcode 'f2l', { execute: (rs) -> rs.push Math.floor(rs.pop()), null }
  141: new root.Opcode 'f2d', { execute: (rs) -> rs.push null }
  142: new root.Opcode 'd2i', { execute: (rs) -> rs.push Math.floor(rs.pop2()) }
  143: new root.Opcode 'd2l', { execute: (rs) -> rs.push Math.floor(rs.pop2()), null }
  144: new root.Opcode 'd2f', { execute: (rs) -> rs.push rs.pop2() }
  145: new root.Opcode 'i2b', { execute: (rs) -> }  #TODO: truncate to 8 bits
  146: new root.Opcode 'i2c', { execute: (rs) -> }  #TODO: truncate to 8 bits
  147: new root.Opcode 'i2s', { execute: (rs) -> }  #TODO: truncate to 16 bits
  148: new root.Opcode 'lcmp', { execute: (rs) -> v2=rs.pop2(); rs.push util.cmp(rs.pop2(),v2) }
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
  167: new root.BranchOpcode 'goto', { execute: (rs) -> rs.inc_pc(@offset) }
  168: new root.Opcode 'jsr'
  169: new root.Opcode 'ret', { byte_count: 1 }
  170: new root.TableSwitchOpcode 'tableswitch'
  171: new root.LookupSwitchOpcode 'lookupswitch'
  172: new root.Opcode 'ireturn', { execute: (rs) -> }  # explicitly make these NOPs
  173: new root.Opcode 'lreturn', { execute: (rs) -> }
  174: new root.Opcode 'freturn', { execute: (rs) -> }
  175: new root.Opcode 'dreturn', { execute: (rs) -> }
  176: new root.Opcode 'areturn', { execute: (rs) -> }
  177: new root.Opcode 'return', { execute: (rs) -> }
  178: new root.FieldOpcode 'getstatic', {execute: (rs)-> rs.static_get @field_spec }
  179: new root.FieldOpcode 'putstatic', {execute: (rs)-> rs.static_put @field_spec }
  180: new root.FieldOpcode 'getfield', {execute: (rs)-> rs.heap_get @field_spec, rs.pop() }
  181: new root.FieldOpcode 'putfield', {execute: (rs)-> rs.heap_put @field_spec }
  182: new root.InvokeOpcode 'invokevirtual',{ execute: (rs)-> rs.method_lookup(@method_spec).run(rs,true)}
  183: new root.InvokeOpcode 'invokespecial',{ execute: (rs)-> rs.method_lookup(@method_spec).run(rs)}
  184: new root.InvokeOpcode 'invokestatic', { execute: (rs)-> rs.method_lookup(@method_spec).run(rs)}
  185: new root.InvokeOpcode 'invokeinterface'
  187: new root.ClassOpcode 'new', { execute: (rs) -> rs.heap_new @class }
  188: new root.Opcode 'newarray', { byte_count: 1, execute: (rs) -> rs.heap_newarray @args[0], rs.pop() }
  189: new root.ClassOpcode 'anewarray', { execute: (rs) -> rs.heap_newarray @class, rs.pop() }
  190: new root.Opcode 'arraylength', { execute: (rs) -> rs.push rs.get_obj(rs.pop()).array.length }
  191: new root.Opcode 'athrow'
  192: new root.ClassOpcode 'checkcast', { execute: (rs) -> o=rs.pop(); rs.push o if o<=0 or rs.check_cast(o,@class) }
  193: new root.ClassOpcode 'instanceof', { execute: (rs) -> o=rs.pop(); rs.push if o>0 then rs.check_cast(o,@class)+0 else 0 }
  194: new root.Opcode 'monitorenter', { execute: (rs)-> rs.pop() }  #TODO: actually implement locks?
  195: new root.Opcode 'monitorexit',  { execute: (rs)-> rs.pop() }  #TODO: actually implement locks?
  196: new root.Opcode 'wide', { take_args: -> throw new Error "wide instr NYI" }
  197: new root.Opcode 'multianewarray', { byte_count: 3 }
  198: new root.UnaryBranchOpcode 'ifnull', { cmp: (v) -> v <= 0 }
  199: new root.UnaryBranchOpcode 'ifnonnull', { cmp: (v) -> v > 0 }
  200: new root.BranchOpcode 'goto_w', { byte_count: 4 }
  201: new root.Opcode 'jsr_w'
}
