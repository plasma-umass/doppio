
# things assigned to root will be available outside this module
root = exports ? this

class Method
  parse: (bytes_array,constant_pool) ->
    @access_flags = read_uint(bytes_array.splice(0,2))
    @name = constant_pool.get(read_uint(bytes_array.splice(0,2))).value
    throw "Method.parse: Invalid constant_pool name reference" unless @name
    @signature = constant_pool.get(read_uint(bytes_array.splice(0,2))).value
    throw "Method.parse: Invalid constant_pool signature reference" unless @signature
    [@attrs,bytes_array] = make_attributes(bytes_array,constant_pool)
    return bytes_array
  
  run: () ->
    code = @attrs[0].code  #TODO: make this less brittle, maybe with typeof
    until code.length == 0
      c = code.shift()&0xFF
      console.log c
      op = opcodes[c]
      code = op.take_args(code)
      console.log op.name, op.args

class ClassFile
  constructor: (bytes_array) ->
    read_u2 = -> read_uint(bytes_array.splice(0,2))
    read_u4 = -> read_uint(bytes_array.splice(0,4))
    throw "Magic number invalid" if read_u4() != 0xCAFEBABE
    minor_version = read_u2()  # unused, but it cuts off two bytes
    throw "Major version invalid" unless 45 <= read_u2() <= 51
    @constant_pool = new ConstantPool
    bytes_array = @constant_pool.parse(bytes_array)
    # bitmask for {public,final,super,interface,abstract} class modifier
    @access_flags = read_u2()
    # indices into constant_pool for this and super classes.
    this_class_ref = @constant_pool.get(read_u2()).value
    super_class_ref = @constant_pool.get(read_u2()).value
    @this_class  = @constant_pool.get(this_class_ref).value
    @super_class = @constant_pool.get(super_class_ref).value
    # direct interfaces of this class
    isize = read_u2()
    @interfaces = (read_u2() for _ in [0...isize])
    # fields of this class
    num_fields = read_u2()
    #TODO: replace the new Method call with something for fields (method_info and field_info look the same)
    @fields = (new Method for _ in [0...num_fields])
    for f in @fields
      bytes_array = f.parse(bytes_array,@constant_pool)
    # class methods
    num_methods = read_u2()
    @methods = (new Method for _ in [0...num_methods])
    for m in @methods
      bytes_array = m.parse(bytes_array,@constant_pool)
    # class attributes
    [@attrs,bytes_array] = make_attributes(bytes_array,@constant_pool)
    throw "Leftover bytes in classfile: #{bytes_array}" if bytes_array.length > 0

decompile = (class_file) ->
    constant_pool = class_file.constant_pool
    constant_pool.each (idx, entry) ->
      console.log("const ##{idx} = #{entry.type}\t#{entry.value};")

# main function that gets called from the frontend
root.run_jvm = (bytecode_string, print_func) ->
  bytes_array = (bytecode_string.charCodeAt(i) for i in [0...bytecode_string.length])
  print_func "Running the bytecode now...\n"
  class_data = new ClassFile(bytes_array)
  console.log class_data
  # try to look at the opcodes
  for m in class_data.methods
    m.run()
  print_func "JVM run finished.\n"
  decompile(class_data)
