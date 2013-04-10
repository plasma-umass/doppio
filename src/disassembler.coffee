"use strict"

root = exports ? this.disassembler = {}

# pull in external modules
_ = require '../vendor/_.js'
util = require './util'

pad_left = (value, padding) ->
  zeroes = new Array(padding).join '0'
  (zeroes + value).slice(-padding)

root.disassemble = (class_file) ->
  pool = class_file.constant_pool
  access_string = (access_flags) ->
    ordered_flags = [ 'public', 'protected', 'private', 'static', 'final' ]
    ordered_flags.push 'abstract' unless access_flags.interface
    privacy = (("#{flag} " if access_flags[flag]) for flag in ordered_flags).join ''

  source_file = class_file.get_attribute 'SourceFile'
  deprecated = class_file.get_attribute 'Deprecated'
  annotations = class_file.get_attribute 'RuntimeVisibleAnnotations'
  ifaces = class_file.get_interface_types()
  ifaces = (util.ext_classname(i) for i in ifaces).join ','
  rv = "Compiled from \"#{source_file?.filename ? 'unknown'}\"\n"
  rv += access_string class_file.access_flags
  if class_file.access_flags.interface
    rv += "interface #{class_file.toExternalString()}#{if ifaces.length > 0 then " extends #{ifaces}" else ''}\n"
  else
    rv += "class #{class_file.toExternalString()} extends #{util.ext_classname(class_file.get_super_class_type())}"
    rv += if (ifaces and not class_file.access_flags.interface) then " implements #{ifaces}\n" else '\n'
  rv += "  SourceFile: \"#{source_file.filename}\"\n" if source_file
  rv += "  Deprecated: length = 0x\n" if deprecated
  if annotations
    rv += "  RuntimeVisibleAnnotations: length = 0x#{annotations.raw_bytes.length.toString(16)}\n"
    rv += "   #{(pad_left(b.toString(16),2) for b in annotations.raw_bytes).join ' '}\n"
  inner_classes = class_file.get_attributes 'InnerClasses'
  for icls in inner_classes
    rv += "  InnerClass:\n"
    for cls in icls.classes
      flags = util.parse_flags cls.inner_access_flags
      access = ((f+' ' if flags[f]) for f in [ 'public', 'protected', 'private', 'abstract' ]).join ''
      cls_type = util.descriptor2typestr pool.get(cls.inner_info_index).deref()
      if cls.inner_name_index <= 0  # anonymous inner class
          rv += "   #{access}##{cls.inner_info_index}; //class #{cls_type}\n"
      else  # it's a named inner class
        rv += "   #{access}##{cls.inner_name_index}= ##{cls.inner_info_index}"
        name = pool.get(cls.inner_name_index).value
        if cls.outer_info_index <= 0
          rv += "; //#{name}=class #{cls_type}\n"
        else
          outer_cls_type = util.descriptor2typestr pool.get(cls.outer_info_index).deref()
          rv += " of ##{cls.outer_info_index}; //#{name}=class #{cls_type} of class #{outer_cls_type}\n"
  rv += "  minor version: #{class_file.minor_version}\n"
  rv += "  major version: #{class_file.major_version}\n"
  rv += "  Constant pool:\n"

  # format floats and doubles in the javap way
  format_decimal = (val,type_char) ->
    valStr = val.toString()
    if type_char == 'f'
      if val is util.FLOAT_POS_INFINITY or val is Number.POSITIVE_INFINITY
        valStr = "Infinity"
      else if val is util.FLOAT_NEG_INFINITY or val is Number.NEGATIVE_INFINITY
        valStr = "-Infinity"
      else if val is NaN
        valStr = "NaN"

    if valStr.match(/-?(Infinity|NaN)/)
      str = valStr
    else
      m = valStr.match /(-?\d+)(\.\d+)?(?:e\+?(-?\d+))?/
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
      else util.escape_whitespace ((if entry.deref? then "#" else "") + val)

  pool.each (idx, entry) ->
    rv += "const ##{idx} = #{entry.type}\t#{format entry};"
    rv += "#{util.format_extra_info entry}\n"
  rv += "\n"

  # pretty-print our field types, e.g. as 'PackageName.ClassName[][]'
  pp_type = (field_type) ->
    if util.is_array_type field_type then pp_type(util.get_component_type field_type) + '[]'
    else util.ext_classname field_type

  print_excs = (exc_attr) ->
    excs = exc_attr.exceptions
    "   throws " + (util.ext_classname(e) for e in excs).join ', '

  rv += "{\n"

  for f in class_file.get_fields()
    rv += access_string(f.access_flags)
    rv += "#{pp_type(f.type)} #{f.name};\n"
    const_attr = f.get_attribute 'ConstantValue'
    if const_attr?
      entry = pool.get(const_attr.ref)
      # If it's a string, dereference the value. Otherwise, format the numeric value.
      rv += "  Constant value: #{entry.type} #{entry.deref?() or format(entry)}\n"
    sig = f.get_attribute 'Signature'
    if sig?
      rv += "  Signature: length = 0x#{sig.raw_bytes.length.toString(16)}\n"
      rv += "   #{(pad_left(b.toString(16).toUpperCase(),2) for b in sig.raw_bytes).join ' '}\n"
    rv += "\n\n"

  for sig, m of class_file.get_methods()
    rv += access_string m.access_flags
    rv += 'synchronized ' if m.access_flags.synchronized
    rv +=
      # initializers are special-cased
      if m.name is '<init>' then class_file.toExternalString() # instance init
      else if m.name is '<clinit>' then "{}" # class init
      else
        ret_type = if m.return_type? then pp_type m.return_type else ""
        ret_type + " " + m.name
    rv += "(#{(pp_type(p) for p in m.param_types).join ', '})" unless m.name is '<clinit>'
    rv += print_excs exc_attr if exc_attr = m.get_attribute 'Exceptions'
    rv += ";\n"
    unless m.access_flags.native or m.access_flags.abstract
      rv += "  Code:\n"
      code = m.code
      rv += "   Stack=#{code.max_stack}, Locals=#{code.max_locals}, Args_size=#{m.num_args}\n"
      code.parse_code()
      code.each_opcode (idx, oc) ->
        rv += "   #{idx}:\t#{oc.name}"
        rv += oc.annotate(idx, pool)
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
          if eh.catch_type is '<any>'
            rv += "   any\n"
          else
            rv += "   Class #{eh.catch_type[1...-1]}\n"
        rv += "\n"
      for attr in code.attrs
        rv += attr.disassemblyOutput?() or ''
      rv += "  Exceptions:\n#{print_excs exc_attr}\n" if exc_attr
    rv += "\n"

  rv += "}\n"

  return rv
