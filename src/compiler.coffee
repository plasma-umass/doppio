_ = require '../third_party/_.js'
util = require './util'

root = exports ? window.opcodes = {}

INDENT_SIZE = 4

class RuntimeState
  constructor: ->
    @_cs = []
    @locals = []
    @var_count = 0

    @blocks = []
    @block_start_idxs = []
    @new_block 0

  push: (sf) -> @_cs.push sf
  pop: -> @_cs.pop()
  cl: (idx) -> @locals[idx]
  put_cl: (idx, val) -> @locals[idx] = val
  put_cl2: (idx,val) -> @put_cl(idx,val); @put_cl(idx+1,null)

  add_cond: (condFn, expr, dest1, dest2) ->
    @current_block().cond = { condFn: condFn, expr: expr, dest1: dest1, dest2: dest2 }
    @new_block dest1

  new_block: (start_idx) ->
    @blocks.push new BasicBlock
    @block_start_idxs.push(start_idx)

  current_block: -> _.last @blocks

  instr_idx2block: (idx) ->
    for blockStartIdx, i in @block_start_idxs
      return i - 1 if idx < blockStartIdx
    return @blocks.length - 1

  compile: ->
    for block, idx in @blocks
      if block.cond?
        d1 = @instr_idx2block block.cond.dest1
        d2 = @instr_idx2block block.cond.dest2
        block.out.push d1, d2
        @blocks[d1].in.push idx
        @blocks[d2].in.push idx

    @compile_block(@blocks[0], 1)

  compile_block: (block, indent) ->
    indentation = (" " for i in [0...INDENT_SIZE * indent] by 1).join ''
    if block.in.length <= 1 && block.out.length == 2
      "#{indentation}if (#{block.cond.condFn block.cond.expr}) {\n#{
        @compile_block @blocks[block.out[1]], indent + 1
      }\n#{indentation}} else {\n#{
        @compile_block @blocks[block.out[0]], indent + 1
      }\n#{indentation}}"
    else
      indentation + block

class BasicBlock
  constructor: ->
    @in = []
    @out = []
    @lines = []
    @cond = null

  add_line: (line) -> @lines.push line

  toString: -> @lines.join "\n"

class Expr

class Primitive extends Expr
  constructor: (@val) ->

  toString: -> @val

class Variable extends Expr

  constructor: (id) ->
    @strId = ""
    while id >= 0
      @strId = String.fromCharCode((id % 26) + 97) # 97 = 'a'
      id -= 26

  toString: -> @strId

class BinaryOp extends Expr
  constructor: (@op_func, @left, @right) ->

  toString: -> @op_func(@left, @right)

opcodes = {
  nop: { execute: -> }
  aconst_null: { execute: (rs) -> rs.push new Primitive null }
  iconst_m1: { execute: (rs) -> rs.push new Primitive -1 }
  iconst_0: { execute: (rs) -> rs.push new Primitive 0 }
  iconst_1: { execute: (rs) -> rs.push new Primitive 1 }
  iconst_2: { execute: (rs) -> rs.push new Primitive 2 }
  iconst_3: { execute: (rs) -> rs.push new Primitive 3 }
  iconst_4: { execute: (rs) -> rs.push new Primitive 4 }
  iconst_5: { execute: (rs) -> rs.push new Primitive 5 }
  lconst_0: { execute: (rs) -> rs.push new Primitive("gLong.ZERO"), null }
  istore_0: { execute: (rs) -> rs.put_cl 0, rs.pop() }
  istore_1: { execute: (rs) -> rs.put_cl 1, rs.pop() }
  istore_2: { execute: (rs) -> rs.put_cl 2, rs.pop() }
  istore_3: { execute: (rs) -> rs.put_cl 3, rs.pop() }
  iload_0: { execute: (rs) -> rs.push rs.cl(0) }
  iload_1: { execute: (rs) -> rs.push rs.cl(1) }
  iload_2: { execute: (rs) -> rs.push rs.cl(2) }
  iload_3: { execute: (rs) -> rs.push rs.cl(3) }
  iadd: { execute: (rs) -> rs.push new BinaryOp ((a,b) -> "wrap_int(#{a}+#{b})"), rs.pop(), rs.pop() }
  imul: { execute: (rs) -> rs.push new BinaryOp ((a,b) ->
    "gLong.fromInt(#{a}).multiply(gLong.fromInt(#{b})).toInt()"), rs.pop(), rs.pop()
  }
  ifge: { execute: (rs, op, idx) -> rs.add_cond(
    ((a) -> "#{a} >= 0"), rs.pop(), idx + op.byte_count + 1, op.offset + idx) }
  'ireturn': { execute: (rs, op, idx) ->
    rv = rs.pop()
    rs.current_block().add_line "return #{rv};"
    rs.new_block(idx + op.byte_count)
  }
  'return': { execute: (rs, op, idx) -> rs.current_block().add_line 'return;'; }
}

root.compile = (class_file) ->
  class_name = class_file.this_class.toExternalString()
  methods =
    for sig, m of class_file.methods
      unless m.access_flags.native or m.access_flags.abstract
        name =
          if m.name is '<init>' then class_name
          else if m.name is '<clinit>' then '__clinit__'
          else m.name

        rs = new RuntimeState

        vars = []
        params_size = 0
        for p in m.param_types
          vars.push new Variable rs.var_count++
          if p.toString() in ['D','J']
            rs.put_cl2 params_size, _.last vars
            params_size += 2
          else
            rs.put_cl params_size, _.last vars
            params_size++

        m.code.each_opcode (idx, oc) ->
          opcodes[oc.name]?.execute rs, oc, idx
        "#{name}: function(#{vars.join ", "}) {\n#{rs.compile()}\n},"

  "var #{class_name} = {\n#{methods.join "\n"}\n};\n"

# TODO: move to a separate file
fs = require 'fs'
ClassFile = require '../src/ClassFile'
fname = if process.argv.length > 2 then process.argv[2] else '/dev/stdin'
bytes_array = util.bytestr_to_array fs.readFileSync(fname, 'binary')
class_data = new ClassFile bytes_array

console.log root.compile class_data
