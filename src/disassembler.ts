"use strict";
import util = require('./util');
import ClassData = require('./ClassData');
import ConstantPool = require('./ConstantPool');
import fs = require('fs');

export function javap(argv: string[], done_cb: (result: boolean) => void) {
  var fname: string;
  if (argv.length === 0) {
    process.stdout.write('Usage: javap class\n');
    done_cb(false);
  } else {
    fname = argv[0];
    if (fname.indexOf(".class") === -1) {
      if (fname.indexOf('.') !== -1) {
        // Convert foo.bar.Baz => foo/bar/Baz
        fname = util.descriptor2typestr(util.int_classname(fname));
      }
      fname += ".class";
    }
    fs.readFile(fname, function(err: any, data?: NodeBuffer): void {
      var rv: boolean = true;
      if (err) {
        rv = false;
        process.stderr.write("Error disassembling " + fname + ":\n"+err+"\n");
      } else {
        try {
          process.stdout.write(disassemble(data) + "\n");
        } catch(e) {
          rv = false;
        }
      }
      done_cb(rv);
    });
  }
}

function pad_left(value: string, padding: number): string {
  var zeroes = new Array(padding).join('0');
  return (zeroes + value).slice(-padding);
}

function access_string(access_flags: any): string {
  var ordered_flags = ['public', 'protected', 'private', 'static', 'final', 'native'];
  if (!access_flags["interface"]) {
    ordered_flags.push('abstract');
  }
  return ordered_flags.filter((flag: string) => access_flags[flag])
                      .map((flag: string) => flag + ' ')
                      .join('');
}

// format floats and doubles in the javap way
function format_decimal(val: number, type_char: string): string {
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
function format(entry: ConstantPool.ConstantPoolItem): string {
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

export function disassemble(buffer): string {
  var class_file = new ClassData.ReferenceClassData(buffer);
  return show_disassembly(make_dis(class_file));
}

function make_dis(class_file) {
  // standard class stuff
  var src_attr = class_file.get_attribute('SourceFile');
  var rva_attr = class_file.get_attribute('RuntimeVisibleAnnotations');
  var dis = {
    source_file: (src_attr != null) ? src_attr.filename : null,
    is_deprecated: class_file.get_attribute('Deprecated') != null,
    annotation_bytes: (rva_attr != null) ? rva_attr.raw_bytes : null,
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
  var pool = class_file.constant_pool;
  pool.each(function(idx: number, entry): void {
    dis.constant_pool.push({
      idx: idx,
      type: entry.type,
      value: format(entry),
      extra: util.format_extra_info(entry)
    });
  });
  // inner classes
  var inner_classes = class_file.get_attributes('InnerClasses');
  for (var i = 0; i < inner_classes.length; i++) {
    var icls = inner_classes[i];
    var icls_group = [];
    for (var j = 0; j < icls.classes.length; j++) {
      var cls = icls.classes[j];
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
  var fields = class_file.get_fields();
  for (var i = 0; i < fields.length; i++) {
    var f = fields[i];
    var sig = f.get_attribute('Signature');
    var field = {
      type: f.type,
      name: f.name,
      access_string: access_string(f.access_flags),
      signature_bytes: (sig != null) ? sig.raw_bytes : null,
      const_type: null,
      const_value: null
    };
    var const_attr = f.get_attribute('ConstantValue');
    if (const_attr != null) {
      var entry = pool.get(const_attr.ref);
      field.const_type = entry.type;
      field.const_value = (typeof entry.deref === "function" ? entry.deref() : format(entry));
    }
    dis.fields.push(field);
  }
  // methods
  var methods = class_file.get_methods();
  for (sig in methods) {
    var m = methods[sig];
    var exc_attr = m.get_attribute('Exceptions');
    var method = {
      access_string: access_string(m.access_flags),
      is_synchronized: m.access_flags.synchronized,
      return_type: (m.return_type != null) ? m.return_type : '',
      name: m.name,
      param_types: m.param_types,
      exceptions: (exc_attr != null) ? exc_attr.exceptions : null
    };
    if (!(m.access_flags["native"] || m.access_flags.abstract)) {
      var code = m.code;
      code.parse_code();
      method['code'] = {
        max_stack: code.max_stack,
        max_locals: code.max_locals,
        num_args: m.num_args,
        exception_handlers: code.exception_handlers,
        attributes: code.attrs
      };
      var ops = method['code'].opcodes = [];
      code.each_opcode((idx, oc) => ops.push({
          idx: idx, name: oc.name,
          annotation: oc.annotate(idx, pool)
        })
      );
    }
    dis.methods.push(method);
  }
  return dis;
}

function show_disassembly(dis): string {
  var ifaces = dis.interfaces.map(util.ext_classname).join(',');
  var name = util.ext_classname(dis.class_name);
  var rv = "Compiled from \"" + (dis.source_file != null ? dis.source_file : 'unknown') +
    "\"\n" + dis.access_string + dis.class_type + " " + name + " ";
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
  for (var i = 0, _len = dis.inner_classes.length; i < _len; i++) {
    var icls_group = dis.inner_classes[i];
    rv += "  InnerClass:\n";
    for (var j = 0, _len1 = icls_group.length; j < _len1; j++) {
      var icls = icls_group[j];
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
  for (var i = 0, _len2 = dis.constant_pool.length; i < _len2; i++) {
    var entry = dis.constant_pool[i];
    rv += "const #" + entry.idx + " = " + entry.type + "\t" + entry.value + ";" + entry.extra + "\n";
  }
  rv += "\n{\n";
  for (var i = 0, _len3 = dis.fields.length; i < _len3; i++) {
    var f = dis.fields[i];
    rv += "" + f.access_string + (pp_type(f.type)) + " " + f.name + ";\n";
    if (f.const_type != null) {
      rv += "  Constant value: " + f.const_type + " " + f.const_value + "\n";
    }
    if (f.signature_bytes != null) {
      var siglen = f.signature_bytes.length.toString(16);
      var sigbytes = ((function() {
        var _ref4 = f.signature_bytes;
        var _results: string[] = [];
        for (var _m = 0, _len4 = _ref4.length; _m < _len4; _m++) {
          var b = _ref4[_m];
          _results.push(pad_left(b.toString(16).toUpperCase(), 2));
        }
        return _results;
      })()).join(' ');
      rv += "  Signature: length = 0x" + siglen + "\n   " + sigbytes + "\n";
    }
    rv += "\n\n";
  }
  for (var _m = 0, _len4 = dis.methods.length; _m < _len4; _m++) {
    var m = dis.methods[_m];
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
      var c = m.code;
      rv += "  Code:\n   Stack=" + c.max_stack + ", Locals=" + c.max_locals + ", Args_size=" + c.num_args + "\n";
      rv += ((function() {
        var _results: string[] = [];
        for (var _n = 0, _len5 = c.opcodes.length; _n < _len5; _n++) {
          var o = c.opcodes[_n];
          _results.push("   " + o.idx + ":\t" + o.name + o.annotation + "\n");
        }
        return _results;
      })()).join('');
      var ehs = c.exception_handlers;
      if (ehs != null && ehs.length > 0) {
        rv += "  Exception table:\n   from   to  target type\n";
        for (var _n = 0, _len5 = ehs.length; _n < _len5; _n++) {
          var eh = ehs[_n];
          rv += ((function() {
            var _ref7 = ['start_pc', 'end_pc', 'handler_pc'];
            var _results: string[] = [];
            for (var _o = 0, _len6 = _ref7.length; _o < _len6; _o++) {
              var item = _ref7[_o];
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
