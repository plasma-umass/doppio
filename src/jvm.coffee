
# things assigned to root will be available outside this module
root = exports ? this

class AbstractMethodField
  """ Subclasses need to implement parse_descriptor(String) """
  parse: (bytes_array,constant_pool) ->
    @access_flags = parse_flags(read_uint(bytes_array.splice(0,2)))
    @name = constant_pool.get(read_uint(bytes_array.splice(0,2))).value
    throw "Method.parse: Invalid constant_pool name reference" unless @name
    raw_descriptor = constant_pool.get(read_uint(bytes_array.splice(0,2))).value
    throw "Method.parse: Invalid constant_pool descriptor reference" unless raw_descriptor
    @parse_descriptor raw_descriptor
    [@attrs,bytes_array] = make_attributes(bytes_array,constant_pool)
    return bytes_array
  
  parse_field_type: (char_array) ->
    c = char_array.shift()
    switch c
      when 'B' then { type: 'byte' }
      when 'C' then { type: 'char' }
      when 'D' then { type: 'double' }
      when 'F' then { type: 'float' }
      when 'I' then { type: 'int' }
      when 'J' then { type: 'long' }
      when 'L'
        {
          type: 'reference'
          referent: {
            type: 'class' # not technically a legal type
            class_name: (c while c = char_array.shift() != ';').join()
          }
        }
      when 'S' then { type: 'short' }
      when 'Z' then { type: 'boolean' }
      when '[' then {
        type: 'reference'
        referent: @parse_field_type char_array
      }
      else
        char_array.unshift(c)
        return null

class Method extends AbstractMethodField
  get_code: ->
    if @access_flags.native or @access_flags.abstract
      throw "Method does not have associated code!"
    return _.find(@attrs, (a) -> a.constructor.name == "Code")

  parse_descriptor: (raw_descriptor) ->
    raw_descriptor = raw_descriptor.split ''
    throw "Invalid descriptor #{raw_descriptor}" if raw_descriptor.shift() != '('
    @param_types = # apparently making this a one-liner makes this undefined. CS bug?
      while field = @parse_field_type raw_descriptor
        field
    throw "Invalid descriptor #{raw_descriptor}" if raw_descriptor.shift() != ')'
    if raw_descriptor[0] == 'V'
      raw_descriptor.shift()
      @return_type = { type: 'void' }
    else
      @return_type = @parse_field_type raw_descriptor
  
  run: () ->
    throw 'NYI'

class Field extends AbstractMethodField
  parse_descriptor: (raw_descriptor) ->
    # TODO implement this

class ClassFile
  constructor: (bytes_array) ->
    read_u2 = -> read_uint(bytes_array.splice(0,2))
    read_u4 = -> read_uint(bytes_array.splice(0,4))
    throw "Magic number invalid" if read_u4() != 0xCAFEBABE
    @minor_version = read_u2()
    @major_version = read_u2()
    throw "Major version invalid" unless 45 <= @major_version <= 51
    @constant_pool = new ConstantPool
    bytes_array = @constant_pool.parse(bytes_array)
    # bitmask for {public,final,super,interface,abstract} class modifier
    @access_flags = read_u2()
    @this_class  = @constant_pool.get(read_u2()).deref()
    @super_class = @constant_pool.get(read_u2()).deref()
    # direct interfaces of this class
    isize = read_u2()
    @interfaces = (read_u2() for _ in [0...isize])
    # fields of this class
    num_fields = read_u2()
    #TODO: replace the new Method call with something for fields (method_info and field_info look the same)
    @fields = (new Field for _ in [0...num_fields])
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
  canonical = (str) -> str.replace /\//g, '.'
  rv = ""
  source_file = _.find(class_file.attrs, (attr) -> attr.constructor.name == 'SourceFile')
  rv += "class #{class_file.this_class} extends #{canonical class_file.super_class}\n"
  rv += "  SourceFile: \"#{source_file.name}\"\n" if source_file
  rv += "  minor version: #{class_file.minor_version}\n"
  rv += "  major version: #{class_file.major_version}\n"
  rv += "  Constant pool:\n"

  format = (entry) ->
    val = entry.value
    switch entry.type
      when 'Method', 'InterfaceMethod', 'Field'
        "##{val.class_ref.value}.##{val.sig.value}"
      when 'NameAndType' then "##{val.meth_ref.value}:##{val.type_ref.value}"
      else (if entry.deref? then "#" else "") + val

  format_extra_info = (type, info) ->
    switch type
      when 'Method', 'InterfaceMethod', 'Field'
        "#{info.class}.#{info.sig.name}:#{info.sig.type}"
      when 'NameAndType' then "#{info.name}:#{info.type}"
      else info

  pool = class_file.constant_pool
  pool.each (idx, entry) ->
    rv += "const ##{idx} = #{entry.type}\t#{format entry};"
    extra_info = entry.deref?()
    rv += "\t// " + (format_extra_info entry.type, extra_info) if extra_info
    rv += "\n"
  rv += "\n"

  rv += "{\n"
  for m in class_file.methods
    rv +=
      if m.access_flags.public then 'public '
      else if m.access_flags.protected then 'protected '
      else if m.access_flags.private then 'private '
      else ''
    rv += if m.access_flags.static then 'static ' else ''
    # TODO other flags
    rv += (m.return_type?.type or "") + " "
    rv += m.name
    rv += "(#{p.type for p in m.param_types});"
    rv += "\n"
    rv += "  Code:\n"
    code = m.get_code()
    rv += "   Stack=#{code.max_stack}, Locals=#{code.max_locals}, Args_size=#{m.param_types.length}\n"
    code.each_opcode((idx, oc) ->
      rv += "   #{idx}:\t#{oc.name}"
      rv += "   \t##{oc.method_spec_ref}" if oc.constructor.name == 'InvokeOpcode'
      rv += "\n"
    )
    rv += "\n\n"
  rv += "}"

  return rv

# main function that gets called from the frontend
root.run_jvm = (bytecode_string, print_func, decompile_print_func) ->
  bytes_array = (bytecode_string.charCodeAt(i) for i in [0...bytecode_string.length])
  print_func "Running the bytecode now...\n"
  class_data = new ClassFile(bytes_array)
  console.log class_data
  # try to look at the opcodes
  #for m in class_data.methods
    #m.run()
  print_func "JVM run finished.\n"
  decompile_print_func decompile(class_data)
