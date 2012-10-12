_ = require '../third_party/_.js'
util = require './util'

class BasicBlock
  constructor: (@start_idx) ->
    @opcodes = []
    @stack = []
    @external_stack_count = 0

  push: (args...) -> @stack.push.apply @stack, args
  pop: ->
    if @stack.length > 0
      @stack.pop()
    else
      # not correct; I think it needs some liveness analysis
      "S#{@external_stack_count++}"

  compile: ->
    instr_idx = @start_idx
    body = ""
    for op in @opcodes
      compiled_str = compile_fns[op.name]?.compile.call(op, @, instr_idx)
      body += "#{compiled_str};\n" if compiled_str?
      instr_idx += op.byte_count + 1
    """
    case #{@start_idx}:
    // #{op.name for op in @opcodes}
    #{body}
    """

compile_fns = {
  nop: { compile: -> }
  aconst_null: { compile: (b) -> b.push "null"; null }
  iconst_m1: { compile: (b) -> b.push "-1"; null }
  iconst_0: { compile: (b) -> b.push "0"; null }
  iconst_1: { compile: (b) -> b.push "1"; null }
  iconst_2: { compile: (b) -> b.push "2"; null }
  iconst_3: { compile: (b) -> b.push "3"; null }
  iconst_4: { compile: (b) -> b.push "4"; null }
  iconst_5: { compile: (b) -> b.push "5"; null }
  lconst_0: { compile: (b) -> b.push "gLong.ZERO", null; null }
  istore_0: { compile: (b) -> "L0 = #{b.pop()}" }
  istore_1: { compile: (b) -> "L1 = #{b.pop()}" }
  istore_2: { compile: (b) -> "L2 = #{b.pop()}" }
  istore_3: { compile: (b) -> "L3 = #{b.pop()}" }
  iload_0: { compile: (b) -> b.push "L0"; null }
  iload_1: { compile: (b) -> b.push "L1"; null }
  iload_2: { compile: (b) -> b.push "L2"; null }
  iload_3: { compile: (b) -> b.push "L3"; null }
  iadd: { compile: (b) -> b.push "wrap_int(#{b.pop()}+#{b.pop()})"; null }
  imul: { compile: (b) -> b.push "gLong.fromInt(#{b.pop()}).multiply(gLong.fromInt(#{b.pop()})).toInt()"; null }
  ifge: { compile: (b, idx) -> "if (#{b.pop()} >= 0) { label = #{@offset + idx}; continue }" }
  ireturn: { compile: (b) -> "return #{b.pop()}" }
  'return': { compile: (b) -> "return"; }
}

# partition the opcodes into basic blocks
get_blocks_for_method = (m) ->
  targets = [0]
  m.code.each_opcode (idx, oc) ->
    # ret is the only instruction that does not have an 'offset' field.
    # however, it will only jump to locations that follow jsr, so we do
    # not need to worry about it
    if oc.offset?
      targets.push idx + oc.byte_count + 1, idx + oc.offset

  targets.sort()
  # dedup
  labels = []
  for target, i in targets
    if i == 0 or targets[i-1] != target
      labels.push target

  blocks = (new BasicBlock idx for idx in labels)
  current_block = -1
  m.code.each_opcode (idx, oc) ->
    current_block++ if idx in labels
    blocks[current_block].opcodes.push oc

  blocks

root.compile = (class_file) ->
  class_name = class_file.this_class.toExternalString()
  methods =
    for sig, m of class_file.methods
      unless m.access_flags.native or m.access_flags.abstract
        name =
          if m.name is '<init>' then class_name
          else if m.name is '<clinit>' then '__clinit__'
          else m.name

        param_names = []
        params_size = 0
        for p in m.param_types
          param_names.push "L#{params_size}"
          if p.toString() in ['D','J']
            params_size += 2
          else
            params_size++

        """
        #{name}: function(#{param_names.join ", "}) {
          var label = 0;
          while (true) {
            switch (label) {
#{(block.compile() for block in get_blocks_for_method m).join ""}
            };
          };
        },
        """

  "var #{class_name} = {\n#{methods.join "\n"}\n};\n"

# TODO: move to a separate file
fs = require 'fs'
ClassFile = require '../src/ClassFile'
fname = if process.argv.length > 2 then process.argv[2] else '/dev/stdin'
bytes_array = util.bytestr_to_array fs.readFileSync(fname, 'binary')
class_data = new ClassFile bytes_array

console.log root.compile class_data
