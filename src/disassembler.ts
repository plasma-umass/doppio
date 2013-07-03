import util = module('./util');

function pad_left(value: string, padding: number): string {
  var zeroes = new Array(padding).join('0');
  return (zeroes + value).slice(-padding);
}

function access_string(access_flags: any): string {
  var ordered_flags = ['public', 'protected', 'private', 'static', 'final', 'native'];
  if (!access_flags["interface"]) {
    ordered_flags.push('abstract');
  }
  return ordered_flags.filter((flag: string) => access_flags[flag]).join(' ');
}

// format floats and doubles in the javap way
function format_decimal(val: number, type_char: string): string {
  var m, _ref;

  var valStr = val.toString();
  if (type_char === 'f') {
    if (val === util.FLOAT_POS_INFINITY || val === Number.POSITIVE_INFINITY) {
      valStr = "Infinity";
    } else if (val === util.FLOAT_NEG_INFINITY || val === Number.NEGATIVE_INFINITY) {
      valStr = "-Infinity";
    } else if (val === NaN) {
      valStr = "NaN";
    }
  }
  var str;
  if (valStr.match(/-?(Infinity|NaN)/)) {
    str = valStr;
  } else {
    var m = valStr.match(/(-?\d+)(\.\d+)?(?:e\+?(-?\d+))?/);
    str = m[1] + (m[2] ? m[2] : '.0');
    if (type_char === 'f' && m[2] != null && m[2].length > 8) {
      str = parseFloat(str).toFixed(7);
    }
    str = str.replace(/0+$/, '').replace(/\.$/, '.0');
    if (m[3] != null) {
      str += "E" + m[3];
    }
  }
  return str + type_char;
}

// format the entries for displaying the constant pool. e.g. as '#5.#6' or
// '3.14159f'
function format(entry): string {
  var val = entry.value;
  switch (entry.type) {
    case 'Method':
    case 'InterfaceMethod':
    case 'Field':
      return "#" + val.class_ref.value + ".#" + val.sig.value;
    case 'NameAndType':
      return "#" + val.meth_ref.value + ":#" + val.type_ref.value;
    case 'float':
      return format_decimal(val, 'f');
    case 'double':
      return format_decimal(val, 'd');
    case 'long':
      return val + "l";
    default:
      return util.escape_whitespace((entry.deref != null ? '#' : '') + val).replace(/"/g, '\\"');
  }
}

// pretty-print our field types, e.g. as 'PackageName.ClassName[][]'
function pp_type(field_type): string {
  if (util.is_array_type(field_type)) {
    return pp_type(util.get_component_type(field_type)) + '[]';
  }
  return util.ext_classname(field_type);
}

function print_excs(excs) {
  return "   throws " + excs.map(util.ext_classname).join(', ');
}

// For printing columns.
function fixed_width(num: number, width: number) {
  var num_str = num.toString();
  return (new Array(width - num_str.length + 1)).join(' ') + num_str;
}

export function disassemble(class_file): string {
  return show_disassembly(make_dis(class_file));
}

function make_dis(class_file) {
  var cls, code, const_attr, dis, entry, f, field, flags, icls, icls_group, m, method, ops, pool, sig, _i, _j, _k, _len, _len1, _len2, _ref, _ref1, _ref10, _ref11, _ref12, _ref2, _ref3, _ref4, _ref5, _ref6, _ref7, _ref8, _ref9;
  // standard class stuff
  dis = {
    source_file: (_ref = (_ref1 = class_file.get_attribute('SourceFile')) != null ? _ref1.filename : void 0) != null ? _ref : null,
    is_deprecated: class_file.get_attribute('Deprecated') != null,
    annotation_bytes: (_ref2 = (_ref3 = class_file.get_attribute('RuntimeVisibleAnnotations')) != null ? _ref3.raw_bytes : void 0) != null ? _ref2 : null,
    interfaces: class_file.get_interface_types(),
    access_string: access_string(class_file.access_flags),
    class_type: (class_file.access_flags["interface"] ? 'interface' : 'class'),
    class_name: class_file.get_type(),
    superclass: class_file.get_super_class_type(),
    major_version: class_file.major_version,
    minor_version: class_file.minor_version,
    constant_pool: [],
    inner_classes: [],
    fields: [],
    methods: []
  };
  // constant pool entries
  pool = class_file.constant_pool;
  pool.each(function(idx, entry) {
    return dis.constant_pool.push({
      idx: idx,
      type: entry.type,
      value: format(entry),
      extra: util.format_extra_info(entry)
    });
  });
  // inner classes
  _ref4 = class_file.get_attributes('InnerClasses');
  for (_i = 0, _len = _ref4.length; _i < _len; _i++) {
    icls = _ref4[_i];
    icls_group = [];
    _ref5 = icls.classes;
    for (_j = 0, _len1 = _ref5.length; _j < _len1; _j++) {
      var cls = _ref5[_j];
      var flags = util.parse_flags(cls.inner_access_flags);
      var astr = '';
      if (flags['public']) { astr += 'public '; }
      if (flags['abstract']) { astr += 'abstract '; }
      icls_group.push({
        access_string: astr,
        type: util.descriptor2typestr(pool.get(cls.inner_info_index).deref()),
        raw: cls,  // useful for inner/outer indices
        name: cls.inner_name_index > 0 ? pool.get(cls.inner_name_index).value : null,
        outer_type: cls.outer_info_index > 0 ? pool.get(cls.outer_info_index).deref() : null
      });
    }
    dis.inner_classes.push(icls_group);
  }
  // fields
  _ref6 = class_file.get_fields();
  for (_k = 0, _len2 = _ref6.length; _k < _len2; _k++) {
    f = _ref6[_k];
    field = {
      type: f.type,
      name: f.name,
      access_string: access_string(f.access_flags),
      signature_bytes: (_ref7 = (_ref8 = f.get_attribute('Signature')) != null ? _ref8.raw_bytes : void 0) != null ? _ref7 : null
    };
    const_attr = f.get_attribute('ConstantValue');
    if (const_attr != null) {
      entry = pool.get(const_attr.ref);
      field.const_type = entry.type;
      field.const_value = (typeof entry.deref === "function" ? entry.deref() : void 0) || format(entry);
    }
    dis.fields.push(field);
  }
  // methods
  _ref9 = class_file.get_methods();
  for (sig in _ref9) {
    m = _ref9[sig];
    method = {
      access_string: access_string(m.access_flags),
      is_synchronized: m.access_flags.synchronized,
      return_type: (_ref10 = m.return_type) != null ? _ref10 : '',
      name: m.name,
      param_types: m.param_types,
      exceptions: (_ref11 = (_ref12 = m.get_attribute('Exceptions')) != null ? _ref12.exceptions : void 0) != null ? _ref11 : null
    };
    if (!(m.access_flags["native"] || m.access_flags.abstract)) {
      code = m.code;
      code.parse_code();
      method.code = {
        max_stack: code.max_stack,
        max_locals: code.max_locals,
        num_args: m.num_args,
        exception_handlers: code.exception_handlers,
        attributes: code.attrs
      };
      method.code.opcodes = ops = [];
      code.each_opcode(function(idx, oc) {
        return ops.push({
          idx: idx,
          name: oc.name,
          annotation: oc.annotate(idx, pool)
        });
      });
    }
    dis.methods.push(method);
  }
  return dis;
}

function show_disassembly(dis): string {
  var attr, b, c, eh, entry, f, i, icls, item, m, o, p, sigbytes, siglen, _i, _j, _k, _l, _len, _len1, _len2, _len3, _len4, _len5, _m, _n, _ref, _ref1, _ref2, _ref3, _ref4, _ref5, _ref6;

  var ifaces = dis.interfaces.map(util.ext_classname).join(',');
  var name = util.ext_classname(dis.class_name);
  var rv = "Compiled from \"" + ((_ref = dis.source_file) != null ? _ref : 'unknown') + "\"\n" + dis.access_string + dis.class_type + " " + name + " ";
  if (dis.class_type === 'interface') {
    rv += ifaces.length > 0 ? "extends " + ifaces + "\n" : '\n';
  } else {
    rv += "extends " + (util.ext_classname(dis.superclass));
    rv += ifaces ? " implements " + ifaces + "\n" : '\n';
  }
  if (dis.source_file) {
    rv += "  SourceFile: \"" + dis.source_file + "\"\n";
  }
  if (dis.is_deprecated) {
    rv += "  Deprecated: length = 0x\n";
  }
  if (dis.annotation_bytes) {
    var alen = dis.annotation_bytes.length.toString(16);
    var abytes = dis.annotation_bytes.map((b)=>pad_left(b.toString(16), 2)).join(' ');
    rv += "  RuntimeVisibleAnnotations: length = 0x" + alen + "\n   " + abytes + "\n";
  }
  _ref1 = dis.inner_classes;
  for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
    var icls_group = _ref1[_i];
    rv += "  InnerClass:\n";
    for (_j = 0, _len1 = icls_group.length; _j < _len1; _j++) {
      icls = icls_group[_j];
      if (icls.name == null) {
        // anonymous inner class
        rv += "   " + icls.access_string + "#" + icls.raw.inner_info_index + "; //class " + icls.type + "\n";
      } else {
        // it's a named inner class
        rv += "   " + icls.access_string + "#" + icls.raw.inner_name_index + "= #" + icls.raw.inner_info_index;
        if (icls.outer_type == null) {
          rv += "; //" + icls.name + "=class " + icls.type + "\n";
        } else {
          rv += " of #" + icls.raw.outer_info_index + "; //" + icls.name + "=class " + icls.type + " of class " + icls.outer_type + "\n";
        }
      }
    }
  }
  rv += "  minor version: " + dis.minor_version + "\n  major version: " + dis.major_version + "\n  Constant pool:\n";
  _ref2 = dis.constant_pool;
  for (_k = 0, _len2 = _ref2.length; _k < _len2; _k++) {
    entry = _ref2[_k];
    rv += "const #" + entry.idx + " = " + entry.type + "\t" + entry.value + ";" + entry.extra + "\n";
  }
  rv += "\n{\n";
  _ref3 = dis.fields;
  for (_l = 0, _len3 = _ref3.length; _l < _len3; _l++) {
    f = _ref3[_l];
    rv += "" + f.access_string + (pp_type(f.type)) + " " + f.name + ";\n";
    if (f.const_type != null) {
      rv += "  Constant value: " + f.const_type + " " + f.const_value + "\n";
    }
    if (f.signature_bytes != null) {
      siglen = f.signature_bytes.length.toString(16);
      sigbytes = ((function() {
        var _len4, _m, _ref4, _results;

        _ref4 = f.signature_bytes;
        _results = [];
        for (_m = 0, _len4 = _ref4.length; _m < _len4; _m++) {
          b = _ref4[_m];
          _results.push(pad_left(b.toString(16).toUpperCase(), 2));
        }
        return _results;
      })()).join(' ');
      rv += "  Signature: length = 0x" + siglen + "\n   " + sigbytes + "\n";
    }
    rv += "\n\n";
  }
  _ref4 = dis.methods;
  for (_m = 0, _len4 = _ref4.length; _m < _len4; _m++) {
    m = _ref4[_m];
    rv += m.access_string;
    if (m.is_synchronized) {
      rv += 'synchronized ';
    }
    var ptypes = m.param_types.map(pp_type).join(', ');
    if (m.name === '<clinit>') {
      rv += '{}';
    } else if (m.name === '<init>') {
      rv += "" + name + "(" + ptypes + ")";
    } else {
      rv += "" + (pp_type(m.return_type)) + " " + m.name + "(" + ptypes + ")";
    }
    if (m.exceptions != null) {
      rv += print_excs(m.exceptions);
    }
    rv += ";\n";
    if (m.code != null) {
      c = m.code;
      rv += "  Code:\n   Stack=" + c.max_stack + ", Locals=" + c.max_locals + ", Args_size=" + c.num_args + "\n";
      rv += ((function() {
        var _len5, _n, _ref5, _results;

        _ref5 = c.opcodes;
        _results = [];
        for (_n = 0, _len5 = _ref5.length; _n < _len5; _n++) {
          o = _ref5[_n];
          _results.push("   " + o.idx + ":\t" + o.name + o.annotation + "\n");
        }
        return _results;
      })()).join('');
      if (((_ref5 = c.exception_handlers) != null ? _ref5.length : void 0) > 0) {
        rv += "  Exception table:\n   from   to  target type\n";
        _ref6 = c.exception_handlers;
        for (_n = 0, _len5 = _ref6.length; _n < _len5; _n++) {
          eh = _ref6[_n];
          rv += ((function() {
            var _len6, _o, _ref7, _results;

            _ref7 = ['start_pc', 'end_pc', 'handler_pc'];
            _results = [];
            for (_o = 0, _len6 = _ref7.length; _o < _len6; _o++) {
              item = _ref7[_o];
              _results.push(fixed_width(eh[item], 6));
            }
            return _results;
          })()).join('');
          if (eh.catch_type === '<any>') {
            rv += "   any\n";
          } else {
            rv += "   Class " + eh.catch_type.slice(1, -1) + "\n";
          }
        }
        rv += "\n";
      }
      rv += c.attributes.map((attr)=>(typeof attr.disassemblyOutput === "function" ? attr.disassemblyOutput() : void 0) || '').join('');
      if (m.exceptions != null) {
        rv += "  Exceptions:\n" + (print_excs(m.exceptions)) + "\n";
      }
    }
    rv += "\n";
  }
  rv += "}\n";
  return rv;
}
