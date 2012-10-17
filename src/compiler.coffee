_ = require '../third_party/_.js'
util = require './util'
{Method} = require './methods'

root = exports ? this.compiler = {}

class BlockChain

  constructor: (method) ->
    @blocks = []
    @instr2block = {}
    @temp_count = 0

    # partition the opcodes into basic blocks
    targets = [0]
    method.code.each_opcode (idx, oc) ->
      # ret is the only instruction that does not have an 'offset' field.
      # however, it will only jump to locations that follow jsr, so we do
      # not need to worry about it
      if oc.offset?
        targets.push idx + oc.byte_count + 1, idx + oc.offset

    targets.sort((a,b) -> a - b)
    # dedup
    labels = []
    for target, i in targets
      if i == 0 or targets[i-1] != target
        labels.push target

    for idx, i in labels
      @blocks.push new BasicBlock @, idx
      @instr2block[idx] = i
      # we initially assume all blocks are connected linearly.
      # compiling the individual instructions will adjust this as needed.
      if @blocks.length > 1
        @blocks[@blocks.length - 2].next.push idx

    current_block = -1
    method.code.each_opcode (idx, oc) =>
      current_block++ if idx in labels
      block = @blocks[current_block]
      block.opcodes.push oc

  get_block_from_instr: (idx) -> @blocks[@instr2block[idx]]

  new_temp: -> "$#{@temp_count++}"
  get_all_temps: -> ("$#{i}" for i in [0...@temp_count])

class BasicBlock
  constructor: (@block_chain, @start_idx) ->
    @opcodes = []
    @stack = []
    @locals = []
    @next = []
    @body = ""
    @visited = false

  push: (values...) -> @stack.push.apply @stack, values
  push2: (values...) -> @stack.push v, null for v in values
  pop: -> @stack.pop()
  pop2: -> @stack.pop(); @stack.pop()
  put_cl: (idx, v) ->
    if v?.match? /l\d+/
      @add_line "l#{idx} = #{v}"
      v = "l#{idx}"
    @locals[idx] = v
  put_cl2: (idx, v) ->
    if v?.match? /l\d+/
      @add_line "l#{idx} = #{v}"
      v = "l#{idx}"
    @locals[idx] = v
    @locals[idx+1] = null
  cl: (idx) -> @locals[idx]
  add_line: (line) -> @body += line + ";\n"
  new_temp: -> @block_chain.new_temp()

  compile_epilogue: ->
    # copy our stack / local values into appropriately-named vars so that they
    # can be accessed from other blocks
    for s, i in @stack when s?
      continue if s == "s#{i}"
      @add_line "s#{i} = #{s}"
      @stack[i] = "s#{i}"

    for l, i in @locals when l?
      continue if l == "l#{i}"
      @add_line "l#{i} = #{l}"
      @locals[i] = "l#{i}"

  compile: (@stack = @stack, @locals = @locals) ->
    @visited = true

    instr_idx = @start_idx
    for op in @opcodes
      if (handler = compile_obj_handlers[op.name]?.compile)?
        handler.call(op, @, instr_idx)
      else
        util.lookup_handler compile_class_handlers, op, @, instr_idx
      instr_idx += op.byte_count + 1

    # branching instructions will print the epilogue before they branch; return
    # instructions obviate the need for one
    unless op.offset? or (op.name.indexOf 'return') != -1
      @compile_epilogue()

    @compiled_str =
      """
      case #{@start_idx}:
      // #{op.name for op in @opcodes}
      #{@body}
      """
    for idx in @next
      next_block = @block_chain.get_block_from_instr idx
      unless next_block.visited
        # java bytecode verification ensures that the stack height and stack /
        # local table types match up across blocks
        next_block.compile @stack[..], @locals[..]

class Expr

  constructor: (str, subexps...) ->
    @fragments = str.split /($\d+)/
    for frag, i in @fragments
      if /$\d+/.test frag
        @fragments[i] = subexps[parseInt frag[1..], 10]

  eval: (b) ->
    temp = b.new_temp()
    b.add_line "$0 = #{@}", temp
    new Primitive b

  toString: -> @fragments.join ''

class Primitive extends Expr

  constructor: (@str) ->

  eval: -> @

  toString: -> @str

cmpMap =
  eq: '=='
  ne: '!=='
  lt: '<'
  ge: '>='
  gt: '>'
  le: '<='

compile_class_handlers =
  PushOpcode: (b) -> b.push @value
  StoreOpcode: (b) ->
    if @name.match /[ld]store/
      b.put_cl2(@var_num,b.pop2())
    else
      b.put_cl(@var_num,b.pop())
  LoadOpcode: (b) ->
    if @name.match /[ld]load/
      b.push2 b.cl(@var_num)
    else
      b.push b.cl(@var_num)
  LoadConstantOpcode: (b) ->
    val = @constant.value
    if @constant.type is 'String'
      b.push "rs.init_string('#{@str_constant.value}', true)"
    else if @constant.type is 'class'
      # this may not be side-effect independent if we can change classloaders at
      # runtime, but for now we can assume it is
      b.push "rs.class_lookup(c2t('#{@str_constant.value}')), true)"
    else if @name is 'ldc2_w'
      b.push2 val
    else
      b.push val
  ArrayLoadOpcode: (b) ->
    temp = b.new_temp()
    b.add_line """
    var idx = #{b.pop()};
    var obj = rs.check_null(#{b.pop()});
    var array = obj.array;
    if (!(0 <= idx && idx < array.length))
      java_throw(rs, 'java/lang/ArrayIndexOutOfBoundsException',
        idx + " not in length " + array.length + " array of type " + obj.type.toClassString());
    #{temp} = array[idx]
    """
    if @name.match /[ld]aload/ then b.push2 temp else b.push temp
  UnaryBranchOpcode: (b, idx) ->
    cmpCode = @name[2..]
    cond =
      switch cmpCode
        when "null"
          "=== null"
        when "nonnull"
          "!== null"
        else
          "#{cmpMap[cmpCode]} 0"
    b.next.push @offset + idx
    v = b.pop()
    b.compile_epilogue()
    b.add_line "if (#{v} #{cond}) { label = #{@offset + idx}; continue }"
  BinaryBranchOpcode: (b, idx) ->
    cmpCode = @name[7..]
    b.next.push @offset + idx
    v2 = b.pop()
    v1 = b.pop()
    b.compile_epilogue()
    b.add_line "if (#{v1} #{cmpMap[cmpCode]} #{v2}) { label = #{@offset + idx}; continue }"
  InvokeOpcode: (b, idx) ->
    method = new Method # kludge
    method.access_flags = { static: @name == 'invokestatic' }
    method.parse_descriptor @method_spec.sig

    p_idx = b.stack.length - method.param_bytes

    unless @name == 'invokestatic'
      params = [ b.stack[p_idx++] ]
    else
      params = []

    for t in method.param_types
      params.push b.stack[p_idx]
      if t.toString() in ['D','J']
        p_idx += 2
      else
        p_idx++

    b.stack.length -= method.param_bytes

    virtual = @name in ['invokevirtual', 'invokeinterface']
    b.add_line "rs.push(#{params.join ','})"
    b.add_line "rs.method_lookup(#{JSON.stringify @method_spec}).run(rs, #{virtual})"

    unless method.return_type.toString() is 'V'
      temp = b.new_temp()

      if method.return_type.toString() in ['D', 'J']
        b.add_line "#{temp} = rs.pop2()"
        b.push2 temp
      else
        b.add_line "#{temp} = rs.pop()"
        b.push temp

compile_obj_handlers = {
  aconst_null: { compile: (b) -> b.push new Primitive "null"; }
  iconst_m1: { compile: (b) -> b.push new Primitive "-1"; }
  iconst_0: { compile: (b) -> b.push new Primitive "0"; }
  iconst_1: { compile: (b) -> b.push new Primitive "1"; }
  iconst_2: { compile: (b) -> b.push new Primitive "2"; }
  iconst_3: { compile: (b) -> b.push new Primitive "3"; }
  iconst_4: { compile: (b) -> b.push new Primitive "4"; }
  iconst_5: { compile: (b) -> b.push new Primitive "5"; }
  lconst_0: { compile: (b) -> b.push2 new Primitive "gLong.ZERO"; }
  lconst_1: { compile: (b) -> b.push2 new Primitive "gLong.ONE"; }
  fconst_0: { compile: (b) -> b.push new Primitive "0"; }
  fconst_1: { compile: (b) -> b.push new Primitive "1"; }
  fconst_2: { compile: (b) -> b.push new Primitive "2"; }
  dconst_0: { compile: (b) -> b.push2 new Primitive "0"; }
  dconst_1: { compile: (b) -> b.push2 new Primitive "1"; }
  # the *astore commands don't work yet...
  iastore: {compile: (b) -> b.add_line "b.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  lastore: {compile: (b) -> b.add_line "b.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop2()}
  fastore: {compile: (b) -> b.add_line "b.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  dastore: {compile: (b) -> b.add_line "b.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop2()}
  aastore: {compile: (b) -> b.add_line "b.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  bastore: {compile: (b) -> b.add_line "b.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  castore: {compile: (b) -> b.add_line "b.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  sastore: {compile: (b) -> b.add_line "b.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  pop: {compile: (b) -> b.pop()}
  pop2: {compile: (b) -> b.pop2()}
  # TODO: avoid duplicating non-primitive expressions so as to save on computation
  dup: {compile: (b) -> v = b.pop(); b.push(v, v)}
  dup_x1: { compile: (b) -> v1=b.pop(); v2=b.pop(); b.push(v1,v2,v1) }
  dup_x2: {compile: (b) -> [v1,v2,v3]=[b.pop(),b.pop(),b.pop()];b.push(v1,v3,v2,v1)}
  dup2: {compile: (b) -> v1=b.pop(); v2=b.pop(); b.push(v2,v1,v2,v1)}
  dup2_x1: {compile: (b) -> [v1,v2,v3]=[b.pop(),b.pop(),b.pop()];b.push(v2,v1,v3,v2,v1)}
  dup2_x2: {compile: (b) -> [v1,v2,v3,v4]=[b.pop(),b.pop(),b.pop(),b.pop()];b.push(v2,v1,v4,v3,v2,v1)}
  swap: {compile: (b) -> v2=b.pop(); v1=b.pop(); b.push(v2,v1)}
  iadd: { compile: (b) -> b.push new Expr "util.wrap_int($0+$1)",b.pop(),b.pop() }
  ladd: { compile: (b) -> b.push2 new Expr "$0.add($1)",b.pop2(),b.pop2() }
  fadd: { compile: (b) -> b.push new Expr "util.wrap_float($0+$1)",b.pop(),b.pop() }
  dadd: { compile: (b) -> b.push2 new Expr "$0+$1",b.pop(),b.pop() }
  isub: { compile: (b) -> b.push new Expr "util.wrap_int($1-$0)",b.pop(),b.pop() }
  lsub: { compile: (b) -> b.push2 new Expr "$1.subtract($0)",b.pop2(),b.pop2() }
  fsub: { compile: (b) -> b.push new Expr "util.wrap_float($1-$0)",b.pop(),b.pop() }
  dsub: { compile: (b) -> b.push2 new Expr "$1-$0",b.pop2(),b.pop2() }
  imul: { compile: (b) -> b.push "gLong.fromInt(#{b.pop()}).multiply(gLong.fromInt(#{b.pop()})).toInt()" }
  lmul: { compile: (b) -> b.push2 "#{b.pop2()}.multiply(#{b.pop2()})" }
  fmul: { compile: (b) -> b.push "util.wrap_float(#{b.pop()}*#{b.pop()})" }
  dmul: { compile: (b) -> b.push2 "#{b.pop2()}*#{b.pop2()}" }
  idiv: { compile: (b) -> v=b.pop();b.push "util.int_div(rs, #{b.pop()}, #{v})" }
  ldiv: { compile: (b) -> v=b.pop2();b.push2 "util.long_div(rs, #{b.pop2()}, #{v})" }
  fdiv: { compile: (b) -> v=b.pop();b.push "util.wrap_float(#{b.pop()}/#{v})" }
  ddiv: { compile: (b) -> v=b.pop2();b.push2 "#{b.pop2()}/#{v}" }
  irem: { compile: (b) -> v2=b.pop();  b.push "util.int_mod(rs,#{b.pop()},#{v2})" }
  lrem: { compile: (b) -> v2=b.pop2(); b.push2 "util.long_mod(rs,#{b.pop2()},#{v2})" }
  frem: { compile: (b) -> v2=b.pop();  b.push "#{b.pop()}%#{v2}" }
  drem: { compile: (b) -> v2=b.pop2(); b.push2 "#{b.pop2()}%#{v2}" }
  ineg: { compile: (b) -> b.push "-#{b.pop()}" }  # doesn't handle int_min edge case
  lneg: { compile: (b) -> b.push2 "(#{b.pop2()}).negate()" }
  fneg: { compile: (b) -> b.push "-#{b.pop()}" }
  dneg: { compile: (b) -> b.push2 "-#{b.pop2()}" }

  iinc: { compile: (b) -> b.put_cl @index, "util.wrap_int(#{b.cl(@index)}+#{@const})" }
  i2l: { compile: (b) -> b.push2 "gLong.fromInt(#{b.pop()})" }
  i2f: { compile: (b) -> }
  i2d: { compile: (b) -> b.push null }
  l2i: { compile: (b) -> b.push "(#{b.pop2()}).toInt()" }
  l2f: { compile: (b) -> b.push "(#{b.pop2()}).toNumber()" }
  l2d: { compile: (b) -> b.push2 "(#{b.pop2()}).toNumber()" }
  f2i: { compile: (b) -> b.push "util.float2int(#{b.pop()})" }
  f2l: { compile: (b) -> b.push2 "gLong.fromNumber(#{b.pop()})" }
  f2d: { compile: (b) -> b.push null }
  d2i: { compile: (b) -> b.push "util.float2int(#{b.pop2()})" }
  d2l: { compile: (b) -> b.push2 "gLong.fromNumber(#{b.pop2()})" }  # doesn't handle +/- inf edge cases
  d2f: { compile: (b) -> b.push "util.wrap_float(#{b.pop2()})" }
  i2b: { compile: (b) -> b.push "util.truncate(#{b.pop()}, 8)" }
  i2c: { compile: (b) -> b.push "#{b.pop()}&0xFFFF" }
  i2s: { compile: (b) -> b.push "util.truncate(#{b.pop()}, 16)" }

  ireturn: { compile: (b) -> b.add_line "return #{b.pop()}" }
  lreturn: { compile: (b) -> b.add_line "return #{b.pop2()}" }
  freturn: { compile: (b) -> b.add_line "return #{b.pop()}" }
  dreturn: { compile: (b) -> b.add_line "return #{b.pop2()}" }
  areturn: { compile: (b) -> b.add_line "return #{b.pop()}" }
  'return': { compile: (b) -> b.add_line "return" }

  arraylength: { compile: (b) ->
    t = b.new_temp()
    b.add_line "#{t} = rs.check_null(#{b.pop()}).array.length"
    b.push t
  }

  getstatic: { compile: (b) ->
    temp = b.new_temp()
    b.add_line "#{temp} = rs.static_get(#{JSON.stringify @field_spec})"
    if @field_spec.type in ['J','D'] then b.push2 temp else b.push temp }

  'new': { compile: (b) ->
    temp = b.new_temp()
    b.add_line "#{temp} = rs.init_object(#{JSON.stringify @class})"
    b.push temp }

  goto: { compile: (b, idx) ->
    b.next = [@offset + idx]
    b.compile_epilogue()
    b.add_line "label = #{@offset + idx}; continue"
  }

  goto_w: { compile: (b, idx) ->
    b.next = [@offset + idx]
    b.compile_epilogue()
    b.add_line "label = #{@offset + idx}; continue"
  }
}

root.compile = (class_file) ->
  class_name = class_file.this_class.toExternalString().replace /\./g, '_'
  methods =
    for sig, m of class_file.methods
      unless m.access_flags.native or m.access_flags.abstract
        name =
          if m.name is '<init>' then class_name
          else if m.name is '<clinit>' then '__clinit__'
          else m.name

        block_chain = new BlockChain m

        param_names = ['rs']
        params_size = 0
        unless m.access_flags.static
          param_name = block_chain.new_temp()
          param_names.push param_name
          block_chain.blocks[0].put_cl(params_size++, param_name)

        for p in m.param_types
          param_name = block_chain.new_temp()
          param_names.push param_name
          if p.toString() in ['D','J']
            block_chain.blocks[0].put_cl2(params_size, param_name)
            params_size += 2
          else
            block_chain.blocks[0].put_cl(params_size++, param_name)

        block_chain.blocks[0].compile()

        temps = block_chain.get_all_temps()

        """
        #{name}: function(#{param_names.join ", "}) {
          var label = 0;
          #{if temps.length > 0 then "var #{temps.join ", "};" else ""}
          #{if m.code.max_locals > 0
              "var " + (("l#{i}" for i in [0...m.code.max_locals]).join ", ") + ";"
            else
              ""}
          #{if m.code.max_stack > 0
              "var " + (("s#{i}" for i in [0...m.code.max_stack]).join ", ") + ";"
            else
              ""}
          while (true) {
            switch (label) {
#{(b.compiled_str for b in block_chain.blocks).join ""}
            };
          };
        },
        """

  """
  var #{class_name} = {
  #{methods.join "\n"}
  };
  """

# TODO: move to a separate file
if require.main == module
  fs = require 'fs'
  ClassFile = require '../src/ClassFile'
  fname = if process.argv.length > 2 then process.argv[2] else '/dev/stdin'
  bytes_array = util.bytestr_to_array fs.readFileSync(fname, 'binary')
  class_data = new ClassFile bytes_array

  console.log root.compile class_data
