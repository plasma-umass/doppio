
root = exports ? this.disassembler = {}

# pull in external modules
_ ?= require '../third_party/underscore-min.js'
util ?= require './util'
opcodes ?= require './opcodes'
{ext_classname} = util

root.disassemble = (class_file) ->
  access_string = (access_flags) ->
    return 'interface ' if access_flags.interface
    ordered_flags = [ 'public', 'protected', 'private', 'static', 'abstract' ]
    privacy = (("#{flag} " if access_flags[flag]) for flag in ordered_flags).join ''

  source_file = _.find(class_file.attrs, (attr) -> attr.constructor.name == 'SourceFile')
  rv = "Compiled from \"#{source_file.name}\"\n"
  rv += access_string class_file.access_flags
  rv += "class #{ext_classname class_file.this_class} extends #{ext_classname class_file.super_class}"
  ifaces = (ext_classname(class_file.constant_pool.get(i).deref()) for i in class_file.interfaces).join ', '
  rv += if (ifaces and not class_file.access_flags.interface) then " implements #{ifaces}\n" else '\n'
  rv += "  SourceFile: \"#{source_file.name}\"\n" if source_file
  inner_classes = (attr for attr in class_file.attrs when attr.constructor.name is 'InnerClasses')
  for icls in inner_classes
    rv += "  InnerClass:\n"
    for cls in icls.classes
      flags = util.parse_flags cls.inner_access_flags
      access = ((f+' ' if flags[f]) for f in [ 'public', 'protected', 'private', 'abstract' ]).join ''
      if cls.outer_info_index <= 0  # it's an anonymous class
        rv += "   #{access}##{cls.inner_info_index};\n"
      else  # it's a named inner class
        rv += "   #{access}##{cls.inner_name_index}= ##{cls.inner_info_index} of ##{cls.outer_info_index};\n"
  rv += "  minor version: #{class_file.minor_version}\n"
  rv += "  major version: #{class_file.major_version}\n"
  rv += "  Constant pool:\n"

  # format floats and doubles in the javap way
  format_decimal = (val,type_char) ->
    m = val.toString().match /(-?\d+)(\.\d+)?(?:e\+?(-?\d+))?/
    str = m[1] + (if m[2] then m[2] else '.0')
    str = parseFloat(str).toFixed(7) if type_char is 'f' and m[2]?.length > 8
    str = str.replace(/0+$/,'').replace(/\.$/,'.0')
    str += "E#{m[3]}" if m[3]?
    str + type_char

  # format the entries for displaying the constant pool. e.g. as '#5.#6' or
  # '3.14159f'
  format = (entry) ->
    val = entry.value
    switch entry.type
      when 'Method', 'InterfaceMethod', 'Field'
        "##{val.class_ref.value}.##{val.sig.value}"
      when 'NameAndType' then "##{val.meth_ref.value}:##{val.type_ref.value}"
      when 'float' then format_decimal val, 'f'
      when 'double' then format_decimal val, 'd'
      when 'long' then val + "l"
      else escape_whitespace ((if entry.deref? then "#" else "") + val)

  pool = class_file.constant_pool
  pool.each (idx, entry) ->
    rv += "const ##{idx} = #{entry.type}\t#{format entry};#{format_extra_info entry}\n"
  rv += "\n"

  # pretty-print our field types, e.g. as 'PackageName.ClassName[][]'
  pp_type = (field_type) ->
    if field_type instanceof types.ArrayType then pp_type(field_type.component_type) + '[]'
    else field_type.toExternalString()

  rv += "{\n"

  for f in class_file.fields
    rv += "#{access_string f.access_flags} #{pp_type(f.type)} #{f.name};\n\n\n"

  for m in class_file.methods
    rv += access_string m.access_flags
    rv +=
      # initializers are special-cased
      if m.name is '<init>' then ext_classname class_file.this_class # instance init
      else if m.name is '<clinit>' then "{}" # class init
      else
        ret_type = if m.return_type? then pp_type m.return_type else ""
        ret_type + " " + m.name
    rv += "(#{pp_type(p) for p in m.param_types})" unless m.name is '<clinit>'
    rv += ";\n"
    unless m.access_flags.native or m.access_flags.abstract
      rv += "  Code:\n"
      code = m.get_code()
      rv += "   Stack=#{code.max_stack}, Locals=#{code.max_locals}, Args_size=#{m.num_args}\n"
      code.each_opcode (idx, oc) ->
        rv += "   #{idx}:\t#{oc.name}"
        rv += (util.lookup_handler root.opcode_annotators, oc, idx, pool) || ""
        rv += "\n"
      if code.exception_handlers.length > 0
        # For printing columns.
        fixed_width = (num, width) ->
          num_str = num.toString()
          (" " for [0...width-num_str.length]).join('') + num_str
        rv += "  Exception table:\n"
        rv += "   from   to  target type\n"
        for eh in code.exception_handlers
          rv += (fixed_width eh[item], 6 for item in ['start_pc', 'end_pc', 'handler_pc']).join ''
          rv += "   #{if eh.catch_type[0] == '<' then 'any' else "Class #{eh.catch_type}\n"}\n"
        rv += "\n"
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
              rv += "     stack = [ #{entry.stack} ]\n" if entry.stack?
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

escape_whitespace = (str) ->
 str.replace /\s/g, (c) ->
   switch c
     when "\n" then "\\n"
     when "\r" then "\\r"
     when "\t" then "\\t"
     when "\v" then "\\v"
     when "\f" then "\\f"
     else c

# if :entry is a reference, display its referent in a comment
format_extra_info = (entry) ->
  type = entry.type
  info = entry.deref?()
  return "" unless info
  switch type
    when 'Method', 'InterfaceMethod', 'Field'
      "\t//  #{info.class}.#{info.sig.name}:#{info.sig.type}"
    when 'NameAndType' then "//  #{info.name}:#{info.type}"
    else "\t//  " + escape_whitespace info if util.is_string info

primitive_types = {'Z':'boolean','C':'char','F':'float','D':'double','B':'byte','S':'short','I':'int','J':'long'}

root.opcode_annotators =
  InvokeOpcode: (idx, pool) ->
    "\t##{@method_spec_ref}" +
    (if @name == 'invokeinterface' then ",  #{@count}" else "") +
    ";#{format_extra_info pool.get @method_spec_ref}"
  ClassOpcode: (idx, pool) ->
    "\t##{@class_ref};#{format_extra_info pool.get @class_ref}"
  FieldOpcode: (idx, pool) ->
    "\t##{@field_spec_ref};#{format_extra_info pool.get @field_spec_ref}"
  SwitchOpcode: (idx) ->
    "{\n" +
      ("\t\t#{match}: #{idx + offset};\n" for match, offset of @offsets).join('') +
    "\t\tdefault: #{idx + @_default} }"
  BranchOpcode: (idx) -> "\t#{idx + @offset}"
  LoadVarOpcode: -> "\t#{@var_num}"
  StoreVarOpcode: -> "\t#{@var_num}"
  # TODO: add comments for this constant pool ref as well
  LoadConstantOpcode: -> "\t##{@constant_ref};"
  PushOpcode: -> "\t#{@value}"
  IIncOpcode: -> "\t#{@index}, #{@const}"
  NewArrayOpcode: -> "\t#{primitive_types[@element_type]}"
  MultiArrayOpcode: -> "\t##{@class_ref},  #{@dim};"
