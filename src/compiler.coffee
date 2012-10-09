util = require './util'

root = exports ? window.opcodes = {}

class RuntimeState
  constructor: ->
    @_cs = []
    @blocks = []
    @locals = []
    @current_block = ''
  push: (sf) -> @_cs.push sf
  pop: -> @_cs.pop()
  cl: (idx) -> @locals[idx]
  put_cl: (idx, val) -> @locals[idx] = val
  put_cl2: (idx,val) -> @put_cl(idx,val); @put_cl(idx+1,null)
  finish_block: (str) -> @blocks.push @current_block; @current_block = ''
  compile: -> @blocks.join '\n'

class Expr

class Primitive extends Expr
  constructor: (@val) ->

  toString: -> @val

class BinaryOp extends Expr
  constructor: (@op_func, @left, @right) ->

  toString: -> @op_func(@left, @right)

opcodes = {
  nop: { execute: -> }
  aconst_null: { execute: (rs) -> rs.push null }
  iconst_m1: { execute: (rs) -> rs.push new Primitive -1 }
  iconst_0: { execute: (rs) -> rs.push new Primitive 0 }
  iconst_1: { execute: (rs) -> rs.push new Primitive 1 }
  iconst_2: { execute: (rs) -> rs.push new Primitive 2 }
  iconst_3: { execute: (rs) -> rs.push new Primitive 3 }
  iconst_4: { execute: (rs) -> rs.push new Primitive 4 }
  iconst_5: { execute: (rs) -> rs.push new Primitive 5 }
  lconst_0: { execute: (rs) -> rs.push new Primitive(gLong.ZERO), null }
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
  'ireturn': { execute: (rs) ->
    rv = rs.pop()
    rs.current_block += "return #{rv};"
    rs.finish_block()
  }
  'return': { execute: (rs) -> rs.current_block += 'return;'; rs.finish_block() }
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
        m.code.each_opcode (idx, oc) ->
          opcodes[oc.name]?.execute rs, oc
        "#{name}: function {\n#{rs.compile()}\n},"
  "var #{class_name} = {\n#{methods.join "\n"}\n};\n"

# TODO: move to a separate file
fs = require 'fs'
ClassFile = require '../src/ClassFile'
fname = if process.argv.length > 2 then process.argv[2] else '/dev/stdin'
bytes_array = util.bytestr_to_array fs.readFileSync(fname, 'binary')
class_data = new ClassFile bytes_array

console.log root.compile class_data
