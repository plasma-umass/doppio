
# Export a single 'disassemble' function.

# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util'

@disassemble = (class_file) ->
  canonical = (str) -> str.replace /\//g, '.'
  access_string = (access_flags) ->
    for flag in [ 'public', 'protected', 'private' ]
      return "#{flag} " if access_flags[flag]
    ""

  rv = ""
  source_file = _.find(class_file.attrs, (attr) -> attr.constructor.name == 'SourceFile')
  rv += access_string class_file.access_flags
  rv += "class #{canonical class_file.this_class} extends #{canonical class_file.super_class}\n"
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
      else ((if entry.deref? then "#" else "") + val).replace /\n/g, "\\n"

  format_extra_info = (type, info) ->
    switch type
      when 'Method', 'InterfaceMethod', 'Field'
        "\t//  #{info.class}.#{info.sig.name}:#{info.sig.type}"
      when 'NameAndType' then "//  #{info.name}:#{info.type}"
      else "\t//  " + info.replace /\n/g, "\\n" if util.is_string info

  pool = class_file.constant_pool
  pool.each (idx, entry) ->
    rv += "const ##{idx} = #{entry.type}\t#{format entry};"
    extra_info = entry.deref?()
    rv += format_extra_info entry.type, extra_info if extra_info
    rv += "\n"
  rv += "\n"

  rv += "{\n"
  for m in class_file.methods
    rv += access_string m.access_flags
    rv += if m.access_flags.static then 'static ' else ''
    # TODO other flags
    if m.name is '<init>'  # constructors are special-cased
      rv += canonical(class_file.this_class)
    else
      rv += (m.return_type?.type or "") + " "
      rv += m.name
    rv += "(#{p.type for p in m.param_types});"
    rv += "\n"
    unless m.access_flags.native or m.access_flags.abstract
      rv += "  Code:\n"
      code = m.get_code()
      args_size = m.param_types.length + (if m.access_flags.static then 0 else 1)  # nonstatic methods get 'this'
      rv += "   Stack=#{code.max_stack}, Locals=#{code.max_locals}, Args_size=#{args_size}\n"
      code.each_opcode((idx, oc) ->
        rv += "   #{idx}:\t#{oc.name}"
        #TODO: add the appropriate comments for the refs here (as in the constant pool)
        rv += switch oc.constructor.name
          when 'InvokeOpcode' then "\t##{oc.method_spec_ref}; //"
          when 'ClassOpcode' then "\t##{oc.class_ref}; //"
          when 'FieldOpcode' then "\t##{oc.descriptor_ref}; //"
          when 'BranchOpcode' then "\t#{idx + oc.offset}"
          when 'LocalVarOpcode' then "\t#{oc.var_num}"
          when 'LoadOpcode' then "\t##{oc.constant_ref}; //"
          else ""
        rv += "\n"
      )
      for attr in code.attrs
        switch attr.constructor.name
          when 'LineNumberTable'
            rv += "  LineNumberTable: \n"
            rv += "   line #{entry.line_number}: #{entry.start_pc}\n" for entry in attr
            rv += "\n"
          when 'StackMapTable'
            rv += "  StackMapTable: number_of_entries = #{attr.num_entries}\n"
            for entry in attr.entries
              rv += "   frame_type = #{entry.frame_type} /* #{entry.frame_name} */\n"
            rv += "\n"

    rv += "\n"
  rv += "}"

  return rv

module?.exports = @disassemble
