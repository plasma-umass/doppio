
# things assigned to root will be available outside this module
root = exports ? this 

class Opcode
  constructor: (@name,@nargs) ->
    @args = []

  take_args: (code_array) ->
    @args = code_array.splice(0,@nargs)
    return code_array

root.opcodes = {
  3:   new Opcode('iconst_0',0)
  12:  new Opcode('fconst_1',0)
  18:  new Opcode('ldc',1)
  42:  new Opcode('aload_0',0)
  177: new Opcode('return',0)
  178: new Opcode('getstatic',2)
  182: new Opcode('invokevirtual',2)
  183: new Opcode('invokespecial',2)
}