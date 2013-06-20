import gLong = module('./gLong');
import util = module('./util');
import exceptions = module('./exceptions');
var JavaException = exceptions.JavaException;
var ReturnException = exceptions.ReturnException;
import java_object = module('./java_object');
var JavaObject = java_object.JavaObject;
var JavaArray = java_object.JavaArray;
var JavaClassLoaderObject = java_object.JavaClassLoaderObject;

export class Opcode {
  public name: string
  public byte_count: number
  public execute: Function
  public orig_execute: Function
  public args: number[]

  constructor(name: string, byte_count?: number, execute?: Function) {
    this.name = name;
    this.byte_count = byte_count || 0;
    this.execute = execute || this._execute;
    // Backup so we can reset caching between JVM invocations.
    this.orig_execute = this.execute;
  }

  public take_args(code_array: any): void {
    this.args = [];
    for (var i = 0; i < this.byte_count; i++) {
      this.args.push(code_array.get_uint(1));
    }
  }

  // called to provide opcode annotations for disassembly and vtrace
  public annotate(): string {
    return '';
  }

  // Used to reset any cached information between JVM invocations.
  public reset_cache() {
    if (this.execute !== this.orig_execute) {
      return this.execute = this.orig_execute;
    }
  }

  // Increments the PC properly by the given offset.
  // Subtracts the byte_count and 1 before setting the offset so that the outer
  // loop can be simple.
  private inc_pc(rs: any, offset: number): void {
    rs.inc_pc(offset - 1 - this.byte_count);
  }

  private goto_pc(rs: any, new_pc: number): void {
    rs.goto_pc(new_pc - 1 - this.byte_count);
  }
}

export class FieldOpcode extends Opcode {
  public field_spec_ref: number
  public field_spec: any

  constructor(name: string, execute?: Function) {
    super(name, 2, execute);
  }

  public take_args(code_array: any, constant_pool: any): void {
    this.field_spec_ref = code_array.get_uint(2);
    this.field_spec = constant_pool.get(this.field_spec_ref).deref();
  }

  public annotate(idx: number, pool: any): string {
    var info = util.format_extra_info(pool.get(this.field_spec_ref);
    return "\t#" + this.field_spec_ref + ";" + info;
  }
}

export class ClassOpcode extends Opcode {
  public class_ref: number
  public class: any

  constructor(name: string, execute?: Function) {
    super(name, 2, execute);
  }

  public take_args(code_array: any, constant_pool: any): void {
    this.class_ref = code_array.get_uint(2);
    this['class'] = constant_pool.get(this.class_ref).deref();
  }

  public annotate(idx: number, pool: any): string {
    var info = util.format_extra_info(pool.get(this.class_ref);
    return "\t#" + this.class_ref + ";" + info;
  }
}

export class InvokeOpcode extends Opcode {
  public method_spec_ref: number
  public method_spec: any

  constructor(name: string) {
    super(name, 2);
  }

  public take_args(code_array: any, constant_pool: any): void {
    this.method_spec_ref = code_array.get_uint(2);
    this.method_spec = constant_pool.get(this.method_spec_ref).deref();
  }

  public annotate(idx: number, pool: any): string {
    var info = util.format_extra_info(pool.get(this.method_spec_ref);
    return "\t#" + this.method_spec_ref + ";" + info;
  }

  private _execute(rs: any): boolean {
    var cls = rs.get_class(this.method_spec["class"], true);
    if (cls != null) {
      var my_sf = rs.curr_frame();
      var m = cls.method_lookup(rs, this.method_spec.sig);
      if (m != null) {
        if (m.setup_stack(rs) != null) {
          my_sf.pc += 1 + this.byte_count;
          return false;
        }
      } else {
        var sig = this.method_spec.sig;
        rs.async_op(function(resume_cb, except_cb) {
          cls.resolve_method(rs, sig, (() => resume_cb(undefined, undefined, true, false)), except_cb);
        });
      }
    } else {
      // Initialize our class and rerun opcode.
      var classname = this.method_spec["class"];
      rs.async_op(function(resume_cb, except_cb) {
        rs.get_cl().initialize_class(rs, classname, (() => resume_cb(undefined, undefined, true, false)), except_cb);
      });
    }
  }
}

function get_param_word_size(signature: string): number {
  var state = 'name';
  var size = 0;
  for (var i = 0; i < signature.length; i++) {
    var c = signature[i];
    switch (state) {
      case 'name':
        if (c === '(') state = 'type';
        break;
      case 'type':
        if (c === ')') return size;
        if (c === 'J' || c === 'D') {
          size += 2;
        } else {
          ++size;
        }
        if (c === 'L') {
          state = 'class';
        } else if (c === '[') {
          state = 'array';
        }
        break;
      case 'class':
        if (c === ';') state = 'type';
        break;
      case 'array':
        if (c === 'L') {
          state = 'class';
        } else if (c !== '[') {
          state = 'type';
        }
    }
  }
}

export class DynInvokeOpcode extends InvokeOpcode {
  public count: number
  private cache: any

  public take_args(code_array: any, constant_pool: any): void {
    super.take_args(code_array, constant_pool);
    // invokeinterface has two redundant bytes
    if (this.name === 'invokeinterface') {
      this.count = code_array.get_uint(1);
      code_array.skip(1);
      this.byte_count += 2;
    } else {
      this.count = 1 + get_param_word_size(this.method_spec.sig);
    }
    this.cache = Object.create(null);
  };

  public annotate(idx: number, pool: any): string {
    var info = util.format_extra_info(pool.get(this.method_spec_ref);
    var extra = '';
    if (this.name === 'invokeinterface')
      extra = ',  ' + this.count;
    return "\t#" + this.method_spec_ref + extra + ";" + info;
  }

  private _execute(rs: any): boolean {
    var cls = rs.get_class(this.method_spec["class"], true);
    if (cls != null) {
      var my_sf = rs.curr_frame();
      var stack = my_sf.stack;
      var obj = stack[stack.length - this.count];
      var cls_obj = rs.check_null(obj).cls;
      var m = cls_obj.method_lookup(rs, this.method_spec.sig);
      if (m != null) {
        if (m.setup_stack(rs) != null) {
          my_sf.pc += 1 + this.byte_count;
          return false;
        }
      } else {
        var sig = this.method_spec.sig;
        rs.async_op(function(resume_cb, except_cb) {
          cls_obj.resolve_method(rs, sig, (()=>resume_cb(undefined, undefined, true, false)), except_cb);
        });
      }
    } else {
      // Initialize our class and rerun opcode.
      var classname = this.method_spec["class"];
      rs.async_op(function(resume_cb, except_cb) {
        rs.get_cl().initialize_class(rs, classname, (()=>resume_cb(undefined, undefined, true, false)), except_cb);
      });
    }
  }
}

export class LoadConstantOpcode extends Opcode {
  public constant_ref: number
  public constant: any
  public str_constant: any

  public take_args(code_array: any, constant_pool: any): void {
    this.constant_ref = code_array.get_uint(this.byte_count);
    this.constant = constant_pool.get(this.constant_ref);
    var ctype = this.constant.type;
    if (ctype === 'String' || ctype === 'class') {
      this.str_constant = constant_pool.get(this.constant.value);
    }
  }

  public annotate(idx: number, pool: any): string {
    var ctype = this.constant.type;
    var anno = "\t#" + this.constant_ref + ";\t// " + this.constant.type + " ";
    if (ctype === 'String' || ctype === 'class')
      return anno + util.escape_whitespace(this.constant.deref())
    return anno + this.constant.value;
  }

  private _execute(rs: any): void {
    switch (this.constant.type) {
      case 'String':
        rs.push(rs.init_string(this.str_constant.value, true));
        break;
      case 'class':
        // XXX: Make this rewrite itself to cache the jclass object.
        // Fetch the jclass object and push it on to the stack. Do not rerun
        // this opcode.
        var cdesc = util.typestr2descriptor(this.str_constant.value);
        rs.async_op(function(resume_cb, except_cb) {
          rs.get_cl().resolve_class(rs, cdesc, ((cls)=>resume_cb(cls.get_class_object(rs), undefined, true)), except_cb);
        });
        break;
      default:
        if (this.name === 'ldc2_w')
          rs.push2(this.constant.value, null);
        else
          rs.push(this.constant.value);
    }
  }
}

export class BranchOpcode extends Opcode {
  public offset: number

  constructor(name: string, execute?: Function) {
    super(name, 2, execute);
  }

  public take_args(code_array: any, constant_pool: any): void {
    this.offset = code_array.get_int(this.byte_count);
  }

  public annotate(idx: number, pool: any): string {
    return "\t" + (idx + this.offset);
  }

  private jsr(rs: any): void {
    rs.push(rs.curr_pc() + this.byte_count + 1);
    this.inc_pc(rs, this.offset);
  }
}

export class UnaryBranchOpcode extends BranchOpcode {
  private cmp: Function  // TODO: specialize this type

  constructor(name: string, cmp: Function) {
    super(name);
    this.cmp = cmp;
  }

  private _execute(rs: any): void {
    if (this.cmp(rs.pop())) {
      this.inc_pc(rs, this.offset);
    }
  }
}

export class BinaryBranchOpcode extends BranchOpcode {
  private cmp: Function  // TODO: specialize this type

  constructor(name: string, cmp: Function) {
    super(name);
    this.cmp = cmp;
  }

  private _execute(rs: any): void {
    var v2 = rs.pop();
    var v1 = rs.pop();
    if (this.cmp(v1, v2)) {
      this.inc_pc(rs, this.offset);
    }
  }
}

export class PushOpcode extends Opcode {
  public value: number

  public take_args(code_array: any, constant_pool: any): void {
    this.value = code_array.get_int(this.byte_count);
  }

  public annotate(idx: number, pool: any): string {
    return "\t" + this.value;
  }

  private _execute(rs: any): void {
    rs.push(this.value);
  }
}

export class IIncOpcode extends Opcode {
  public index: number
  public const: number

  public take_args(code_array: any, constant_pool: any, wide?: boolean): void {
    var arg_size;
    if (wide) {
      this.name += "_w";
      arg_size = 2;
      this.byte_count = 5;
    } else {
      arg_size = 1;
      this.byte_count = 2;
    }
    this.index = code_array.get_uint(arg_size);
    this["const"] = code_array.get_int(arg_size);
  }

  public annotate(idx: number, pool: any): string {
    return "\t" + this.index + ", " + this["const"];
  }

  private _execute(rs: any): void {
    var v = rs.cl(this.index) + this["const"];
    rs.put_cl(this.index, v | 0);
  }
}

// CURRENT PROGRESS ENDS HERE

  root.LoadOpcode = (function(_super) {
    __extends(LoadOpcode, _super);

    function LoadOpcode(name, params) {
      var _ref4;

      if (params == null) {
        params = {};
      }
      if ((_ref4 = params.execute) == null) {
        params.execute = name.match(/[ld]load/) ? function(rs) {
          return rs.push2(rs.cl(this.var_num), null);
        } : function(rs) {
          return rs.push(rs.cl(this.var_num));
        };
      }
      LoadOpcode.__super__.constructor.call(this, name, params);
    }

    LoadOpcode.prototype.take_args = function(code_array) {
      return this.var_num = parseInt(this.name[6]);
    };

    return LoadOpcode;

  })(root.Opcode);

  root.LoadVarOpcode = (function(_super) {
    __extends(LoadVarOpcode, _super);

    function LoadVarOpcode() {
      _ref4 = LoadVarOpcode.__super__.constructor.apply(this, arguments);
      return _ref4;
    }

    LoadVarOpcode.prototype.take_args = function(code_array, constant_pool, wide) {
      this.wide = wide != null ? wide : false;
      if (this.wide) {
        this.name += "_w";
        this.byte_count = 3;
        return this.var_num = code_array.get_uint(2);
      } else {
        this.byte_count = 1;
        return this.var_num = code_array.get_uint(1);
      }
    };

    LoadVarOpcode.prototype.annotate = function(idx, pool) {
      return "\t" + this.var_num;
    };

    return LoadVarOpcode;

  })(root.LoadOpcode);

  root.StoreOpcode = (function(_super) {
    __extends(StoreOpcode, _super);

    function StoreOpcode(name, params) {
      var _ref5;

      if (params == null) {
        params = {};
      }
      if ((_ref5 = params.execute) == null) {
        params.execute = name.match(/[ld]store/) ? function(rs) {
          return rs.put_cl2(this.var_num, rs.pop2());
        } : function(rs) {
          return rs.put_cl(this.var_num, rs.pop());
        };
      }
      StoreOpcode.__super__.constructor.call(this, name, params);
    }

    StoreOpcode.prototype.take_args = function(code_array) {
      return this.var_num = parseInt(this.name[7]);
    };

    return StoreOpcode;

  })(root.Opcode);

  root.StoreVarOpcode = (function(_super) {
    __extends(StoreVarOpcode, _super);

    function StoreVarOpcode(name, params) {
      StoreVarOpcode.__super__.constructor.call(this, name, params);
    }

    StoreVarOpcode.prototype.take_args = function(code_array, constant_pool, wide) {
      this.wide = wide != null ? wide : false;
      if (this.wide) {
        this.name += "_w";
        this.byte_count = 3;
        return this.var_num = code_array.get_uint(2);
      } else {
        this.byte_count = 1;
        return this.var_num = code_array.get_uint(1);
      }
    };

    StoreVarOpcode.prototype.annotate = function(idx, pool) {
      return "\t" + this.var_num;
    };

    return StoreVarOpcode;

  })(root.StoreOpcode);

  root.SwitchOpcode = (function(_super) {
    __extends(SwitchOpcode, _super);

    function SwitchOpcode(name, params) {
      SwitchOpcode.__super__.constructor.call(this, name, params);
      this.byte_count = null;
    }

    SwitchOpcode.prototype.annotate = function(idx, pool) {
      var match, offset;

      return "{\n" + ((function() {
        var _ref5, _results;

        _ref5 = this.offsets;
        _results = [];
        for (match in _ref5) {
          offset = _ref5[match];
          _results.push("\t\t" + match + ": " + (idx + offset) + ";\n");
        }
        return _results;
      }).call(this)).join('') + ("\t\tdefault: " + (idx + this._default) + " }");
    };

    SwitchOpcode.prototype.execute = function(rs) {
      var key;

      key = rs.pop();
      if (key in this.offsets) {
        return this.inc_pc(rs, this.offsets[key]);
      } else {
        return this.inc_pc(rs, this._default);
      }
    };

    return SwitchOpcode;

  })(root.BranchOpcode);

  root.LookupSwitchOpcode = (function(_super) {
    __extends(LookupSwitchOpcode, _super);

    function LookupSwitchOpcode() {
      _ref5 = LookupSwitchOpcode.__super__.constructor.apply(this, arguments);
      return _ref5;
    }

    LookupSwitchOpcode.prototype.take_args = function(code_array, constant_pool) {
      var i, match, offset, padding_size, _i, _ref6;

      padding_size = (4 - code_array.pos() % 4) % 4;
      code_array.skip(padding_size);
      this._default = code_array.get_int(4);
      this.npairs = code_array.get_int(4);
      this.offsets = {};
      for (i = _i = 0, _ref6 = this.npairs; _i < _ref6; i = _i += 1) {
        match = code_array.get_int(4);
        offset = code_array.get_int(4);
        this.offsets[match] = offset;
      }
      return this.byte_count = padding_size + 8 * (this.npairs + 1);
    };

    return LookupSwitchOpcode;

  })(root.SwitchOpcode);

  root.TableSwitchOpcode = (function(_super) {
    __extends(TableSwitchOpcode, _super);

    function TableSwitchOpcode() {
      _ref6 = TableSwitchOpcode.__super__.constructor.apply(this, arguments);
      return _ref6;
    }

    TableSwitchOpcode.prototype.take_args = function(code_array, constant_pool) {
      var i, offset, padding_size, total_offsets, _i;

      padding_size = (4 - code_array.pos() % 4) % 4;
      code_array.skip(padding_size);
      this._default = code_array.get_int(4);
      this.low = code_array.get_int(4);
      this.high = code_array.get_int(4);
      this.offsets = {};
      total_offsets = this.high - this.low + 1;
      for (i = _i = 0; _i < total_offsets; i = _i += 1) {
        offset = code_array.get_int(4);
        this.offsets[this.low + i] = offset;
      }
      return this.byte_count = padding_size + 12 + 4 * total_offsets;
    };

    return TableSwitchOpcode;

  })(root.SwitchOpcode);

  root.NewArrayOpcode = (function(_super) {
    __extends(NewArrayOpcode, _super);

    function NewArrayOpcode(name, params) {
      NewArrayOpcode.__super__.constructor.call(this, name, params);
      this.byte_count = 1;
      this.arr_types = {
        4: 'Z',
        5: 'C',
        6: 'F',
        7: 'D',
        8: 'B',
        9: 'S',
        10: 'I',
        11: 'J'
      };
    }

    NewArrayOpcode.prototype.take_args = function(code_array, constant_pool) {
      var type_code;

      type_code = code_array.get_uint(1);
      return this.element_type = this.arr_types[type_code];
    };

    NewArrayOpcode.prototype.annotate = function(idx, pool) {
      return "\t" + util.internal2external[this.element_type];
    };

    return NewArrayOpcode;

  })(root.Opcode);

  root.MultiArrayOpcode = (function(_super) {
    __extends(MultiArrayOpcode, _super);

    function MultiArrayOpcode(name, params) {
      var _ref7;

      if (params == null) {
        params = {};
      }
      if ((_ref7 = params.byte_count) == null) {
        params.byte_count = 3;
      }
      MultiArrayOpcode.__super__.constructor.call(this, name, params);
    }

    MultiArrayOpcode.prototype.take_args = function(code_array, constant_pool) {
      this.class_ref = code_array.get_uint(2);
      this["class"] = constant_pool.get(this.class_ref).deref();
      return this.dim = code_array.get_uint(1);
    };

    MultiArrayOpcode.prototype.annotate = function(idx, pool) {
      return "\t#" + this.class_ref + ",  " + this.dim + ";";
    };

    MultiArrayOpcode.prototype.execute = function(rs) {
      var cls, new_execute,
        _this = this;

      cls = rs.get_class(this["class"], true);
      if (cls == null) {
        rs.async_op(function(resume_cb, except_cb) {
          return rs.get_cl().initialize_class(rs, _this["class"], (function(class_file) {
            return resume_cb(void 0, void 0, true, false);
          }), except_cb);
        });
        return;
      }
      new_execute = function(rs) {
        var arr_types, counts, d, default_val, init_arr,
          _this = this;

        counts = rs.curr_frame().stack.splice(-this.dim, this.dim);
        default_val = util.initial_value(this["class"].slice(this.dim));
        arr_types = (function() {
          var _i, _ref7, _results;

          _results = [];
          for (d = _i = 0, _ref7 = this.dim; _i < _ref7; d = _i += 1) {
            _results.push(this["class"].slice(d));
          }
          return _results;
        }).call(this);
        init_arr = function(curr_dim) {
          var array, i, len, type, _i, _j;

          len = counts[curr_dim];
          if (len < 0) {
            rs.java_throw(rs.get_bs_class('Ljava/lang/NegativeArraySizeException;'), "Tried to init dimension " + curr_dim + " of a " + _this.dim + " dimensional " + (_this["class"].toString()) + " array with length " + len);
          }
          type = arr_types[curr_dim];
          array = new Array(len);
          if (curr_dim + 1 === _this.dim) {
            for (i = _i = 0; _i < len; i = _i += 1) {
              array[i] = default_val;
            }
          } else {
            for (i = _j = 0; _j < len; i = _j += 1) {
              array[i] = init_arr(curr_dim + 1);
            }
          }
          return new JavaArray(rs, rs.get_bs_class(type), array);
        };
        return rs.push(init_arr(0));
      };
      new_execute.call(this, rs);
      this.execute = new_execute;
    };

    return MultiArrayOpcode;

  })(root.Opcode);

  root.ArrayLoadOpcode = (function(_super) {
    __extends(ArrayLoadOpcode, _super);

    function ArrayLoadOpcode() {
      _ref7 = ArrayLoadOpcode.__super__.constructor.apply(this, arguments);
      return _ref7;
    }

    ArrayLoadOpcode.prototype.execute = function(rs) {
      var array, idx, obj, _ref8;

      idx = rs.pop();
      obj = rs.check_null(rs.pop());
      array = obj.array;
      if (!((0 <= idx && idx < array.length))) {
        rs.java_throw(rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;'), "" + idx + " not in length " + array.length + " array of type " + (obj.cls.get_type()));
      }
      rs.push(array[idx]);
      if ((_ref8 = this.name[0]) === 'l' || _ref8 === 'd') {
        rs.push(null);
      }
    };

    return ArrayLoadOpcode;

  })(root.Opcode);

  root.ArrayStoreOpcode = (function(_super) {
    __extends(ArrayStoreOpcode, _super);

    function ArrayStoreOpcode() {
      _ref8 = ArrayStoreOpcode.__super__.constructor.apply(this, arguments);
      return _ref8;
    }

    ArrayStoreOpcode.prototype.execute = function(rs) {
      var array, idx, obj, value, _ref9;

      value = (_ref9 = this.name[0]) === 'l' || _ref9 === 'd' ? rs.pop2() : rs.pop();
      idx = rs.pop();
      obj = rs.check_null(rs.pop());
      array = obj.array;
      if (!((0 <= idx && idx < array.length))) {
        rs.java_throw(rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;'), "" + idx + " not in length " + array.length + " array of type " + (obj.cls.get_type()));
      }
      array[idx] = value;
    };

    return ArrayStoreOpcode;

  })(root.Opcode);

  root.ReturnOpcode = (function(_super) {
    __extends(ReturnOpcode, _super);

    function ReturnOpcode(name, params) {
      var _ref9;

      if (params == null) {
        params = {};
      }
      if ((_ref9 = params.execute) == null) {
        params.execute = name.match(/[ld]return/) ? function(rs) {
          var cf;

          cf = rs.meta_stack().pop();
          rs.push2(cf.stack[0], null);
          return false;
        } : name === 'return' ? function(rs) {
          rs.meta_stack().pop();
          return false;
        } : function(rs) {
          var cf;

          cf = rs.meta_stack().pop();
          rs.push(cf.stack[0]);
          return false;
        };
      }
      ReturnOpcode.__super__.constructor.call(this, name, params);
    }

    return ReturnOpcode;

  })(root.Opcode);

  root.monitorenter = function(rs, monitor, inst) {
    var locked_thread;

    if ((locked_thread = rs.lock_refs[monitor]) != null) {
      if (locked_thread === rs.curr_thread) {
        rs.lock_counts[monitor]++;
      } else {
        if (inst != null) {
          inst.inc_pc(rs, 1);
        } else {
          rs.inc_pc(1);
        }
        rs.meta_stack().push({});
        rs.wait(monitor);
        return false;
      }
    } else {
      rs.lock_refs[monitor] = rs.curr_thread;
      rs.lock_counts[monitor] = 1;
    }
    return true;
  };

  root.monitorexit = function(rs, monitor) {
    var locked_thread;

    if ((locked_thread = rs.lock_refs[monitor]) == null) {
      return;
    }
    if (locked_thread === rs.curr_thread) {
      rs.lock_counts[monitor]--;
      if (rs.lock_counts[monitor] === 0) {
        delete rs.lock_refs[monitor];
        if (rs.waiting_threads[monitor] != null) {
          return rs.waiting_threads[monitor] = [];
        }
      }
    } else {
      return rs.java_throw(rs.get_bs_class('Ljava/lang/IllegalMonitorStateException;'), "Tried to monitorexit on lock not held by current thread");
    }
  };

// These objects are used as prototypes for the parsed instructions in the classfile.
export var opcodes = {
  0:  new Opcode('nop', 0, (()=>)),
  1:  new Opcode('aconst_null', 0, ((rs)=>rs.push(null))),
  2:  new Opcode('iconst_m1', 0, ((rs)=>rs.push(-1))),
  3:  new Opcode('iconst_0', 0, ((rs)=>rs.push(0))),
  4:  new Opcode('iconst_1', 0, ((rs)=>rs.push(1))),
  5:  new Opcode('iconst_2', 0, ((rs)=>rs.push(2))),
  6:  new Opcode('iconst_3', 0, ((rs)=>rs.push(3))),
  7:  new Opcode('iconst_4', 0, ((rs)=>rs.push(4))),
  8:  new Opcode('iconst_5', 0, ((rs)=>rs.push(5))),
  9:  new Opcode('lconst_0', 0, ((rs)=>rs.push2(gLong.ZERO, null))),
  10: new Opcode('lconst_1', 0, ((rs)=>rs.push2(gLong.ONE, null))),
  11: new Opcode('fconst_0', 0, ((rs)=>rs.push(0))),
  12: new Opcode('fconst_1', 0, ((rs)=>rs.push(1))),
  13: new Opcode('fconst_2', 0, ((rs)=>rs.push(2))),
  14: new Opcode('dconst_0', 0, ((rs)=>rs.push2(0, null))),
  15: new Opcode('dconst_1', 0, ((rs)=>rs.push2(1, null))),
  16: new PushOpcode('bipush', 1),
  17: new PushOpcode('sipush', 2),
  18: new LoadConstantOpcode('ldc', 1),
  19: new LoadConstantOpcode('ldc_w', 2),
  20: new LoadConstantOpcode('ldc2_w', 2),
  21: new LoadVarOpcode('iload'),
  22: new LoadVarOpcode('lload'),
  23: new LoadVarOpcode('fload'),
  24: new LoadVarOpcode('dload'),
  25: new LoadVarOpcode('aload'),
  26: new LoadOpcode('iload_0'),
  27: new LoadOpcode('iload_1'),
  28: new LoadOpcode('iload_2'),
  29: new LoadOpcode('iload_3'),
  30: new LoadOpcode('lload_0'),
  31: new LoadOpcode('lload_1'),
  32: new LoadOpcode('lload_2'),
  33: new LoadOpcode('lload_3'),
  34: new LoadOpcode('fload_0'),
  35: new LoadOpcode('fload_1'),
  36: new LoadOpcode('fload_2'),
  37: new LoadOpcode('fload_3'),
  38: new LoadOpcode('dload_0'),
  39: new LoadOpcode('dload_1'),
  40: new LoadOpcode('dload_2'),
  41: new LoadOpcode('dload_3'),
  42: new LoadOpcode('aload_0'),
  43: new LoadOpcode('aload_1'),
  44: new LoadOpcode('aload_2'),
  45: new LoadOpcode('aload_3'),
  46: new ArrayLoadOpcode('iaload'),
  47: new ArrayLoadOpcode('laload'),
  48: new ArrayLoadOpcode('faload'),
  49: new ArrayLoadOpcode('daload'),
  50: new ArrayLoadOpcode('aaload'),
  51: new ArrayLoadOpcode('baload'),
  52: new ArrayLoadOpcode('caload'),
  53: new ArrayLoadOpcode('saload'),

  // OPCODE CONVERSION PROGRESS ENDS HERE

  54: new StoreVarOpcode('istore', {
    execute: function(rs) {
      return rs.put_cl(this.var_num, rs.pop());
    }
  }),
  55: new StoreVarOpcode('lstore', {
    execute: function(rs) {
      return rs.put_cl2(this.var_num, rs.pop2());
    }
  }),
  56: new StoreVarOpcode('fstore', {
    execute: function(rs) {
      return rs.put_cl(this.var_num, rs.pop());
    }
  }),
  57: new StoreVarOpcode('dstore', {
    execute: function(rs) {
      return rs.put_cl2(this.var_num, rs.pop2());
    }
  }),
  58: new StoreVarOpcode('astore', {
    execute: function(rs) {
      return rs.put_cl(this.var_num, rs.pop());
    }
  }),
  59: new StoreOpcode('istore_0'),
  60: new StoreOpcode('istore_1'),
  61: new StoreOpcode('istore_2'),
  62: new StoreOpcode('istore_3'),
  63: new StoreOpcode('lstore_0'),
  64: new StoreOpcode('lstore_1'),
  65: new StoreOpcode('lstore_2'),
  66: new StoreOpcode('lstore_3'),
  67: new StoreOpcode('fstore_0'),
  68: new StoreOpcode('fstore_1'),
  69: new StoreOpcode('fstore_2'),
  70: new StoreOpcode('fstore_3'),
  71: new StoreOpcode('dstore_0'),
  72: new StoreOpcode('dstore_1'),
  73: new StoreOpcode('dstore_2'),
  74: new StoreOpcode('dstore_3'),
  75: new StoreOpcode('astore_0'),
  76: new StoreOpcode('astore_1'),
  77: new StoreOpcode('astore_2'),
  78: new StoreOpcode('astore_3'),
  79: new ArrayStoreOpcode('iastore'),
  80: new ArrayStoreOpcode('lastore'),
  81: new ArrayStoreOpcode('fastore'),
  82: new ArrayStoreOpcode('dastore'),
  83: new ArrayStoreOpcode('aastore'),
  84: new ArrayStoreOpcode('bastore'),
  85: new ArrayStoreOpcode('castore'),
  86: new ArrayStoreOpcode('sastore'),
  87: new Opcode('pop', {
    execute: function(rs) {
      return rs.pop();
    }
  }),
  88: new Opcode('pop2', {
    execute: function(rs) {
      return rs.pop2();
    }
  }),
  89: new Opcode('dup', {
    execute: function(rs) {
      var v;

      v = rs.pop();
      return rs.push2(v, v);
    }
  }),
  90: new Opcode('dup_x1', {
    execute: function(rs) {
      var v1, v2;

      v1 = rs.pop();
      v2 = rs.pop();
      return rs.push_array([v1, v2, v1]);
    }
  }),
  91: new Opcode('dup_x2', {
    execute: function(rs) {
      var v1, v2, v3, _ref9;

      _ref9 = [rs.pop(), rs.pop(), rs.pop()], v1 = _ref9[0], v2 = _ref9[1], v3 = _ref9[2];
      return rs.push_array([v1, v3, v2, v1]);
    }
  }),
  92: new Opcode('dup2', {
    execute: function(rs) {
      var v1, v2;

      v1 = rs.pop();
      v2 = rs.pop();
      return rs.push_array([v2, v1, v2, v1]);
    }
  }),
  93: new Opcode('dup2_x1', {
    execute: function(rs) {
      var v1, v2, v3, _ref9;

      _ref9 = [rs.pop(), rs.pop(), rs.pop()], v1 = _ref9[0], v2 = _ref9[1], v3 = _ref9[2];
      return rs.push_array([v2, v1, v3, v2, v1]);
    }
  }),
  94: new Opcode('dup2_x2', {
    execute: function(rs) {
      var v1, v2, v3, v4, _ref9;

      _ref9 = [rs.pop(), rs.pop(), rs.pop(), rs.pop()], v1 = _ref9[0], v2 = _ref9[1], v3 = _ref9[2], v4 = _ref9[3];
      return rs.push_array([v2, v1, v4, v3, v2, v1]);
    }
  }),
  95: new Opcode('swap', {
    execute: function(rs) {
      var v1, v2;

      v2 = rs.pop();
      v1 = rs.pop();
      return rs.push2(v2, v1);
    }
  }),
  96: new Opcode('iadd', {
    execute: function(rs) {
      return rs.push((rs.pop() + rs.pop()) | 0);
    }
  }),
  97: new Opcode('ladd', {
    execute: function(rs) {
      return rs.push2(rs.pop2().add(rs.pop2()), null);
    }
  }),
  98: new Opcode('fadd', {
    execute: function(rs) {
      return rs.push(util.wrap_float(rs.pop() + rs.pop()));
    }
  }),
  99: new Opcode('dadd', {
    execute: function(rs) {
      return rs.push2(rs.pop2() + rs.pop2(), null);
    }
  }),
  100: new Opcode('isub', {
    execute: function(rs) {
      return rs.push((-rs.pop() + rs.pop()) | 0);
    }
  }),
  101: new Opcode('lsub', {
    execute: function(rs) {
      return rs.push2(rs.pop2().negate().add(rs.pop2()), null);
    }
  }),
  102: new Opcode('fsub', {
    execute: function(rs) {
      return rs.push(util.wrap_float(-rs.pop() + rs.pop()));
    }
  }),
  103: new Opcode('dsub', {
    execute: function(rs) {
      return rs.push2(-rs.pop2() + rs.pop2(), null);
    }
  }),
  104: new Opcode('imul', {
    execute: function(rs) {
      return rs.push(Math.imul(rs.pop(), rs.pop()));
    }
  }),
  105: new Opcode('lmul', {
    execute: function(rs) {
      return rs.push2(rs.pop2().multiply(rs.pop2()), null);
    }
  }),
  106: new Opcode('fmul', {
    execute: function(rs) {
      return rs.push(util.wrap_float(rs.pop() * rs.pop()));
    }
  }),
  107: new Opcode('dmul', {
    execute: function(rs) {
      return rs.push2(rs.pop2() * rs.pop2(), null);
    }
  }),
  108: new Opcode('idiv', {
    execute: function(rs) {
      var v;

      v = rs.pop();
      return rs.push(util.int_div(rs, rs.pop(), v));
    }
  }),
  109: new Opcode('ldiv', {
    execute: function(rs) {
      var v;

      v = rs.pop2();
      return rs.push2(util.long_div(rs, rs.pop2(), v), null);
    }
  }),
  110: new Opcode('fdiv', {
    execute: function(rs) {
      var a;

      a = rs.pop();
      return rs.push(util.wrap_float(rs.pop() / a));
    }
  }),
  111: new Opcode('ddiv', {
    execute: function(rs) {
      var v;

      v = rs.pop2();
      return rs.push2(rs.pop2() / v, null);
    }
  }),
  112: new Opcode('irem', {
    execute: function(rs) {
      var v2;

      v2 = rs.pop();
      return rs.push(util.int_mod(rs, rs.pop(), v2));
    }
  }),
  113: new Opcode('lrem', {
    execute: function(rs) {
      var v2;

      v2 = rs.pop2();
      return rs.push2(util.long_mod(rs, rs.pop2(), v2), null);
    }
  }),
  114: new Opcode('frem', {
    execute: function(rs) {
      var b;

      b = rs.pop();
      return rs.push(rs.pop() % b);
    }
  }),
  115: new Opcode('drem', {
    execute: function(rs) {
      var v2;

      v2 = rs.pop2();
      return rs.push2(rs.pop2() % v2, null);
    }
  }),
  116: new Opcode('ineg', {
    execute: function(rs) {
      return rs.push(-rs.pop() | 0);
    }
  }),
  117: new Opcode('lneg', {
    execute: function(rs) {
      return rs.push2(rs.pop2().negate(), null);
    }
  }),
  118: new Opcode('fneg', {
    execute: function(rs) {
      return rs.push(-rs.pop());
    }
  }),
  119: new Opcode('dneg', {
    execute: function(rs) {
      return rs.push2(-rs.pop2(), null);
    }
  }),
  120: new Opcode('ishl', {
    execute: function(rs) {
      var s;

      s = rs.pop();
      return rs.push(rs.pop() << s);
    }
  }),
  121: new Opcode('lshl', {
    execute: function(rs) {
      var s;

      s = rs.pop();
      return rs.push2(rs.pop2().shiftLeft(gLong.fromInt(s)), null);
    }
  }),
  122: new Opcode('ishr', {
    execute: function(rs) {
      var s;

      s = rs.pop();
      return rs.push(rs.pop() >> s);
    }
  }),
  123: new Opcode('lshr', {
    execute: function(rs) {
      var s;

      s = rs.pop();
      return rs.push2(rs.pop2().shiftRight(gLong.fromInt(s)), null);
    }
  }),
  124: new Opcode('iushr', {
    execute: function(rs) {
      var s;

      s = rs.pop();
      return rs.push(rs.pop() >>> s);
    }
  }),
  125: new Opcode('lushr', {
    execute: function(rs) {
      var s;

      s = rs.pop();
      return rs.push2(rs.pop2().shiftRightUnsigned(gLong.fromInt(s)), null);
    }
  }),
  126: new Opcode('iand', {
    execute: function(rs) {
      return rs.push(rs.pop() & rs.pop());
    }
  }),
  127: new Opcode('land', {
    execute: function(rs) {
      return rs.push2(rs.pop2().and(rs.pop2()), null);
    }
  }),
  128: new Opcode('ior', {
    execute: function(rs) {
      return rs.push(rs.pop() | rs.pop());
    }
  }),
  129: new Opcode('lor', {
    execute: function(rs) {
      return rs.push2(rs.pop2().or(rs.pop2()), null);
    }
  }),
  130: new Opcode('ixor', {
    execute: function(rs) {
      return rs.push(rs.pop() ^ rs.pop());
    }
  }),
  131: new Opcode('lxor', {
    execute: function(rs) {
      return rs.push2(rs.pop2().xor(rs.pop2()), null);
    }
  }),
  132: new IIncOpcode('iinc'),
  133: new Opcode('i2l', {
    execute: function(rs) {
      return rs.push2(gLong.fromInt(rs.pop()), null);
    }
  }),
  134: new Opcode('i2f', {
    execute: function(rs) {}
  }),
  135: new Opcode('i2d', {
    execute: function(rs) {
      return rs.push(null);
    }
  }),
  136: new Opcode('l2i', {
    execute: function(rs) {
      return rs.push(rs.pop2().toInt());
    }
  }),
  137: new Opcode('l2f', {
    execute: function(rs) {
      return rs.push(rs.pop2().toNumber());
    }
  }),
  138: new Opcode('l2d', {
    execute: function(rs) {
      return rs.push2(rs.pop2().toNumber(), null);
    }
  }),
  139: new Opcode('f2i', {
    execute: function(rs) {
      return rs.push(util.float2int(rs.pop()));
    }
  }),
  140: new Opcode('f2l', {
    execute: function(rs) {
      return rs.push2(gLong.fromNumber(rs.pop()), null);
    }
  }),
  141: new Opcode('f2d', {
    execute: function(rs) {
      return rs.push(null);
    }
  }),
  142: new Opcode('d2i', {
    execute: function(rs) {
      return rs.push(util.float2int(rs.pop2()));
    }
  }),
  143: new Opcode('d2l', {
    execute: function(rs) {
      var d_val;

      d_val = rs.pop2();
      if (d_val === Number.POSITIVE_INFINITY) {
        return rs.push2(gLong.MAX_VALUE, null);
      } else if (d_val === Number.NEGATIVE_INFINITY) {
        return rs.push2(gLong.MIN_VALUE, null);
      } else {
        return rs.push2(gLong.fromNumber(d_val), null);
      }
    }
  }),
  144: new Opcode('d2f', {
    execute: function(rs) {
      return rs.push(util.wrap_float(rs.pop2()));
    }
  }),
  145: new Opcode('i2b', {
    execute: function(rs) {
      return rs.push((rs.pop() << 24) >> 24);
    }
  }),
  146: new Opcode('i2c', {
    execute: function(rs) {
      return rs.push(rs.pop() & 0xFFFF);
    }
  }),
  147: new Opcode('i2s', {
    execute: function(rs) {
      return rs.push((rs.pop() << 16) >> 16);
    }
  }),
  148: new Opcode('lcmp', {
    execute: function(rs) {
      var v2;

      v2 = rs.pop2();
      return rs.push(rs.pop2().compare(v2));
    }
  }),
  149: new Opcode('fcmpl', {
    execute: function(rs) {
      var v2, _ref9;

      v2 = rs.pop();
      return rs.push((_ref9 = util.cmp(rs.pop(), v2)) != null ? _ref9 : -1);
    }
  }),
  150: new Opcode('fcmpg', {
    execute: function(rs) {
      var v2, _ref9;

      v2 = rs.pop();
      return rs.push((_ref9 = util.cmp(rs.pop(), v2)) != null ? _ref9 : 1);
    }
  }),
  151: new Opcode('dcmpl', {
    execute: function(rs) {
      var v2, _ref9;

      v2 = rs.pop2();
      return rs.push((_ref9 = util.cmp(rs.pop2(), v2)) != null ? _ref9 : -1);
    }
  }),
  152: new Opcode('dcmpg', {
    execute: function(rs) {
      var v2, _ref9;

      v2 = rs.pop2();
      return rs.push((_ref9 = util.cmp(rs.pop2(), v2)) != null ? _ref9 : 1);
    }
  }),
  153: new UnaryBranchOpcode('ifeq', {
    cmp: function(v) {
      return v === 0;
    }
  }),
  154: new UnaryBranchOpcode('ifne', {
    cmp: function(v) {
      return v !== 0;
    }
  }),
  155: new UnaryBranchOpcode('iflt', {
    cmp: function(v) {
      return v < 0;
    }
  }),
  156: new UnaryBranchOpcode('ifge', {
    cmp: function(v) {
      return v >= 0;
    }
  }),
  157: new UnaryBranchOpcode('ifgt', {
    cmp: function(v) {
      return v > 0;
    }
  }),
  158: new UnaryBranchOpcode('ifle', {
    cmp: function(v) {
      return v <= 0;
    }
  }),
  159: new BinaryBranchOpcode('if_icmpeq', {
    cmp: function(v1, v2) {
      return v1 === v2;
    }
  }),
  160: new BinaryBranchOpcode('if_icmpne', {
    cmp: function(v1, v2) {
      return v1 !== v2;
    }
  }),
  161: new BinaryBranchOpcode('if_icmplt', {
    cmp: function(v1, v2) {
      return v1 < v2;
    }
  }),
  162: new BinaryBranchOpcode('if_icmpge', {
    cmp: function(v1, v2) {
      return v1 >= v2;
    }
  }),
  163: new BinaryBranchOpcode('if_icmpgt', {
    cmp: function(v1, v2) {
      return v1 > v2;
    }
  }),
  164: new BinaryBranchOpcode('if_icmple', {
    cmp: function(v1, v2) {
      return v1 <= v2;
    }
  }),
  165: new BinaryBranchOpcode('if_acmpeq', {
    cmp: function(v1, v2) {
      return v1 === v2;
    }
  }),
  166: new BinaryBranchOpcode('if_acmpne', {
    cmp: function(v1, v2) {
      return v1 !== v2;
    }
  }),
  167: new BranchOpcode('goto', {
    execute: function(rs) {
      return this.inc_pc(rs, this.offset);
    }
  }),
  168: new BranchOpcode('jsr', {
    execute: jsr
  }),
  169: new Opcode('ret', {
    byte_count: 1,
    execute: function(rs) {
      return this.goto_pc(rs, rs.cl(this.args[0]));
    }
  }),
  170: new TableSwitchOpcode('tableswitch'),
  171: new LookupSwitchOpcode('lookupswitch'),
  172: new ReturnOpcode('ireturn'),
  173: new ReturnOpcode('lreturn'),
  174: new ReturnOpcode('freturn'),
  175: new ReturnOpcode('dreturn'),
  176: new ReturnOpcode('areturn'),
  177: new ReturnOpcode('return'),
  178: new FieldOpcode('getstatic', {
    execute: function(rs) {
      var cls_type, new_execute, ref_cls, _ref9,
        _this = this;

      ref_cls = rs.get_class(this.field_spec["class"], true);
      new_execute = (_ref9 = this.field_spec.type) !== 'J' && _ref9 !== 'D' ? function(rs) {
        return rs.push(this.cls.static_get(rs, this.field_spec.name));
      } : function(rs) {
        return rs.push2(this.cls.static_get(rs, this.field_spec.name), null);
      };
      if (ref_cls != null) {
        cls_type = ref_cls.field_lookup(rs, this.field_spec.name).cls.get_type();
        this.cls = rs.get_class(cls_type, true);
        if (this.cls != null) {
          new_execute.call(this, rs);
          this.execute = new_execute;
        } else {
          rs.async_op(function(resume_cb, except_cb) {
            return rs.get_cl().initialize_class(rs, cls_type, (function(class_file) {
              return resume_cb(void 0, void 0, true, false);
            }), except_cb);
          });
        }
      } else {
        rs.async_op(function(resume_cb, except_cb) {
          return rs.get_cl().initialize_class(rs, _this.field_spec["class"], (function(class_file) {
            return resume_cb(void 0, void 0, true, false);
          }), except_cb);
        });
      }
    }
  }),
  179: new FieldOpcode('putstatic', {
    execute: function(rs) {
      var cls_type, new_execute, ref_cls, _ref9,
        _this = this;

      ref_cls = rs.get_class(this.field_spec["class"], true);
      new_execute = (_ref9 = this.field_spec.type) !== 'J' && _ref9 !== 'D' ? function(rs) {
        return this.cls.static_put(rs, this.field_spec.name, rs.pop());
      } : function(rs) {
        return this.cls.static_put(rs, this.field_spec.name, rs.pop2());
      };
      if (ref_cls != null) {
        cls_type = ref_cls.field_lookup(rs, this.field_spec.name).cls.get_type();
        this.cls = rs.get_class(cls_type, true);
        if (this.cls != null) {
          new_execute.call(this, rs);
          this.execute = new_execute;
        } else {
          rs.async_op(function(resume_cb, except_cb) {
            return rs.get_cl().initialize_class(rs, cls_type, (function(class_file) {
              return resume_cb(void 0, void 0, true, false);
            }), except_cb);
          });
        }
      } else {
        rs.async_op(function(resume_cb, except_cb) {
          return rs.get_cl().initialize_class(rs, _this.field_spec["class"], (function(class_file) {
            return resume_cb(void 0, void 0, true, false);
          }), except_cb);
        });
      }
    }
  }),
  180: new FieldOpcode('getfield', {
    execute: function(rs) {
      var cls, field, name, new_execute, obj, _ref9,
        _this = this;

      obj = rs.check_null(rs.peek());
      cls = rs.get_class(this.field_spec["class"], true);
      if (cls != null) {
        field = cls.field_lookup(rs, this.field_spec.name);
        name = field.cls.get_type() + this.field_spec.name;
        new_execute = (_ref9 = this.field_spec.type) !== 'J' && _ref9 !== 'D' ? function(rs) {
          var val;

          val = rs.check_null(rs.pop()).get_field(rs, name);
          return rs.push(val);
        } : function(rs) {
          var val;

          val = rs.check_null(rs.pop()).get_field(rs, name);
          return rs.push2(val, null);
        };
        new_execute.call(this, rs);
        this.execute = new_execute;
      } else {
        rs.async_op(function(resume_cb, except_cb) {
          return rs.get_cl().resolve_class(rs, _this.field_spec["class"], (function() {
            return resume_cb(void 0, void 0, true, false);
          }), except_cb);
        });
      }
    }
  }),
  181: new FieldOpcode('putfield', {
    execute: function(rs) {
      var cls_obj, field, name, new_execute, _obj, _ref10, _ref9,
        _this = this;

      if ((_ref9 = this.field_spec.type) === 'J' || _ref9 === 'D') {
        _obj = rs.check_null(rs.peek(2));
      } else {
        _obj = rs.check_null(rs.peek(1));
      }
      cls_obj = rs.get_class(this.field_spec["class"], true);
      if (cls_obj != null) {
        field = cls_obj.field_lookup(rs, this.field_spec.name);
        name = field.cls.get_type() + this.field_spec.name;
        new_execute = (_ref10 = this.field_spec.type) !== 'J' && _ref10 !== 'D' ? function(rs) {
          var val;

          val = rs.pop();
          return rs.check_null(rs.pop()).set_field(rs, name, val);
        } : function(rs) {
          var val;

          val = rs.pop2();
          return rs.check_null(rs.pop()).set_field(rs, name, val);
        };
        new_execute.call(this, rs);
        this.execute = new_execute;
      } else {
        rs.async_op(function(resume_cb, except_cb) {
          return rs.get_cl().resolve_class(rs, _this.field_spec["class"], (function() {
            return resume_cb(void 0, void 0, true, false);
          }), except_cb);
        });
      }
    }
  }),
  182: new DynInvokeOpcode('invokevirtual'),
  183: new InvokeOpcode('invokespecial'),
  184: new InvokeOpcode('invokestatic'),
  185: new DynInvokeOpcode('invokeinterface'),
  187: new ClassOpcode('new', {
    execute: function(rs) {
      var _this = this;

      this.cls = rs.get_class(this["class"], true);
      if (this.cls != null) {
        if (this.cls.is_castable(rs.get_bs_cl().get_resolved_class('Ljava/lang/ClassLoader;'))) {
          rs.push(new JavaClassLoaderObject(rs, this.cls));
          return this.execute = function(rs) {
            return rs.push(new JavaClassLoaderObject(rs, this.cls));
          };
        } else {
          rs.push(new JavaObject(rs, this.cls));
          return this.execute = function(rs) {
            return rs.push(new JavaObject(rs, this.cls));
          };
        }
      } else {
        return rs.async_op(function(resume_cb, except_cb) {
          var success_fn;

          success_fn = function(class_file) {
            var obj;

            if (class_file.is_castable(rs.get_bs_cl().get_resolved_class('Ljava/lang/ClassLoader;'))) {
              obj = new JavaClassLoaderObject(rs, class_file);
            } else {
              obj = new JavaObject(rs, class_file);
            }
            return resume_cb(obj, void 0, true);
          };
          return rs.get_cl().initialize_class(rs, _this["class"], success_fn, except_cb);
        });
      }
    }
  }),
  188: new NewArrayOpcode('newarray', {
    execute: function(rs) {
      return rs.push(rs.heap_newarray(this.element_type, rs.pop()));
    }
  }),
  189: new ClassOpcode('anewarray', {
    execute: function(rs) {
      var cls, new_execute,
        _this = this;

      cls = rs.get_cl().get_resolved_class(this["class"], true);
      if (cls != null) {
        new_execute = function(rs) {
          return rs.push(rs.heap_newarray(this["class"], rs.pop()));
        };
        new_execute.call(this, rs);
        this.execute = new_execute;
      } else {
        rs.async_op(function(resume_cb, except_cb) {
          return rs.get_cl().resolve_class(rs, _this["class"], (function(class_file) {
            return resume_cb(void 0, void 0, true, false);
          }), except_cb);
        });
      }
    }
  }),
  190: new Opcode('arraylength', {
    execute: function(rs) {
      return rs.push(rs.check_null(rs.pop()).array.length);
    }
  }),
  191: new Opcode('athrow', {
    execute: function(rs) {
      throw new JavaException(rs.pop());
    }
  }),
  192: new ClassOpcode('checkcast', {
    execute: function(rs) {
      var new_execute,
        _this = this;

      this.cls = rs.get_cl().get_resolved_class(this["class"], true);
      if (this.cls != null) {
        new_execute = function(rs) {
          var candidate_class, o, target_class;

          o = rs.peek();
          if ((o != null) && !o.cls.is_castable(this.cls)) {
            target_class = this.cls.toExternalString();
            candidate_class = o.cls.toExternalString();
            return rs.java_throw(rs.get_bs_class('Ljava/lang/ClassCastException;'), "" + candidate_class + " cannot be cast to " + target_class);
          }
        };
        new_execute.call(this, rs);
        return this.execute = new_execute;
      } else {
        return rs.async_op(function(resume_cb, except_cb) {
          return rs.get_cl().resolve_class(rs, _this["class"], (function() {
            return resume_cb(void 0, void 0, true, false);
          }), except_cb);
        });
      }
    }
  }),
  193: new ClassOpcode('instanceof', {
    execute: function(rs) {
      var new_execute,
        _this = this;

      this.cls = rs.get_cl().get_resolved_class(this["class"], true);
      if (this.cls != null) {
        new_execute = function(rs) {
          var o;

          o = rs.pop();
          return rs.push(o != null ? o.cls.is_castable(this.cls) + 0 : 0);
        };
        new_execute.call(this, rs);
        return this.execute = new_execute;
      } else {
        return rs.async_op(function(resume_cb, except_cb) {
          return rs.get_cl().resolve_class(rs, _this["class"], (function() {
            return resume_cb(void 0, void 0, true, false);
          }), except_cb);
        });
      }
    }
  }),
  194: new Opcode('monitorenter', {
    execute: function(rs) {
      if (!monitorenter(rs, rs.pop(), this)) {
        throw ReturnException;
      }
    }
  }),
  195: new Opcode('monitorexit', {
    execute: function(rs) {
      return monitorexit(rs, rs.pop());
    }
  }),
  197: new MultiArrayOpcode('multianewarray'),
  198: new UnaryBranchOpcode('ifnull', {
    cmp: function(v) {
      return v == null;
    }
  }),
  199: new UnaryBranchOpcode('ifnonnull', {
    cmp: function(v) {
      return v != null;
    }
  }),
  200: new BranchOpcode('goto_w', {
    byte_count: 4,
    execute: function(rs) {
      return this.inc_pc(rs, this.offset);
    }
  }),
  201: new BranchOpcode('jsr_w', {
    byte_count: 4,
    execute: jsr
  })
}
