"use strict"

root = exports ? this.disassembler = {}

# pull in external modules
util = require './util'

pad_left = (value, padding) ->
  zeroes = new Array(padding).join '0'
  (zeroes + value).slice(-padding)

access_string = (access_flags) ->
  ordered_flags = [ 'public', 'protected', 'private', 'static', 'final', 'native' ]
  ordered_flags.push 'abstract' unless access_flags.interface
  (flag+' ' for flag in ordered_flags when access_flags[flag]).join ''

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
    else util.escape_whitespace((if entry.deref? then '#' else '') + val).replace(/"/g,'\\"')

# pretty-print our field types, e.g. as 'PackageName.ClassName[][]'
pp_type = (field_type) ->
  if util.is_array_type field_type then pp_type(util.get_component_type field_type) + '[]'
  else util.ext_classname field_type

print_excs = (excs) ->
  "   throws #{(util.ext_classname(e) for e in excs).join ', '}"

# For printing columns.
fixed_width = (num, width) ->
  num_str = num.toString()
  (new Array(width-num_str.length+1)).join(' ') + num_str

root.disassemble = (class_file) ->
  show_disassembly make_dis class_file

make_dis = (class_file) ->
  # standard class stuff
  dis = {
    source_file: class_file.get_attribute('SourceFile')?.filename ? null
    is_deprecated: class_file.get_attribute('Deprecated')?
    annotation_bytes: class_file.get_attribute('RuntimeVisibleAnnotations')?.raw_bytes ? null
    interfaces: class_file.get_interface_types()
    access_string:  access_string class_file.access_flags
    class_type: (if class_file.access_flags.interface then 'interface'  else 'class')
    class_name: class_file.get_type()
    superclass: class_file.get_super_class_type()
    major_version: class_file.major_version
    minor_version: class_file.minor_version
    constant_pool: []
    inner_classes: []
    fields: []
    methods: []
  }
  # constant pool entries
  pool = class_file.constant_pool
  pool.each (idx, entry) ->
    dis.constant_pool.push
      idx: idx
      type: entry.type
      value: format entry
      extra: util.format_extra_info entry
  # inner classes
  for icls in class_file.get_attributes('InnerClasses')
    icls_group = []
    for cls in icls.classes
      flags = util.parse_flags cls.inner_access_flags
      icls_group.push
        access_string: (f+' ' for f in ['public', 'abstract'] when flags[f]).join ''
        type: util.descriptor2typestr pool.get(cls.inner_info_index).deref()
        raw: cls  # useful for inner/outer indices
        name: if cls.inner_name_index > 0 then pool.get(cls.inner_name_index).value else null
        outer_type: if cls.outer_info_index > 0 then pool.get(cls.outer_info_index).deref() else null
    dis.inner_classes.push icls_group
  # fields
  for f in class_file.get_fields()
    field =
      type: f.type
      name: f.name
      access_string: access_string(f.access_flags)
      signature_bytes: f.get_attribute('Signature')?.raw_bytes ? null
    const_attr = f.get_attribute 'ConstantValue'
    if const_attr?
      entry = pool.get(const_attr.ref)
      field.const_type = entry.type
      field.const_value = entry.deref?() or format(entry)
    dis.fields.push field
  # methods
  for sig, m of class_file.get_methods()
    method =
      access_string: access_string m.access_flags
      is_synchronized: m.access_flags.synchronized
      return_type: m.return_type ? ''
      name: m.name
      param_types: m.param_types
      exceptions: m.get_attribute('Exceptions')?.exceptions ? null

    unless m.access_flags.native or m.access_flags.abstract
      code = m.code
      code.parse_code()
      method.code = {
        max_stack: code.max_stack
        max_locals: code.max_locals
        num_args: m.num_args
        exception_handlers: code.exception_handlers
        attributes: code.attrs
      }
      method.code.opcodes = ops = []
      code.each_opcode (idx, oc) ->
        ops.push {idx: idx, name: oc.name, annotation: oc.annotate(idx, pool)}
    dis.methods.push method
  return dis

show_disassembly = (dis) ->
  ifaces = (util.ext_classname(i) for i in dis.interfaces).join ','
  name = util.ext_classname dis.class_name
  rv = "Compiled from \"#{dis.source_file ? 'unknown'}\"\n#{dis.access_string}#{dis.class_type} #{name} "
  if dis.class_type is 'interface'
    rv += if ifaces.length > 0 then "extends #{ifaces}\n" else '\n'
  else
    rv += "extends #{util.ext_classname dis.superclass}"
    rv += if ifaces then " implements #{ifaces}\n" else '\n'
  rv += "  SourceFile: \"#{dis.source_file}\"\n" if dis.source_file
  rv += "  Deprecated: length = 0x\n" if dis.is_deprecated
  if dis.annotation_bytes
    alen = dis.annotation_bytes.length.toString(16)
    abytes = (pad_left(b.toString(16),2) for b in dis.annotation_bytes).join ' '
    rv += "  RuntimeVisibleAnnotations: length = 0x#{alen}\n   #{abytes}\n"
  for icls_group in dis.inner_classes
    rv += "  InnerClass:\n"
    for icls in icls_group
      unless icls.name?  # anonymous inner class
        rv += "   #{icls.access_string}##{icls.raw.inner_info_index}; //class #{icls.type}\n"
      else  # it's a named inner class
        rv += "   #{icls.access_string}##{icls.raw.inner_name_index}= ##{icls.raw.inner_info_index}"
        unless icls.outer_type?
          rv += "; //#{icls.name}=class #{icls.type}\n"
        else
          rv += " of ##{icls.raw.outer_info_index}; //#{icls.name}=class #{icls.type} of class #{icls.outer_type}\n"
  rv += "  minor version: #{dis.minor_version}\n  major version: #{dis.major_version}\n  Constant pool:\n"
  for entry in dis.constant_pool
    rv += "const ##{entry.idx} = #{entry.type}\t#{entry.value};#{entry.extra}\n"
  rv += "\n{\n"

  for f in dis.fields
    rv += "#{f.access_string}#{pp_type(f.type)} #{f.name};\n"
    if f.const_type?
      rv += "  Constant value: #{f.const_type} #{f.const_value}\n"
    if f.signature_bytes?
      siglen = f.signature_bytes.length.toString(16)
      sigbytes = (pad_left(b.toString(16).toUpperCase(),2) for b in f.signature_bytes).join ' '
      rv += "  Signature: length = 0x#{siglen}\n   #{sigbytes}\n"
    rv += "\n\n"

  for m in dis.methods
    rv += m.access_string
    rv += 'synchronized ' if m.is_synchronized
    ptypes = (pp_type(p) for p in m.param_types).join ', '
    if m.name is '<clinit>'
      rv += '{}'
    else if m.name is '<init>'
      rv += "#{name}(#{ptypes})"
    else
      rv += "#{pp_type m.return_type} #{m.name}(#{ptypes})"
    rv += print_excs m.exceptions if m.exceptions?
    rv += ";\n"
    if m.code?
      c = m.code
      rv += "  Code:\n   Stack=#{c.max_stack}, Locals=#{c.max_locals}, Args_size=#{c.num_args}\n"
      rv += ("   #{o.idx}:\t#{o.name}#{o.annotation}\n" for o in c.opcodes).join ''
      if c.exception_handlers?.length > 0
        rv += "  Exception table:\n   from   to  target type\n"
        for eh in c.exception_handlers
          rv += (fixed_width eh[item], 6 for item in ['start_pc', 'end_pc', 'handler_pc']).join ''
          if eh.catch_type is '<any>'
            rv += "   any\n"
          else
            rv += "   Class #{eh.catch_type[1...-1]}\n"
        rv += "\n"
      rv += (attr.disassemblyOutput?() or '' for attr in c.attributes).join ''
      rv += "  Exceptions:\n#{print_excs m.exceptions}\n" if m.exceptions?
    rv += "\n"
  rv += "}\n"
  return rv
