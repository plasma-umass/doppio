
# things assigned to root will be available outside this module
root = exports ? this 

class Opcode
  constructor: (@name) ->

  take_args: (code_array) ->
    return code_array

class LocalVarOpcode extends Opcode
  take_args: (code_array) ->
    @var_num = code_array.get_uint8()
    return code_array

class FieldOpcode extends Opcode
  take_args: (code_array) ->
    @field_spec = code_array.get_uint8()
    @descriptor = code_array.get_uint8()
    return code_array

class InvokeOpcode extends Opcode
  take_args: (code_array, constant_pool) ->
    @method_spec = constant_pool.get code_array.get_uint16()
    return code_array

class LoadOpcode extends Opcode
  take_args: (code_array, constant_pool) ->
    @constant = constant_pool.get code_array.get_uint8()
    return code_array

root.opcodes = {
  3:   new Opcode 'iconst_0'
  12:  new Opcode 'fconst_1'
  18:  new LoadOpcode 'ldc'
  42:  new Opcode 'aload_0'
  177: new Opcode 'return'
  178: new FieldOpcode 'getstatic'
  182: new InvokeOpcode 'invokevirtual'
  183: new InvokeOpcode 'invokespecial'
}
