_ = require '../third_party/_.js'
util = require './util'
{Method} = require './methods'

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
  pop2: -> rv = @stack.pop(); @stack.pop(); rv
  put_cl: (idx, v) -> @locals[idx] = v
  put_cl2: (idx, v) -> @locals[idx] = v; @locals[idx+1] = null
  cl: (idx) -> @locals[idx]
  add_line: (line) -> @body += line + ";\n"
  new_temp: -> @block_chain.new_temp()

  compile_epilogue: ->
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

    unless op.offset? or (op.name.indexOf 'return') != -1
      @compile_epilogue()

    @compiled_str =
      """
      case #{@start_idx}:
      // #{op.name for op in @opcodes}
      #{@body}
      """
    next_cases =
      for idx in @next
        next_block = @block_chain.get_block_from_instr idx
        unless next_block.visited
          next_block.compile @stack[..], @locals[..]

cmpMap =
  eq: '='
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
    b.add_line "if (#{b.pop()} #{cond}) { label = #{@offset + idx}"
    b.compile_epilogue()
    b.add_line "continue }"
  BinaryBranchOpcode: (b, idx) ->
    cmpCode = @name[7..]
    b.next.push @offset + idx
    v2 = b.pop()
    v1 = b.pop()
    b.add_line "if (#{v1} #{cmpMap[cmpCode]} #{v2}) { label = #{@offset + idx}"
    b.compile_epilogue()
    b.add_line "continue }"
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
    invoke_str = "rs.method_lookup(#{JSON.stringify @method_spec}).run(rs, #{virtual}, [#{params.join ","}])"

    unless method.return_type.toString() is 'V'
      temp = b.new_temp()
      invoke_str = "#{temp} = #{invoke_str}"

      if method.return_type.toString() in ['D', 'J']
        b.push2 temp
      else
        b.push temp

    b.add_line invoke_str

compile_obj_handlers = {
  aconst_null: { compile: (b) -> b.push "null"; }
  iconst_m1: { compile: (b) -> b.push "-1"; }
  iconst_0: { compile: (b) -> b.push "0"; }
  iconst_1: { compile: (b) -> b.push "1"; }
  iconst_2: { compile: (b) -> b.push "2"; }
  iconst_3: { compile: (b) -> b.push "3"; }
  iconst_4: { compile: (b) -> b.push "4"; }
  iconst_5: { compile: (b) -> b.push "5"; }
  lconst_0: { compile: (b) -> b.push2 "gLong.ZERO"; }
  lconst_1: { compile: (b) -> b.push2 "gLong.ONE"; }
  fconst_0: { compile: (b) -> b.push "0"; }
  fconst_1: { compile: (b) -> b.push "1"; }
  fconst_2: { compile: (b) -> b.push "2"; }
  dconst_0: { compile: (b) -> b.push2 "0"; }
  dconst_1: { compile: (b) -> b.push2 "1"; }
  istore: { compile: (b) -> b.put_cl(@var_num, b.pop()) }
  lstore: { compile: (b) -> b.put_cl2(@var_num, b.pop2()) }
  fstore: { compile: (b) -> b.put_cl(@var_num, b.pop()) }
  dstore: { compile: (b) -> b.put_cl2(@var_num, b.pop2()) }
  astore: { compile: (b) -> b.put_cl(@var_num, b.pop()) }
  iastore: {compile: (b) -> v=b.pop(); i=b.pop();"b.check_null(#{b.pop()}).array[#{i}]=#{v}"}
  lastore: {compile: (b) -> v=b.pop2();i=b.pop();"b.check_null(#{b.pop()}).array[#{i}]=#{v}"}
  fastore: {compile: (b) -> v=b.pop(); i=b.pop();"b.check_null(#{b.pop()}).array[#{i}]=#{v}"}
  dastore: {compile: (b) -> v=b.pop2();i=b.pop();"b.check_null(#{b.pop()}).array[#{i}]=#{v}"}
  aastore: {compile: (b) -> v=b.pop(); i=b.pop();"b.check_null(#{b.pop()}).array[#{i}]=#{v}"}
  bastore: {compile: (b) -> v=b.pop(); i=b.pop();"b.check_null(#{b.pop()}).array[#{i}]=#{v}"}
  castore: {compile: (b) -> v=b.pop(); i=b.pop();"b.check_null(#{b.pop()}).array[#{i}]=#{v}"}
  sastore: {compile: (b) -> v=b.pop(); i=b.pop();"b.check_null(#{b.pop()}).array[#{i}]=#{v}"}
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
  iadd: { compile: (b) -> b.push "wrap_int(#{b.pop()}+#{b.pop()})" }
  ladd: { compile: (b) -> b.push2 "#{b.pop2()}.add(#{b.pop2()})" }
  fadd: { compile: (b) -> b.push "wrap_float(#{b.pop()}+#{b.pop()})" }
  dadd: { compile: (b) -> b.push2 "#{b.pop()}+#{b.pop()}" }
  isub: { compile: (b) -> b.push "wrap_int(-#{b.pop()}+#{b.pop()})" }
  lsub: { compile: (b) -> b.push2 "#{b.pop2()}.add(#{b.pop2()})" }
  fsub: { compile: (b) -> b.push "wrap_float(-#{b.pop()}+#{b.pop()})" }
  dsub: { compile: (b) -> b.push2 "-#{b.pop()}+#{b.pop()}" }
  imul: { compile: (b) -> b.push "gLong.fromInt(#{b.pop()}).multiply(gLong.fromInt(#{b.pop()})).toInt()" }
  lmul: { compile: (b) -> b.push2 "#{b.pop2()}.multiply(#{b.pop2()})" }
  fmul: { compile: (b) -> b.push "wrap_float(#{b.pop()}*#{b.pop()})" }
  dmul: { compile: (b) -> b.push2 "#{b.pop2()}*#{b.pop2()}" }
  idiv: { compile: (b) -> v=b.pop();b.push "int_div(rs, #{b.pop()}, #{v})" }
  ldiv: { compile: (b) -> v=b.pop2();b.push2 "long_div(rs, #{b.pop2()}, #{v})" }
  fdiv: { compile: (b) -> v=b.pop();b.push "wrap_float(#{b.pop()}/#{v})" }
  ddiv: { compile: (b) -> v=b.pop2();b.push2 "#{b.pop2()}/#{v}" }
  irem: { compile: (b) -> v2=b.pop();  b.push "int_mod(rs,#{b.pop()},#{v2})" }
  lrem: { compile: (b) -> v2=b.pop2(); b.push2 "long_mod(rs,#{b.pop2()},#{v2})" }
  frem: { compile: (b) -> v2=b.pop();  b.push "#{rs.pop()}%#{v2}" }
  drem: { compile: (b) -> v2=b.pop2(); b.push2 "#{rs.pop2()}%#{v2}" }
  ineg: { compile: (b) -> b.push "((var i_val = #{b.pop()}) == util.INT_MIN ? i_val : -i_val)" }
  lneg: { compile: (b) -> b.push2 "#{b.pop2()}.negate()" }
  fneg: { compile: (b) -> b.push "-#{b.pop()}" }
  dneg: { compile: (b) -> b.push2 "-#{rs.pop2()}" }

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

  goto_w: { compile: (b, idx) ->
    b.next = [@offset + idx]
    b.compile_epilogue()
    b.add_line "label = #{@offset + idx}; continue"
  }
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
          #{"var " + (("l#{i}" for i in [0...m.code.max_locals]).join ", ") + ";" if m.code.max_locals > 0}
          #{"var " + (("s#{i}" for i in [0...m.code.max_stack]).join ", ") + ";" if m.code.max_stack > 0}
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
fs = require 'fs'
ClassFile = require '../src/ClassFile'
fname = if process.argv.length > 2 then process.argv[2] else '/dev/stdin'
bytes_array = util.bytestr_to_array fs.readFileSync(fname, 'binary')
class_data = new ClassFile bytes_array

console.log root.compile class_data
