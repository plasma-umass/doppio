_ = require '../third_party/_.js'
gLong = require '../third_party/gLong.js'
util = require './util'
{Method} = require './methods'
{c2t} = require './types'

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

    # organize exception handlers, adding targets as needed
    try_locations = {}
    for handler in method.code.exception_handlers
      try_locations[handler.start_pc] = {name: 'try', byte_count: -1, handler: handler}
      targets.push handler.start_pc, handler.handler_pc

    targets.sort((a,b) -> a - b)
    labels = _.uniq(targets)

    for idx, i in labels
      block = new BasicBlock @, idx
      @blocks.push block
      @instr2block[idx] = i
      # we initially assume all blocks are connected linearly.
      # compiling the individual instructions will adjust this as needed.
      if @blocks.length > 1
        @blocks[@blocks.length - 2].next.push block

    current_block = -1
    method.code.each_opcode (idx, oc) =>
      current_block++ if idx in labels
      block = @blocks[current_block]
      if try_locations[idx]?
        block.opcodes.push try_locations[idx]
        block.has_try = try_locations[idx].handler
      block.opcodes.push oc

    @param_names = ['rs']
    params_size = 0
    unless method.access_flags.static
      param_name = @new_temp()
      @param_names.push param_name
      @blocks[0].put_cl(params_size++, param_name)

    for p in method.param_types
      param_name = @new_temp()
      @param_names.push param_name
      if p.toString() in ['D','J']
        @blocks[0].put_cl2(params_size, param_name)
        params_size += 2
      else
        @blocks[0].put_cl(params_size++, param_name)

  get_block_from_instr: (idx) -> @blocks[@instr2block[idx]]

  new_temp: -> new Temp @temp_count++
  get_all_temps: -> (new Temp i for i in [0...@temp_count])

  compile: ->
    @blocks[0].compile()

class BasicBlock
  constructor: (@block_chain, @start_idx) ->
    @opcodes = []
    @stack = []
    @locals = []
    @next = []
    @prev = []
    @stmts = []
    @visited = false

  push: (values...) -> @stack.push.apply @stack, values
  push2: (values...) -> @stack.push v, null for v in values
  pop: -> @stack.pop()
  pop2: -> @stack.pop(); @stack.pop()
  put_cl: (idx, v) ->
    @locals[idx] = v
  put_cl2: (idx, v) ->
    @locals[idx] = v
    @locals[idx+1] = null
  cl: (idx) -> @locals[idx]
  add_stmt: (stmt) -> @stmts.push stmt
  new_temp: -> @block_chain.new_temp()

  entryFromVar: (v) ->
    if v instanceof StackVar
      expr = @stack[v.id]
    else
      expr = @locals[v.id]

  forEachVar: (cb) ->
    for s, i in @stack when s?
      new_s = new StackVar i
      cb new_s

    for l, i in @locals when l?
      new_l = new LocalVar i
      cb new_l

  compile_epilogue: ->
    # copy our stack / local values into appropriately-named vars so that they
    # can be accessed from other blocks
    rv = []

    postordered = []
    visited = {}
    clobbered = {}
    replacements = {}
    traverse = (v) =>
      return if visited[v]
      visited[v] = true

      expr = @entryFromVar v

      unless expr instanceof Primitive and v.equals expr
        clobbered[v] = true
        replacer = (d) =>
          return d unless (d instanceof StackVar or d instanceof LocalVar) and not d.equals v
          if clobbered[d]
            unless replacements[d]
              replacements[d] = @new_temp()
              rv.push new Assignment replacements[d], d
            return replacements[d]
          traverse d
          d

        if expr instanceof Expr
          expr.replace replacer
        else
          expr = replacer expr

        postordered.push new Assignment v, expr
      
    @forEachVar traverse

    rv.concat postordered.reverse()

  compile: (prev_stack, prev_locals, exc_catcher=false) ->
    return if @visited

    @visited = true

    # the first block has its local vars set from the function params
    unless @start_idx == 0
      unless exc_catcher
        @stack =
          for s,i in prev_stack
            if s? then new StackVar i else null
      @locals =
        for l,i in prev_locals
          if l? then new LocalVar i else null

    instr_idx = @start_idx
    for op in @opcodes
      if (handler = compile_obj_handlers[op.name]?.compile)?
        handler.call(op, @, instr_idx)
      else if (handler = util.lookup_handler(compile_class_handlers, op))?
        handler.apply op, [@, instr_idx]
      else
        console.error "XXX missing #{op.constructor.name}: #{op.name}"
      instr_idx += op.byte_count + 1

    # branching instructions will print the epilogue before they branch; return
    # instructions obviate the need for one
    unless op.offset? or (op.name.indexOf 'return') != -1
      @add_stmt => @compile_epilogue()

    # catch any try blocks
    if (handler = @has_try)?
      next_block = @block_chain.get_block_from_instr handler.handler_pc
      @add_stmt """
        } catch (e) {
          if (!(e instanceof util.JavaException)) throw e
      """
      if handler.catch_type == "<any>"
        @add_stmt "rs.push(e.exception); label = #{handler.handler_pc}; continue\n}"
      else
        @add_stmt """
          if (types.is_castable(rs, e.exception.type, types.c2t(#{JSON.stringify handler.catch_type}))) {
            rs.push(e.exception); label = #{handler.handler_pc}; continue;
          } else {
            throw e;
          }\n}
        """
      next_block.stack = ["rs.pop()"]
      next_block.compile @stack, @locals, true

    for next_block in @next
      # java bytecode verification ensures that the stack height and stack /
      # local table types match up across blocks
      next_block.compile @stack, @locals

    linearized_stmts = ""
    linearize = (arr) ->
      for s in arr
        if _.isFunction s
          linearize s()
        else
          linearized_stmts += s + ";\n"
    linearize @stmts

    @compiled_str =
      """
      case #{@start_idx}:
      // #{op.name for op in @opcodes}
      #{linearized_stmts}
      """

class Expr

  constructor: (str, subexps...) ->
    @fragments = str.split /(\$\d+)/
    for frag, i in @fragments
      if /\$\d+/.test frag
        @fragments[i] = subexps[parseInt frag[1..], 10]

  eval: (b) ->
    temp = b.new_temp()
    b.add_stmt new Expr "$0 = #{@}", temp
    new Primitive b

  toString: -> @fragments.join ''

  replace: (cb) ->
    for frag, i in @fragments
      if frag instanceof Temp
        @fragments[i] = cb frag
      else if frag instanceof Expr
        frag.replace cb

  get_dependencies: ->
    temps = []
    for frag in @fragments
      if frag instanceof Expr
        temps.concat frag.get_dependencies()
      else if frag instanceof Temp
        temps.push frag
    temps


class Primitive

  constructor: (@str) ->

  eval: -> @

  toString: -> @str

  equals: (p) -> p.toString() == @toString()

class Temp extends Primitive

  constructor: (@id) ->

  toString: -> "$#{@id}"

class StackVar extends Temp

  toString: -> "s#{@id}"

class LocalVar extends Temp

  toString: -> "l#{@id}"

class Assignment

  constructor: (@dest, @src) ->

  toString: -> "#{@dest} = #{@src}"

cmpMap =
  eq: '=='
  ne: '!=='
  lt: '<'
  ge: '>='
  gt: '>'
  le: '<='

# JS's maximum representable integer
max_number = gLong.fromNumber(Math.pow(2,53))

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
      b.push "rs.init_string(#{JSON.stringify @str_constant.value}, true)"
    else if @constant.type is 'class'
      # this may not be side-effect independent if we can change classloaders at
      # runtime, but for now we can assume it is
      b.push "rs.class_lookup(c2t('#{@str_constant.value}')), true)"
    else if @name is 'ldc2_w'
      if val?.greaterThan?(max_number)
        b.push2 "gLong.fromBits(#{val.getLowBits()},#{val.getHighBits()})"
      else if val?.toNumber?
        b.push2 "gLong.fromNumber(#{val})"
      else
        b.push2 val
    else
      b.push val
  ArrayLoadOpcode: (b) ->
    temp = b.new_temp()
    b.add_stmt new Expr """
    var idx = $0;
    var obj = rs.check_null($1);
    var array = obj.array;
    if (!(0 <= idx && idx < array.length))
      util.java_throw(rs, 'java/lang/ArrayIndexOutOfBoundsException',
        idx + " not in length " + array.length + " array of type " + obj.type.toClassString());
    $2 = array[idx]
    """, b.pop(), b.pop(), temp
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
    b.next.push b.block_chain.get_block_from_instr @offset + idx
    b.add_stmt -> b.compile_epilogue()
    b.add_stmt new Expr "if ($0 #{cond}) { label = #{@offset + idx}; continue }", b.pop()
  BinaryBranchOpcode: (b, idx) ->
    cmpCode = @name[7..]
    b.next.push b.block_chain.get_block_from_instr @offset + idx
    b.add_stmt -> b.compile_epilogue()
    b.add_stmt new Expr "if ($1 #{cmpMap[cmpCode]} $0) { label = #{@offset + idx}; continue }",b.pop(),b.pop()
  InvokeOpcode: (b, idx) ->
    method = new Method # kludge
    method.access_flags = { static: @name == 'invokestatic' }
    method.parse_descriptor @method_spec.sig

    virtual = @name in ['invokevirtual', 'invokeinterface']
    params = b.stack.splice(-method.param_bytes)
    b.add_stmt "rs.push(#{p ? 'null' for p in params})"
    b.add_stmt "rs.method_lookup(#{JSON.stringify @method_spec}).run(rs, #{virtual})"

    unless method.return_type.toString() is 'V'
      temp = b.new_temp()

      if method.return_type.toString() in ['D', 'J']
        b.add_stmt new Assignment temp, "rs.pop2()"
        b.push2 temp
      else
        b.add_stmt new Assignment temp, "rs.pop()"
        b.push temp

compile_obj_handlers = {
  # pseudo-opcode, generates the beginning of a try block
  'try': { compile: (b) -> b.add_stmt "try { //" }
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
  iastore: {compile: (b) -> b.add_stmt new Expr "rs.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  lastore: {compile: (b) -> b.add_stmt new Expr "rs.check_null($2).array[$1]=$0",b.pop2(),b.pop(),b.pop()}
  fastore: {compile: (b) -> b.add_stmt new Expr "rs.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  dastore: {compile: (b) -> b.add_stmt new Expr "rs.check_null($2).array[$1]=$0",b.pop2(),b.pop(),b.pop()}
  aastore: {compile: (b) -> b.add_stmt new Expr "rs.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  bastore: {compile: (b) -> b.add_stmt new Expr "rs.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  castore: {compile: (b) -> b.add_stmt new Expr "rs.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
  sastore: {compile: (b) -> b.add_stmt new Expr "rs.check_null($2).array[$1]=$0",b.pop(),b.pop(),b.pop()}
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
  dadd: { compile: (b) -> b.push2 new Expr "($0+$1)",b.pop(),b.pop() }
  isub: { compile: (b) -> b.push new Expr "util.wrap_int($1-$0)",b.pop(),b.pop() }
  lsub: { compile: (b) -> b.push2 new Expr "$1.subtract($0)",b.pop2(),b.pop2() }
  fsub: { compile: (b) -> b.push new Expr "util.wrap_float($1-$0)",b.pop(),b.pop() }
  dsub: { compile: (b) -> b.push2 new Expr "($1-$0)",b.pop2(),b.pop2() }
  imul: { compile: (b) -> b.push new Expr "gLong.fromInt($0).multiply(gLong.fromInt($1)).toInt()",b.pop(),b.pop() }
  lmul: { compile: (b) -> b.push2 new Expr "$0.multiply($1)",b.pop2(),b.pop2() }
  fmul: { compile: (b) -> b.push new Expr "util.wrap_float($0*$1)",b.pop(),b.pop() }
  dmul: { compile: (b) -> b.push2 new Expr "($0*$1)",b.pop2(),b.pop2() }
  idiv: { compile: (b) -> b.push new Expr "util.int_div(rs, $1, $0)",b.pop(),b.pop() }
  ldiv: { compile: (b) -> b.push2 new Expr "util.long_div(rs, $1, $0)",b.pop2(),b.pop2() }
  fdiv: { compile: (b) -> b.push new Expr "util.wrap_float($1/$0)",b.pop(),b.pop() }
  ddiv: { compile: (b) -> b.push2 new Expr "($1/$0)",b.pop2(),b.pop2() }
  irem: { compile: (b) -> b.push new Expr "util.int_mod(rs,$1,$0)",b.pop(),b.pop() }
  lrem: { compile: (b) -> b.push2 new Expr "util.long_mod(rs,$1,$0)",b.pop2(),b.pop2() }
  frem: { compile: (b) -> b.push new Expr "($1%$0)",b.pop(),b.pop() }
  drem: { compile: (b) -> b.push2 new Expr "($1%$0)",b.pop2(),b.pop2() }
  ineg: { compile: (b) -> b.push new Expr "-$0",b.pop() }  # doesn't handle int_min edge case
  lneg: { compile: (b) -> b.push2 new Expr "$0.negate()",b.pop2() }
  fneg: { compile: (b) -> b.push new Expr "-$0",b.pop() }
  dneg: { compile: (b) -> b.push2 new Expr "-$0",b.pop2() }
  ishl: { compile: (b) -> b.push new Expr "($1<<($0&0x1F))", b.pop(), b.pop() }
  lshl: { compile: (b) -> b.push new Expr "$1.shiftLeft(gLong.fromInt($0&0x3F))", b.pop(), b.pop2() }
  ishr: { compile: (b) -> b.push new Expr "($1>>($0&0x1F))", b.pop(), b.pop() }
  lshr: { compile: (b) -> b.push new Expr "$1.shiftRight(gLong.fromInt($0&0x3F))", b.pop(), b.pop2() }
  iushr: { compile: (b) -> b.push new Expr "($1>>>($0&0x1F))", b.pop(), b.pop() }
  lushr: { compile: (b) -> b.push new Expr "$1.shiftRightUnsigned(gLong.fromInt($0&0x3F))", b.pop(), b.pop2() }
  iand: { compile: (b) -> b.push new Expr "($0&$1)", b.pop(), b.pop() }
  land: { compile: (b) -> b.push2 new Expr "$0.and($1)", b.pop2(), b.pop2() }
  ior:  { compile: (b) -> b.push new Expr "($0|$1)", b.pop(), b.pop() }
  lor:  { compile: (b) -> b.push2 new Expr "$0.or($1)", b.pop2(), b.pop2() }
  ixor: { compile: (b) -> b.push new Expr "($0^$1)", b.pop(), b.pop() }
  lxor: { compile: (b) -> b.push2 new Expr "$0.xor($1)", b.pop2(), b.pop2() }
  iinc:   { compile: (b) -> b.put_cl @index, new Expr "util.wrap_int($0+$1)",b.cl(@index),@const }
  iinc_w: { compile: (b) -> b.put_cl @index, new Expr "util.wrap_int($0+$1)",b.cl(@index),@const }
  i2l: { compile: (b) -> b.push2 new Expr "gLong.fromInt($0)",b.pop() }
  i2f: { compile: (b) -> }
  i2d: { compile: (b) -> b.push null }
  l2i: { compile: (b) -> b.push new Expr "$0.toInt()",b.pop2() }
  l2f: { compile: (b) -> b.push new Expr "$0.toNumber()",b.pop2() }
  l2d: { compile: (b) -> b.push2 new Expr "$0.toNumber()",b.pop2() }
  f2i: { compile: (b) -> b.push new Expr "util.float2int($0)",b.pop() }
  f2l: { compile: (b) -> b.push2 new Expr "gLong.fromNumber($0)",b.pop() }
  f2d: { compile: (b) -> b.push null }
  d2i: { compile: (b) -> b.push new Expr "util.float2int($0)",b.pop2() }
  d2l: { compile: (b) -> b.push2 new Expr "gLong.fromNumber($0)",b.pop2() }  # doesn't handle +/- inf edge cases
  d2f: { compile: (b) -> b.push new Expr "util.wrap_float($0)",b.pop2() }
  i2b: { compile: (b) -> b.push new Expr "util.truncate($0, 8)",b.pop() }
  i2c: { compile: (b) -> b.push new Expr "($0 & 0xFFFF)",b.pop() }
  i2s: { compile: (b) -> b.push new Expr "util.truncate($0, 16)",b.pop() }
  lcmp: { compile: (b) -> b.push new Expr "$1.compare($0)", b.pop2(), b.pop2() }
  fcmpl: { compile: (b) -> b.push new Expr "((r = util.cmp($1,$0)) != null ? r : -1)", b.pop(), b.pop() }
  fcmpg: { compile: (b) -> b.push new Expr "((r = util.cmp($1,$0)) != null ? r : 1)", b.pop(), b.pop() }
  dcmpl: { compile: (b) -> b.push new Expr "((r = util.cmp($1,$0)) != null ? r : -1)", b.pop2(), b.pop2() }
  dcmpg: { compile: (b) -> b.push new Expr "((r = util.cmp($1,$0)) != null ? r : 1)", b.pop2(), b.pop2() }

  ireturn: { compile: (b) -> b.add_stmt "return #{b.pop()}" }
  lreturn: { compile: (b) -> b.add_stmt "return #{b.pop2()}" }
  freturn: { compile: (b) -> b.add_stmt "return #{b.pop()}" }
  dreturn: { compile: (b) -> b.add_stmt "return #{b.pop2()}" }
  areturn: { compile: (b) -> b.add_stmt "return #{b.pop()}" }
  'return': { compile: (b) -> b.add_stmt "return" }

  getstatic: { compile: (b) ->
    t = b.new_temp()
    b.add_stmt new Assignment t, "rs.static_get(#{JSON.stringify @field_spec})"
    if @field_spec.type in ['J','D'] then b.push2 t else b.push t
  }

  putstatic: { compile: (b) ->
    val = if @field_spec.type in ['J','D'] then b.pop2() else b.pop()
    b.add_stmt new Expr """
      var f = rs.field_lookup(#{JSON.stringify @field_spec});
      rs.class_lookup(f.class_type, true).fields[f.name] = $0
    """, val
  }
  
  getfield: { compile: (b) ->
    t = b.new_temp()
    name = JSON.stringify @field_spec.name
    init = util.initial_value @field_spec.type
    b.add_stmt new Expr """
      var f = $0.fields;
      if (f[#{name}] == null) { f[#{name}] = #{init}; }
      $1 = f[#{name}]
    """, b.pop(), t
    if @field_spec.type in ['J','D'] then b.push2 t else b.push t    
  }
  
  putfield: { compile: (b) ->
    val = if @field_spec.type in ['J','D'] then b.pop2() else b.pop()
    b.add_stmt new Assignment new Expr("$0.fields[#{JSON.stringify @field_spec.name}]", b.pop()), val
  }

  'new': { compile: (b) ->
    t = b.new_temp()
    b.add_stmt new Assignment t, "rs.init_object(#{JSON.stringify @class})"
    b.push t
  }

  newarray: { compile: (b) -> 
    t = b.new_temp()
    b.add_stmt new Assignment t, new Expr "rs.heap_newarray('#{@element_type}', $0)", b.pop()
    b.push t
  }
  
  anewarray: { compile: (b) -> 
    t = b.new_temp()
    b.add_stmt new Assignment t, new Expr "rs.heap_newarray('L#{@class};', $0)", b.pop()
    b.push t
  }

  arraylength: { compile: (b) ->
    t = b.new_temp()
    b.add_stmt new Assignment t, new Expr "rs.check_null($0).array.length", b.pop()
    b.push t
  }

  athrow: { compile: (b) -> b.add_stmt new Expr "throw new util.JavaException(rs, $0)", b.pop() }

  checkcast: { compile: (b) ->
    target_class = c2t(@class).toExternalString()
    obj = b.pop()
    b.add_stmt new Expr """
        if (($0 != null) && !types.check_cast(rs, $0, #{JSON.stringify @class})) {
          util.java_throw(rs, 'java/lang/ClassCastException', $0.type.toExternalString()+" cannot be cast to #{target_class}");
        }""", obj
    b.push obj
  }

  'instanceof': { compile: (b) ->
    t = b.new_temp()
    b.add_stmt new Assignment t, new Expr """
      ($0 == null)? 0 : types.check_cast(rs,$0,#{JSON.stringify @class})+0
    """, b.pop()
    b.push t
  }

  multianewarray: { compile: (b) ->
    t = b.new_temp()
    counts = b.stack.splice(-@dim,@dim)
    def = util.initial_value @class[@dim..]
    b.add_stmt new Expr """
    var counts = [#{counts}];
    function init_arr(curr_dim) {
      if (curr_dim === #{@dim}) return #{def};
      var dimension = [];
      for (var _i = 0; _i < counts[curr_dim]; _i++)
        dimension.push(init_arr(curr_dim + 1));
      return rs.init_object(#{JSON.stringify @class}.slice(curr_dim), dimension);
    }
    $0 = init_arr(0)
    """, t
    b.push t
  }

  goto: { compile: (b, idx) ->
    b.next = [b.block_chain.get_block_from_instr @offset + idx]
    b.add_stmt -> b.compile_epilogue()
    b.add_stmt "label = #{@offset + idx}; continue"
  }

  goto_w: { compile: (b, idx) ->
    b.next = [b.block_chain.get_block_from_instr @offset + idx]
    b.add_stmt -> b.compile_epilogue()
    b.add_stmt "label = #{@offset + idx}; continue"
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

        block_chain.compile()

        temps = block_chain.get_all_temps()

        """
        #{name}: function(#{block_chain.param_names.join ", "}) {
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
