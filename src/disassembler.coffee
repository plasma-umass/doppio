
# Export a single 'disassemble' function.

@disassemble = (class_file) ->
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
      else ((if entry.deref? then "#" else "") + val).replace /\n/g, "\\n"

  format_extra_info = (type, info) ->
    switch type
      when 'Method', 'InterfaceMethod', 'Field'
        "#{info.class}.#{info.sig.name}:#{info.sig.type}"
      when 'NameAndType' then "#{info.name}:#{info.type}"
      else info.replace /\n/g, "\\n" if util.is_string info

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

module?.exports = @disassemble
