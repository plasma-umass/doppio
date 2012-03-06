
# Export a single 'disassemble' function.

# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util'
opcodes ?= require './opcodes'

@disassemble = (class_file) ->
  canonical = (str) -> str.replace /\//g, '.'
  access_string = (access_flags) ->
    # TODO other flags
    ordered_flags = [ 'public', 'protected', 'private', 'static' ]
    privacy = (("#{flag} " if access_flags[flag]) for flag in ordered_flags).join ''

  source_file = _.find(class_file.attrs, (attr) -> attr.constructor.name == 'SourceFile')
  rv = "Compiled from \"#{source_file.name}\"\n"
  rv += access_string class_file.access_flags
  rv += "class #{canonical class_file.this_class} extends #{canonical class_file.super_class}\n"
  rv += "  SourceFile: \"#{source_file.name}\"\n" if source_file
  rv += "  minor version: #{class_file.minor_version}\n"
  rv += "  major version: #{class_file.major_version}\n"
  rv += "  Constant pool:\n"

  # format the entries for displaying the constant pool. e.g. as '#5.#6' or
  # '3.14159f'
  format = (entry) ->
    val = entry.value
    switch entry.type
      when 'Method', 'InterfaceMethod', 'Field'
        "##{val.class_ref.value}.##{val.sig.value}"
      when 'NameAndType' then "##{val.meth_ref.value}:##{val.type_ref.value}"
      when 'float' then val.toFixed(5) + "f"
      when 'double' then val + "d"
      when 'long' then val + "l"
      else ((if entry.deref? then "#" else "") + val).replace /\n/g, "\\n"

  # if :entry is a reference, display its referent in a comment
  format_extra_info = (entry) ->
    type = entry.type
    info = entry.deref?()
    return "" unless info
    switch type
      when 'Method', 'InterfaceMethod', 'Field'
        "\t//  #{info.class}.#{info.sig.name}:#{info.sig.type}"
      when 'NameAndType' then "//  #{info.name}:#{info.type}"
      else "\t//  " + info.replace /\n/g, "\\n" if util.is_string info

  pool = class_file.constant_pool
  pool.each (idx, entry) ->
    rv += "const ##{idx} = #{entry.type}\t#{format entry};#{format_extra_info entry}\n"
  rv += "\n"

  # pretty-print our field types, e.g. as 'PackageName.ClassName[][]'
  pp_type = (field_type) ->
    return canonical(field_type.class_name) if field_type.type is 'class'
    return field_type.type unless field_type.type is 'reference'
    return pp_type(field_type.referent) + '[]' if field_type.ref_type is 'array'
    return pp_type field_type.referent

  rv += "{\n"

  for f in class_file.fields
    rv += "#{access_string f.access_flags} #{pp_type(f.type)} #{f.name};\n\n\n"

  for m in class_file.methods
    rv += access_string m.access_flags
    if m.name is '<init>'  # constructors are special-cased
      rv += canonical(class_file.this_class)
    else
      rv += (m.return_type?.type or "") + " "
      rv += m.name
    rv += "(#{pp_type(p) for p in m.param_types});"
    rv += "\n"
    unless m.access_flags.native or m.access_flags.abstract
      rv += "  Code:\n"
      code = m.get_code()
      rv += "   Stack=#{code.max_stack}, Locals=#{code.max_locals}, Args_size=#{m.num_args}\n"
      code.each_opcode((idx, oc) ->
        rv += "   #{idx}:\t#{oc.name}"
        rv += 
          if oc instanceof opcodes.InvokeOpcode
            "\t##{oc.method_spec_ref};#{format_extra_info pool.get oc.method_spec_ref}"
          else if oc instanceof opcodes.ClassOpcode
            "\t##{oc.class_ref};#{format_extra_info pool.get oc.class_ref}"
          else if oc instanceof opcodes.FieldOpcode
            "\t##{oc.field_spec_ref};#{format_extra_info pool.get oc.field_spec_ref}"
          else if oc instanceof opcodes.LookupSwitchOpcode
            # this must come before BranchOpcode because LookupSwitchOpcode is
            # a subclass of BranchOpcode
            "{\n" +
              ("\t\t#{match}: #{idx + offset};\n" for match, offset of oc.offsets) +
            "\t\tdefault: #{idx + oc._default} }"
          else if oc instanceof opcodes.BranchOpcode then "\t#{idx + oc.offset}"
          else if oc instanceof opcodes.LoadVarOpcode then "\t#{oc.var_num}"
          else if oc instanceof opcodes.StoreVarOpcode then "\t#{oc.var_num}"
          # TODO: add comments for this constant pool ref as well
          else if oc instanceof opcodes.LoadConstantOpcode then "\t##{oc.constant_ref};"
          else if oc instanceof opcodes.PushOpcode then "\t#{oc.value}"
          else if oc instanceof opcodes.IIncOpcode then "\t#{oc.index}, #{oc.const}"
          else ""
        rv += "\n"
      )
      for attr in code.attrs
        switch attr.constructor.name
          when 'LineNumberTable'
            rv += "  LineNumberTable:\n"
            rv += "   line #{entry.line_number}: #{entry.start_pc}\n" for entry in attr
          when 'StackMapTable'
            rv += "  StackMapTable: number_of_entries = #{attr.num_entries}\n"
            for entry in attr.entries
              rv += "   frame_type = #{entry.frame_type} /* #{entry.frame_name} */\n"
              rv += "     offset_delta = #{entry.offset_delta}\n" if entry.offset_delta?
              rv += "     locals = [ #{entry.locals.join(', ')} ]\n" if entry.locals?
          when 'LocalVariableTable'
            rv += "  LocalVariableTable:\n"
            rv += "   Start  Length  Slot  Name   Signature\n"
            for entry in attr.entries
              rv += "   #{entry.start_pc}      #{entry.length}      #{entry.ref}"
              rv += "#{entry.name}      #{entry.descriptor}\n"
        rv += "\n"
    rv += "\n"

  rv += "}"

  return rv

module?.exports = @disassemble
