class Opcode
  constructor: (@name, params={}) ->
    @execute = params.execute ? @_execute
    @byte_count = params.byte_count ? 0

  take_args: (code_array) ->
    @args = [code_array.get_uint(1) for i in [0...@byte_count]]
  
  _execute: (rs) -> console.log "#{@name} is a NOP"

class FieldOpcode extends Opcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 2
    
  take_args: (code_array) ->
    @field_spec_ref = code_array.get_uint(1)
    @descriptor_ref = code_array.get_uint(1)

class ClassOpcode extends Opcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 2
    
  take_args: (code_array, constant_pool) ->
    @class_ref = code_array.get_uint(2)
    @class = constant_pool.get(@class_ref).deref()

class InvokeOpcode extends Opcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 2
    
  take_args: (code_array, constant_pool) ->
    @method_spec_ref = code_array.get_uint(2)
    # invokeinterface has two redundant bytes
    code_array.index += 2 if @name == 'invokeinterface'
    method_spec = constant_pool.get(@method_spec_ref).deref()
    @method_name = method_spec.sig.name

class LoadConstantOpcode extends Opcode
  take_args: (code_array, constant_pool) ->
    @constant_ref = code_array.get_uint @byte_count
    @constant = constant_pool.get @constant_ref
  
  _execute: (rs) -> 
    rs.push @constant.value
    rs.push undefined if @byte_count is 2

class BranchOpcode extends Opcode
  constructor: (name, params={ byte_count: 2 }) ->
    super name, params

  take_args: (code_array) ->
    @offset = code_array.get_int @byte_count

class PushOpcode extends Opcode
  take_args: (code_array) ->
    @value = code_array.get_int @byte_count

  _execute: (rs) -> rs.push @value

class IIncOpcode extends Opcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 2
    
  take_args: (code_array) ->
    @index = code_array.get_uint 1
    @const = code_array.get_int 1

  _execute: (rs) -> rs.put_cl(@index,rs.cl(@index)+@const)

class LoadOpcode extends Opcode
  take_args: (code_array) ->
    @var_num = parseInt @name[6]  # sneaky hack, works for name =~ /.load_\d/
  _execute: (rs) ->
    rs.push rs.cl(@var_num)
    rs.push undefined if @name.match /[ld]load/

class LoadVarOpcode extends LoadOpcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 1
  take_args: (code_array) ->
    @var_num = code_array.get_uint(1)

class StoreOpcode extends Opcode
  take_args: (code_array) ->
    @var_num = parseInt @name[7]  # sneaky hack, works for name =~ /.store_\d/
  _execute: (rs) -> 
    if @name.match /[ld]store/
      rs.put_cl2(@var_num,rs.pop2())
    else
      rs.put_cl(@var_num,rs.pop())

class StoreVarOpcode extends StoreOpcode
  constructor: (name, params) ->
    super name, params
    @byte_count = 1
  take_args: (code_array) ->
    @var_num = code_array.get_uint(1)

# these objects are used as prototypes for the parsed instructions in the
# classfile
@opcodes = {
  00: new Opcode 'nop'
  01: new Opcode 'aconst_null'
  02: new Opcode 'iconst_m1'
  03: new Opcode 'iconst_0', { execute: (rs) -> rs.push 0 }
  04: new Opcode 'iconst_1', { execute: (rs) -> rs.push 1 }
  05: new Opcode 'iconst_2', { execute: (rs) -> rs.push 2 }
  06: new Opcode 'iconst_3', { execute: (rs) -> rs.push 3 }
  07: new Opcode 'iconst_4', { execute: (rs) -> rs.push 4 }
  08: new Opcode 'iconst_5', { execute: (rs) -> rs.push 5 }
  09: new Opcode 'lconst_0'
  10: new Opcode 'lconst_1'
  11: new Opcode 'fconst_0'
  12: new Opcode 'fconst_1'
  13: new Opcode 'fconst_2'
  14: new Opcode 'dconst_0'
  15: new Opcode 'dconst_1'
  16: new PushOpcode 'bipush', { byte_count: 1 }
  17: new PushOpcode 'sipush', { byte_count: 2 }
  18: new LoadConstantOpcode 'ldc', { byte_count: 1 }
  19: new LoadConstantOpcode 'ldc_w', { byte_count: 2 }
  20: new LoadConstantOpcode 'ldc2_w', { byte_count: 2 }
  21: new LoadVarOpcode 'iload'
  22: new LoadVarOpcode 'lload'
  23: new LoadVarOpcode 'fload'
  24: new LoadVarOpcode 'dload'
  25: new LoadVarOpcode 'aload'
  26: new LoadOpcode 'iload_0'
  27: new LoadOpcode 'iload_1'
  28: new LoadOpcode 'iload_2'
  29: new LoadOpcode 'iload_3'
  30: new LoadOpcode 'lload_0'
  31: new LoadOpcode 'lload_1'
  32: new LoadOpcode 'lload_2'
  33: new LoadOpcode 'lload_3'
  34: new LoadOpcode 'fload_0'
  35: new LoadOpcode 'fload_1'
  36: new LoadOpcode 'fload_2'
  37: new LoadOpcode 'fload_3'
  38: new LoadOpcode 'dload_0'
  39: new LoadOpcode 'dload_1'
  40: new LoadOpcode 'dload_2'
  41: new LoadOpcode 'dload_3'
  42: new LoadOpcode 'aload_0'
  43: new LoadOpcode 'aload_1'
  44: new LoadOpcode 'aload_2'
  45: new LoadOpcode 'aload_3'
  46: new Opcode 'iaload'
  47: new Opcode 'laload'
  48: new Opcode 'faload'
  49: new Opcode 'daload'
  50: new Opcode 'aaload'
  51: new Opcode 'baload'
  52: new Opcode 'caload'
  53: new Opcode 'saload'
  54: new StoreVarOpcode 'istore', { execute: (rs) -> rs.put_cl(@var_num,rs.pop()) }
  55: new StoreVarOpcode 'lstore', { execute: (rs) -> rs.put_cl2(@var_num,rs.pop2()) }
  56: new StoreVarOpcode 'fstore', { execute: (rs) -> rs.put_cl(@var_num,rs.pop()) }
  57: new StoreVarOpcode 'dstore', { execute: (rs) -> rs.put_cl2(@var_num,rs.pop2()) }
  58: new StoreVarOpcode 'astore'
  59: new StoreOpcode 'istore_0'
  60: new StoreOpcode 'istore_1'
  61: new StoreOpcode 'istore_2'
  62: new StoreOpcode 'istore_3'
  63: new StoreOpcode 'lstore_0'
  64: new StoreOpcode 'lstore_1'
  65: new StoreOpcode 'lstore_2'
  66: new StoreOpcode 'lstore_3'
  67: new StoreOpcode 'fstore_0'
  68: new StoreOpcode 'fstore_1'
  69: new StoreOpcode 'fstore_2'
  70: new StoreOpcode 'fstore_3'
  71: new StoreOpcode 'dstore_0'
  72: new StoreOpcode 'dstore_1'
  73: new StoreOpcode 'dstore_2'
  74: new StoreOpcode 'dstore_3'
  75: new Opcode 'astore_0'
  76: new Opcode 'astore_1'
  77: new Opcode 'astore_2'
  78: new Opcode 'astore_3'
  79: new Opcode 'iastore'
  80: new Opcode 'lastore'
  81: new Opcode 'fastore'
  82: new Opcode 'dastore'
  83: new Opcode 'aastore'
  84: new Opcode 'bastore'
  85: new Opcode 'castore'
  86: new Opcode 'sastore'
  87: new Opcode 'pop', { execute: (rs) -> rs.pop() }
  88: new Opcode 'pop2', { execute: (rs) -> rs.pop2() }
  089: new Opcode 'dup'
  090: new Opcode 'dup_x1'
  091: new Opcode 'dup_x2'
  092: new Opcode 'dup2'
  093: new Opcode 'dup2_x1'
  094: new Opcode 'dup2_x2'
  095: new Opcode 'swap'
  096: new Opcode 'iadd', { execute: (rs) -> rs.push(rs.pop()+rs.pop()) }
  097: new Opcode 'ladd', { execute: (rs) -> rs.push(rs.pop2()+rs.pop2()) }
  098: new Opcode 'fadd', { execute: (rs) -> rs.push(rs.pop()+rs.pop()) }
  099: new Opcode 'dadd', { execute: (rs) -> rs.push(rs.pop2()+rs.pop2()) }
  100: new Opcode 'isub'
  101: new Opcode 'lsub'
  102: new Opcode 'fsub'
  103: new Opcode 'dsub'
  104: new Opcode 'imul'
  105: new Opcode 'lmul'
  106: new Opcode 'fmul'
  107: new Opcode 'dmul'
  108: new Opcode 'idiv'
  109: new Opcode 'ldiv'
  110: new Opcode 'fdiv'
  111: new Opcode 'ddiv'
  112: new Opcode 'irem'
  113: new Opcode 'lrem'
  114: new Opcode 'frem'
  115: new Opcode 'drem'
  116: new Opcode 'ineg'
  117: new Opcode 'lneg'
  118: new Opcode 'fneg'
  119: new Opcode 'dneg'
  120: new Opcode 'ishl'
  121: new Opcode 'lshl'
  122: new Opcode 'ishr'
  123: new Opcode 'lshr'
  124: new Opcode 'iushr'
  125: new Opcode 'lushr'
  126: new Opcode 'iand'
  127: new Opcode 'land'
  128: new Opcode 'ior'
  129: new Opcode 'lor'
  130: new Opcode 'ixor'
  131: new Opcode 'lxor'
  132: new IIncOpcode 'iinc'
  133: new Opcode 'i2l'
  134: new Opcode 'i2f'
  135: new Opcode 'i2d'
  136: new Opcode 'l2i', {execute: (rs) -> rs.push(rs.pop2())}  #TODO: truncate to 32 bit int
  137: new Opcode 'l2f'
  138: new Opcode 'l2d'
  139: new Opcode 'f2i'
  140: new Opcode 'f2l'
  141: new Opcode 'f2d'
  142: new Opcode 'd2i', { execute: (rs) -> rs.push(Math.floor(rs.pop2())) }
  143: new Opcode 'd2l'
  144: new Opcode 'd2f'
  145: new Opcode 'i2b'
  146: new Opcode 'i2c'
  147: new Opcode 'i2s'
  148: new Opcode 'lcmp'
  149: new Opcode 'fcmpl'
  150: new Opcode 'fcmpg'
  151: new Opcode 'dcmpl'
  152: new Opcode 'dcmpg'
  153: new BranchOpcode 'ifeq'
  154: new BranchOpcode 'ifne'
  155: new BranchOpcode 'iflt'
  156: new BranchOpcode 'ifge'
  157: new BranchOpcode 'ifgt'
  158: new BranchOpcode 'ifle'
  159: new BranchOpcode 'if_icmpeq'
  160: new BranchOpcode 'if_icmpne'
  161: new BranchOpcode 'if_icmplt'
  162: new BranchOpcode 'if_icmpge'
  163: new BranchOpcode 'if_icmpgt'
  164: new BranchOpcode 'if_icmple'
  165: new BranchOpcode 'if_acmpeq'
  166: new BranchOpcode 'if_acmpne'
  167: new BranchOpcode 'goto'
  168: new Opcode 'jsr'
  169: new Opcode 'ret', { byte_count: 1 }
  170: new Opcode 'tableswitch'
  171: new Opcode 'lookupswitch'
  172: new Opcode 'ireturn'
  173: new Opcode 'lreturn'
  174: new Opcode 'freturn'
  175: new Opcode 'dreturn'
  176: new Opcode 'areturn'
  177: new Opcode 'return'
  178: new FieldOpcode 'getstatic'
  179: new FieldOpcode 'putstatic'
  180: new FieldOpcode 'getfield'
  181: new FieldOpcode 'putfield'
  182: new InvokeOpcode 'invokevirtual'
  183: new InvokeOpcode 'invokespecial'
  184: new InvokeOpcode 'invokestatic', { execute: (rs)-> rs.method_by_name(@method_name).run(rs)}
  185: new InvokeOpcode 'invokeinterface'
  187: new ClassOpcode 'new'
  188: new Opcode 'newarray', { byte_count: 1 }
  189: new ClassOpcode 'anewarray'
  190: new Opcode 'arraylength'
  191: new Opcode 'athrow'
  192: new ClassOpcode 'checkcast'
  193: new ClassOpcode 'instanceof'
  194: new Opcode 'monitorenter'
  195: new Opcode 'monitorexit'
  196: new Opcode 'wide'
  197: new Opcode 'multianewarray', { byte_count: 3 }
  198: new BranchOpcode 'ifnull'
  199: new BranchOpcode 'ifnonnull'
  200: new BranchOpcode 'goto_w', { byte_count: 4 }
  201: new Opcode 'jsr_w'
}

module?.exports = @opcodes
