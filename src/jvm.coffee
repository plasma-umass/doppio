
# things assigned to root will be available outside this module
root = exports ? this 

class Method
  parse: (bytes_array) ->
    @access_flags = read_uint(bytes_array.splice(0,2))
    @name_ref = read_uint(bytes_array.splice(0,2))
    @desc_ref = read_uint(bytes_array.splice(0,2))
    num_attrs = read_uint(bytes_array.splice(0,2))
    @attrs = (new Attribute for _ in [0...num_attrs])
    for attr in @attrs
      bytes_array = attr.parse(bytes_array)
    return bytes_array

class ClassFile
  constructor: (bytes_array) ->
    read_u2 = -> read_uint(bytes_array.splice(0,2))
    read_u4 = -> read_uint(bytes_array.splice(0,4))
    throw "Magic number invalid" if read_u4() != 0xCAFEBABE
    minor_version = read_u2()  # unused, but it cuts off two bytes
    throw "Major version invalid" unless 45 <= read_u2() <= 51
    cp = new ConstantPool
    bytes_array = cp.parse(bytes_array)
    @constant_pool = cp.condense()
    # bitmask for {public,final,super,interface,abstract} class modifier
    @access_flags = read_u2()
    # indices into constant_pool for this and super classes. super_class == 0 for Object?
    @this_class  = read_u2()
    @super_class = read_u2()
    # direct interfaces of this class
    isize = read_u2()
    @interfaces = (read_u2() for _ in [0...isize])
    # fields of this class
    num_fields = read_u2()
    @fields = (new Method for _ in [0...num_fields])
    for f in @fields
      bytes_array = f.parse(bytes_array)
    # class methods
    num_methods = read_u2()
    @methods = (new Method for _ in [0...num_methods])
    for m in @methods
      bytes_array = m.parse(bytes_array)
    # class attributes
    num_attrs = read_u2()
    @attrs = (new Attribute for _ in [0...num_attrs])
    for attr in @attrs
      bytes_array = attr.parse(bytes_array)
    console.log "leftover bytes:", bytes_array

# main function that gets called from the frontend
root.run_jvm = (bytecode_string, print_func) ->
  bytes_array = (bytecode_string.charCodeAt(i) for i in [0...bytecode_string.length])
  print_func "Running the bytecode now...\n"
  try
    class_data = new ClassFile(bytes_array)
  catch error
    print_func "Error in header: #{error}\n"
  print_func "JVM run finished.\n"
  console.log class_data