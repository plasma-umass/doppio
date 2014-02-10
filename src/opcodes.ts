"use strict";
import gLong = require('./gLong');
import util = require('./util');
import exceptions = require('./exceptions');
import runtime = require('./runtime');
import ConstantPool = require('./ConstantPool');
import ClassData = require('./ClassData');
var JavaException = exceptions.JavaException;
var ReturnException = exceptions.ReturnException;
import java_object = require('./java_object');
import threading = require('./threading');
var JavaObject = java_object.JavaObject;
var JavaArray = java_object.JavaArray;
var JavaClassLoaderObject = java_object.JavaClassLoaderObject;

export interface Execute {
  (rs: runtime.RuntimeState): any;
}

export class Opcode {
  public name: string
  public byte_count: number
  public execute: Execute
  public orig_execute: Execute
  public args: number[]

  constructor(name: string, byte_count?: number, execute?: Execute) {
    this.name = name;
    this.byte_count = byte_count || 0;
    this.execute = execute || this._execute;
    // Backup so we can reset caching between JVM invocations.
    this.orig_execute = this.execute;
  }

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.args = [];
    for (var i = 0; i < this.byte_count; i++) {
      this.args.push(code_array.get_uint(1));
    }
  }

  // called to provide opcode annotations for disassembly and vtrace
  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return '';
  }

  // Used to reset any cached information between JVM invocations.
  public reset_cache(): void {
    if (this.execute !== this.orig_execute) {
      this.execute = this.orig_execute;
    }
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    throw new Error("ERROR: Unimplemented opcode.");
  }

  // Increments the PC properly by the given offset.
  // Subtracts the byte_count and 1 before setting the offset so that the outer
  // loop can be simple.
  public inc_pc(rs: runtime.RuntimeState, offset: number): number {
    return rs.inc_pc(offset - 1 - this.byte_count);
  }

  public goto_pc(rs: runtime.RuntimeState, new_pc: number): number {
    return rs.goto_pc(new_pc - 1 - this.byte_count);
  }
}

export class FieldOpcode extends Opcode {
  public field_spec_ref: number
  public field_spec: any

  constructor(name: string, execute?: Execute) {
    super(name, 2, execute);
  }

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.field_spec_ref = code_array.get_uint(2);
    this.field_spec = constant_pool.get(this.field_spec_ref).deref();
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    var info = util.format_extra_info(pool.get(this.field_spec_ref));
    return "\t#" + this.field_spec_ref + ";" + info;
  }
}

export class ClassOpcode extends Opcode {
  public class_ref: number
  public class_desc: any

  constructor(name: string, execute?: Execute) {
    super(name, 2, execute);
  }

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.class_ref = code_array.get_uint(2);
    this.class_desc = constant_pool.get(this.class_ref).deref();
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    var info = util.format_extra_info(pool.get(this.class_ref));
    return "\t#" + this.class_ref + ";" + info;
  }
}

export class InvokeOpcode extends Opcode {
  public method_spec_ref: number
  public method_spec: any

  constructor(name: string) {
    super(name, 2);
  }

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.method_spec_ref = code_array.get_uint(2);
    this.method_spec = constant_pool.get(this.method_spec_ref).deref();
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    var info = util.format_extra_info(pool.get(this.method_spec_ref));
    return "\t#" + this.method_spec_ref + ";" + info;
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    var cls = <ClassData.ReferenceClassData> rs.get_class(this.method_spec.class_desc, true);
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
      var classname = this.method_spec.class_desc;
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

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    super.take_args(code_array, constant_pool);
    // invokeinterface has two redundant bytes
    if (this.name === 'invokeinterface') {
      this.count = code_array.get_uint(1);
      code_array.skip(1);
      this.byte_count += 2;
    } else { // invokevirtual
      this.count = 1 + get_param_word_size(this.method_spec.sig);
    }
    this.cache = Object.create(null);
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    var info = util.format_extra_info(pool.get(this.method_spec_ref));
    var extra = '';
    if (this.name === 'invokeinterface')
      extra = ',  ' + this.count;
    return "\t#" + this.method_spec_ref + extra + ";" + info;
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    var cls = rs.get_class(this.method_spec.class_desc, true);
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
      var classname = this.method_spec.class_desc;
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

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.constant_ref = code_array.get_uint(this.byte_count);
    this.constant = constant_pool.get(this.constant_ref);
    var ctype = this.constant.type;
    if (ctype === 'String' || ctype === 'class') {
      this.str_constant = constant_pool.get(this.constant.value);
    }
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    var ctype = this.constant.type;
    var anno = "\t#" + this.constant_ref + ";\t// " + this.constant.type + " ";
    if (ctype === 'String' || ctype === 'class')
      return anno + util.escape_whitespace(this.constant.deref())
    return anno + this.constant.value;
  }

  public _execute(rs: runtime.RuntimeState): boolean {
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
    return true;
  }
}

export class BranchOpcode extends Opcode {
  public offset: number

  constructor(name: string, execute?: Execute) {
    super(name, 2, execute);
  }

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.offset = code_array.get_int(this.byte_count);
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + (idx + this.offset);
  }
}

export class GotoOpcode extends BranchOpcode {
  constructor(name: string, byte_count: number) {
    super(name);
    this.byte_count = byte_count;
  }
  public _execute(rs: runtime.RuntimeState): boolean {
    this.inc_pc(rs, this.offset);
    return true;
  }
}

export class JSROpcode extends GotoOpcode {
  public _execute(rs: runtime.RuntimeState): boolean {
    rs.push(rs.curr_pc() + this.byte_count + 1);
    this.inc_pc(rs, this.offset);
    return true;
  }
}

export class UnaryBranchOpcode extends BranchOpcode {
  private cmp: Function  // TODO: specialize this type

  constructor(name: string, cmp: Function) {
    super(name);
    this.cmp = cmp;
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    if (this.cmp(rs.pop())) {
      this.inc_pc(rs, this.offset);
    }
    return true;
  }
}

export class BinaryBranchOpcode extends BranchOpcode {
  private cmp: Function  // TODO: specialize this type

  constructor(name: string, cmp: Function) {
    super(name);
    this.cmp = cmp;
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    var v2 = rs.pop();
    var v1 = rs.pop();
    if (this.cmp(v1, v2)) {
      this.inc_pc(rs, this.offset);
    }
    return true;
  }
}

export class PushOpcode extends Opcode {
  public value: number

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.value = code_array.get_int(this.byte_count);
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + this.value;
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    rs.push(this.value);
    return true;
  }
}

export class IIncOpcode extends Opcode {
  public index: number
  public const: number

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, wide?: boolean): void {
    var arg_size: number;
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

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + this.index + ", " + this["const"];
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    var v = rs.cl(this.index) + this["const"];
    rs.put_cl(this.index, v | 0);
    return true;
  }
}

export class LoadOpcode extends Opcode {
  public var_num : number

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    // sneaky hack, works for name =~ /.load_\d/
    this.var_num = parseInt(this.name[6]);
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    rs.push(rs.cl(this.var_num));
    return true;
  }
}

// For category 2 types.
export class LoadOpcode2 extends LoadOpcode {
  public _execute(rs: runtime.RuntimeState): boolean {
    rs.push2(rs.cl(this.var_num), null);
    return true;
  }
}

export class LoadVarOpcode extends LoadOpcode {
  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, wide?: boolean): void {
    if (wide) {
      this.name += "_w";
      this.byte_count = 3;
      this.var_num = code_array.get_uint(2);
    } else {
      this.byte_count = 1;
      this.var_num = code_array.get_uint(1);
    }
  }
  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + this.var_num;
  }
}

export class LoadVarOpcode2 extends LoadVarOpcode {
  public _execute(rs: runtime.RuntimeState): boolean {
    rs.push2(rs.cl(this.var_num), null);
    return true;
  }
}

export class StoreOpcode extends Opcode {
  public var_num : number

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    // sneaky hack, works for name =~ /.store_\d/
    this.var_num = parseInt(this.name[7]);
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    rs.put_cl(this.var_num, rs.pop());
    return true;
  }
}

// For category 2 types.
export class StoreOpcode2 extends StoreOpcode {
  public _execute(rs: runtime.RuntimeState): boolean {
    rs.put_cl2(this.var_num, rs.pop2());
    return true;
  }
}

export class StoreVarOpcode extends StoreOpcode {
  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool, wide?: boolean): void {
    if (wide) {
      this.name += "_w";
      this.byte_count = 3;
      this.var_num = code_array.get_uint(2);
    } else {
      this.byte_count = 1;
      this.var_num = code_array.get_uint(1);
    }
  }
  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + this.var_num;
  }
}

export class StoreVarOpcode2 extends LoadVarOpcode {
  public _execute(rs: runtime.RuntimeState): boolean {
    rs.put_cl2(this.var_num, rs.pop2());
    return true;
  }
}

export class LookupSwitchOpcode extends BranchOpcode {
  public offsets: {[key:number]:number};
  public _default: number;

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    var rv = "{\n";
    for (var match in this.offsets) {
      var offset = this.offsets[match];
      rv += ("\t\t" + match + ": " + (idx + offset) + ";\n");
    }
    return rv + "\t\tdefault: " + (idx + this._default) + " }";
  }

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    // account for padding that ensures alignment
    var padding_size = (4 - code_array.pos() % 4) % 4;
    code_array.skip(padding_size);
    this._default = code_array.get_int(4);
    var npairs = code_array.get_int(4);
    this.offsets = {};
    for (var i = 0; i < npairs; ++i) {
      var match = code_array.get_int(4);
      this.offsets[match] = code_array.get_int(4);
    }
    this.byte_count = padding_size + 8 * (npairs + 1);
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    var offset = this.offsets[rs.pop()];
    if (offset) {
      this.inc_pc(rs, offset);
    } else {
      this.inc_pc(rs, this._default);
    }
    return true;
  }
}

export class TableSwitchOpcode extends LookupSwitchOpcode {
  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    // account for padding that ensures alignment
    var padding_size = (4 - code_array.pos() % 4) % 4;
    code_array.skip(padding_size);
    this._default = code_array.get_int(4);
    var low = code_array.get_int(4);
    var high = code_array.get_int(4);
    this.offsets = {};
    var total_offsets = high - low + 1;
    for (var i = 0; i < total_offsets; ++i) {
      this.offsets[low + i] = code_array.get_int(4);
    }
    this.byte_count = padding_size + 12 + 4 * total_offsets;
  }
}

var NewArray_arr_types : {[t: number]: string; } = {
  4: 'Z', 5: 'C', 6: 'F', 7: 'D', 8: 'B', 9: 'S', 10: 'I', 11: 'J'
}

export class NewArrayOpcode extends Opcode {
  public element_type : string

  constructor(name: string) {
    super(name, 1);
  }

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.element_type = NewArray_arr_types[code_array.get_uint(1)];
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + util.internal2external[this.element_type];
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    rs.push(rs.heap_newarray(this.element_type, rs.pop()));
    return true;
  }
}

export class MultiArrayOpcode extends Opcode {
  public class_ref : number
  public class_descriptor : string
  public dim : number

  constructor(name: string) {
    super(name, 3);
  }

  public take_args(code_array: util.BytesArray, constant_pool: ConstantPool.ConstantPool): void {
    this.class_ref = code_array.get_uint(2);
    this.class_descriptor = constant_pool.get(this.class_ref).deref();
    this.dim = code_array.get_uint(1);
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t#" + this.class_ref + ",  " + this.dim + ";";
  }

  public _execute(rs: runtime.RuntimeState): boolean {
    var _this = this;
    var cls = rs.get_class(this.class_descriptor, true);
    if (cls == null) {
      rs.async_op(function(resume_cb, except_cb) {
        rs.get_cl().initialize_class(rs, _this.class_descriptor,
            ((class_file) => resume_cb(undefined, undefined, true, false)),
            except_cb);
      });
      return true;
    }
    // cls is loaded. Create a new execute function to avoid this overhead.
    var new_execute = function(rs: runtime.RuntimeState): void {
      var counts = rs.curr_frame().stack.splice(-this.dim, this.dim);
      rs.push(rs.heap_multinewarray(_this.class_descriptor, counts));
    };
    new_execute.call(this, rs);
    this.execute = new_execute;
    return true;
  }
}

export class ArrayLoadOpcode extends Opcode {
  public _execute(rs: runtime.RuntimeState): boolean {
    var idx = rs.pop();
    var obj = rs.check_null<java_object.JavaArray>(rs.pop());
    var len = obj.array.length;
    if (idx < 0 || idx >= len) {
      var err_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;');
      rs.java_throw(err_cls,
        idx + " not in length " + len + " array of type " + obj.cls.get_type());
    }
    rs.push(obj.array[idx]);
    if (this.name[0] === 'l' || this.name[0] === 'd') {
      rs.push(null);
    }
    return true;
  }
}

export class ArrayStoreOpcode extends Opcode {
  public _execute(rs: runtime.RuntimeState): boolean {
    var value = (this.name[0] === 'l' || this.name[0] === 'd') ? rs.pop2() : rs.pop();
    var idx = rs.pop();
    var obj = rs.check_null(rs.pop());
    var len = obj.array.length;
    if (idx < 0 || idx >= len) {
      var err_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArrayIndexOutOfBoundsException;');
      rs.java_throw(err_cls,
        idx + " not in length " + len + " array of type " + obj.cls.get_type());
    }
    obj.array[idx] = value;
    return true;
  }
}

export class ReturnOpcode extends Opcode {
  public _execute(rs: runtime.RuntimeState): boolean {
    var cf = rs.meta_stack().pop();
    rs.push(cf.stack[0]);
    rs.should_return = true;
    return true;
  }
}

export class ReturnOpcode2 extends Opcode {
  public _execute(rs: runtime.RuntimeState): boolean {
    var cf = rs.meta_stack().pop();
    rs.push2(cf.stack[0], null);
    rs.should_return = true;
    return true;
  }
}

export class VoidReturnOpcode extends Opcode {
  public _execute(rs: runtime.RuntimeState): boolean {
    rs.meta_stack().pop();
    rs.should_return = true;
    return true;
  }
}

export function monitorenter(rs: runtime.RuntimeState,
    monitor: java_object.JavaObject, inst?: Opcode): boolean {
  if (monitor == null) {
    rs.java_throw(<ClassData.ReferenceClassData>
      rs.get_bs_class('Ljava/lang/NullPointerException;'), 'Cannot enter a null monitor.');
  }
  var locked_thread = rs.lock_refs[monitor.ref];
  if (locked_thread != null) {
    if (locked_thread === rs.curr_thread) {
      // increment lock counter, to only unlock at zero
      rs.lock_counts[monitor.ref]++;
    } else {
      if (inst != null) {
        inst.inc_pc(rs, 1);
      } else {
        rs.inc_pc(1);
      }
      // dummy, to be popped by rs.yield
      rs.meta_stack().push(<any>{});
      rs.wait(monitor);
      return false;
    }
  } else {
    // this lock not held by any thread
    rs.lock_refs[monitor.ref] = rs.curr_thread;
    rs.lock_counts[monitor.ref] = 1;
  }
  return true;
}

export function monitorexit(rs: runtime.RuntimeState, monitor: any): void {
  var locked_thread = rs.lock_refs[monitor.ref];
  if (locked_thread == null) return;
  if (locked_thread === rs.curr_thread) {
    rs.lock_counts[monitor.ref]--;
    if (rs.lock_counts[monitor.ref] === 0) {
      delete rs.lock_refs[monitor.ref];
      // perform a notifyAll if the lock is now free
      if (rs.waiting_threads[monitor.ref] != null) {
        rs.waiting_threads[monitor.ref] = [];
      }
    }
  } else {
    var err_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/IllegalMonitorStateException;');
    rs.java_throw(err_cls, "Thread " + rs.curr_thread.name(rs) + " tried to monitorexit on lock held by thread " + locked_thread.name(rs) + ".");
  }
}

// These objects are used as prototypes for the parsed instructions in the classfile.
// Opcodes are in order, indexed by their binary representation.
export var opcodes : Opcode[] = [
  new Opcode('nop', 0, function(rs){}),  // apparently you can't use lambda syntax for a nop
  new Opcode('aconst_null', 0, ((rs)=>rs.push(null))),
  new Opcode('iconst_m1', 0, ((rs)=>rs.push(-1))),
  new Opcode('iconst_0', 0, ((rs)=>rs.push(0))),
  new Opcode('iconst_1', 0, ((rs)=>rs.push(1))),
  new Opcode('iconst_2', 0, ((rs)=>rs.push(2))),
  new Opcode('iconst_3', 0, ((rs)=>rs.push(3))),
  new Opcode('iconst_4', 0, ((rs)=>rs.push(4))),
  new Opcode('iconst_5', 0, ((rs)=>rs.push(5))),
  new Opcode('lconst_0', 0, ((rs)=>rs.push2(gLong.ZERO, null))),
  new Opcode('lconst_1', 0, ((rs)=>rs.push2(gLong.ONE, null))),
  new Opcode('fconst_0', 0, ((rs)=>rs.push(0))),
  new Opcode('fconst_1', 0, ((rs)=>rs.push(1))),
  new Opcode('fconst_2', 0, ((rs)=>rs.push(2))),
  new Opcode('dconst_0', 0, ((rs)=>rs.push2(0, null))),
  new Opcode('dconst_1', 0, ((rs)=>rs.push2(1, null))),
  new PushOpcode('bipush', 1),
  new PushOpcode('sipush', 2),
  new LoadConstantOpcode('ldc', 1),
  new LoadConstantOpcode('ldc_w', 2),
  new LoadConstantOpcode('ldc2_w', 2),
  new LoadVarOpcode('iload'),
  new LoadVarOpcode2('lload'),
  new LoadVarOpcode('fload'),
  new LoadVarOpcode2('dload'),
  new LoadVarOpcode('aload'),
  new LoadOpcode('iload_0'),
  new LoadOpcode('iload_1'),
  new LoadOpcode('iload_2'),
  new LoadOpcode('iload_3'),
  new LoadOpcode2('lload_0'),
  new LoadOpcode2('lload_1'),
  new LoadOpcode2('lload_2'),
  new LoadOpcode2('lload_3'),
  new LoadOpcode('fload_0'),
  new LoadOpcode('fload_1'),
  new LoadOpcode('fload_2'),
  new LoadOpcode('fload_3'),
  new LoadOpcode2('dload_0'),
  new LoadOpcode2('dload_1'),
  new LoadOpcode2('dload_2'),
  new LoadOpcode2('dload_3'),
  new LoadOpcode('aload_0'),
  new LoadOpcode('aload_1'),
  new LoadOpcode('aload_2'),
  new LoadOpcode('aload_3'),
  new ArrayLoadOpcode('iaload'),
  new ArrayLoadOpcode('laload'),
  new ArrayLoadOpcode('faload'),
  new ArrayLoadOpcode('daload'),
  new ArrayLoadOpcode('aaload'),
  new ArrayLoadOpcode('baload'),
  new ArrayLoadOpcode('caload'),
  new ArrayLoadOpcode('saload'),
  new StoreVarOpcode('istore'),
  new StoreVarOpcode2('lstore'),
  new StoreVarOpcode('fstore'),
  new StoreVarOpcode2('dstore'),
  new StoreVarOpcode('astore'),
  new StoreOpcode('istore_0'),
  new StoreOpcode('istore_1'),
  new StoreOpcode('istore_2'),
  new StoreOpcode('istore_3'),
  new StoreOpcode2('lstore_0'),
  new StoreOpcode2('lstore_1'),
  new StoreOpcode2('lstore_2'),
  new StoreOpcode2('lstore_3'),
  new StoreOpcode('fstore_0'),
  new StoreOpcode('fstore_1'),
  new StoreOpcode('fstore_2'),
  new StoreOpcode('fstore_3'),
  new StoreOpcode2('dstore_0'),
  new StoreOpcode2('dstore_1'),
  new StoreOpcode2('dstore_2'),
  new StoreOpcode2('dstore_3'),
  new StoreOpcode('astore_0'),
  new StoreOpcode('astore_1'),
  new StoreOpcode('astore_2'),
  new StoreOpcode('astore_3'),
  new ArrayStoreOpcode('iastore'),
  new ArrayStoreOpcode('lastore'),
  new ArrayStoreOpcode('fastore'),
  new ArrayStoreOpcode('dastore'),
  new ArrayStoreOpcode('aastore'),
  new ArrayStoreOpcode('bastore'),
  new ArrayStoreOpcode('castore'),
  new ArrayStoreOpcode('sastore'),

  // stack manipulation opcodes
  new Opcode('pop', 0, ((rs)=>rs.pop())),
  new Opcode('pop2', 0, ((rs)=>rs.pop2())),
  new Opcode('dup', 0, function(rs) {var v = rs.pop(); rs.push2(v, v);}),
  new Opcode('dup_x1', 0, function(rs) {
      var v1 = rs.pop();
      var v2 = rs.pop();
      rs.push_array([v1, v2, v1]);}),
  new Opcode('dup_x2', 0, function(rs) {
      var v1 = rs.pop();
      var v2 = rs.pop();
      var v3 = rs.pop();
      rs.push_array([v1, v3, v2, v1]);}),
  new Opcode('dup2', 0, function(rs) {
      var v1 = rs.pop();
      var v2 = rs.pop();
      rs.push_array([v2, v1, v2, v1]);}),
  new Opcode('dup2_x1', 0, function(rs) {
      var v1 = rs.pop();
      var v2 = rs.pop();
      var v3 = rs.pop();
      rs.push_array([v2, v1, v3, v2, v1]);}),
  new Opcode('dup2_x2', 0, function(rs) {
      var v1 = rs.pop();
      var v2 = rs.pop();
      var v3 = rs.pop();
      var v4 = rs.pop();
      rs.push_array([v2, v1, v4, v3, v2, v1]);}),
  new Opcode('swap', 0, function(rs) {
      var v1 = rs.pop();
      var v2 = rs.pop();
      rs.push2(v1, v2);}),
  // math opcodes
  new Opcode('iadd', 0, ((rs) => rs.push((rs.pop() + rs.pop()) | 0))),
  new Opcode('ladd', 0, ((rs) => rs.push2(rs.pop2().add(rs.pop2()), null))),
  new Opcode('fadd', 0, ((rs) => rs.push(util.wrap_float(rs.pop() + rs.pop())))),
  new Opcode('dadd', 0, ((rs) => rs.push2(rs.pop2() + rs.pop2(), null))),
  new Opcode('isub', 0, ((rs) => rs.push((-rs.pop() + rs.pop()) | 0))),
  new Opcode('lsub', 0, ((rs) => rs.push2(rs.pop2().negate().add(rs.pop2()), null))),
  new Opcode('fsub', 0, ((rs) => rs.push(util.wrap_float(-rs.pop() + rs.pop())))),
  new Opcode('dsub', 0, ((rs) => rs.push2(-rs.pop2() + rs.pop2(), null))),
  new Opcode('imul', 0, ((rs) => rs.push(Math['imul'](rs.pop(), rs.pop())))),
  new Opcode('lmul', 0, ((rs) => rs.push2(rs.pop2().multiply(rs.pop2()), null))),
  new Opcode('fmul', 0, ((rs) => rs.push(util.wrap_float(rs.pop() * rs.pop())))),
  new Opcode('dmul', 0, ((rs) => rs.push2(rs.pop2() * rs.pop2(), null))),
  new Opcode('idiv', 0, function(rs) {
    var v = rs.pop();
    rs.push(util.int_div(rs, rs.pop(), v));
  }),
  new Opcode('ldiv', 0, function(rs) {
    var v = rs.pop2();
    rs.push2(util.long_div(rs, rs.pop2(), v), null);
  }),
  new Opcode('fdiv', 0, function(rs) {
    var a = rs.pop();
    rs.push(util.wrap_float(rs.pop() / a));
  }),
  new Opcode('ddiv', 0, function(rs) {
    var v = rs.pop2();
    rs.push2(rs.pop2() / v, null);
  }),
  new Opcode('irem', 0, function(rs) {
    var v2 = rs.pop();
    rs.push(util.int_mod(rs, rs.pop(), v2));
  }),
  new Opcode('lrem', 0, function(rs) {
    var v2 = rs.pop2();
    rs.push2(util.long_mod(rs, rs.pop2(), v2), null);
  }),
  new Opcode('frem', 0, function(rs) {
    var b = rs.pop();
    rs.push(rs.pop() % b);
  }),
  new Opcode('drem', 0, function(rs) {
    var v2 = rs.pop2();
    rs.push2(rs.pop2() % v2, null);
  }),
  new Opcode('ineg', 0, ((rs) => rs.push(-rs.pop() | 0))),
  new Opcode('lneg', 0, ((rs) => rs.push2(rs.pop2().negate(), null))),
  new Opcode('fneg', 0, ((rs) => rs.push(-rs.pop()))),
  new Opcode('dneg', 0, ((rs) => rs.push2(-rs.pop2(), null))),
  new Opcode('ishl', 0, function(rs) {
    var s = rs.pop();
    rs.push(rs.pop() << s);
  }),
  new Opcode('lshl', 0, function(rs) {
    var s = rs.pop();
    rs.push2(rs.pop2().shiftLeft(gLong.fromInt(s)), null);
  }),
  new Opcode('ishr', 0, function(rs) {
    var s = rs.pop();
    rs.push(rs.pop() >> s);
  }),
  new Opcode('lshr', 0, function(rs) {
    var s = rs.pop();
    rs.push2(rs.pop2().shiftRight(gLong.fromInt(s)), null);
  }),
  new Opcode('iushr', 0, function(rs) {
    var s = rs.pop();
    rs.push(rs.pop() >>> s);
  }),
  new Opcode('lushr', 0, function(rs) {
    var s = rs.pop();
    rs.push2(rs.pop2().shiftRightUnsigned(gLong.fromInt(s)), null);
  }),
  new Opcode('iand', 0, ((rs) => rs.push(rs.pop() & rs.pop()))),
  new Opcode('land', 0, ((rs) => rs.push2(rs.pop2().and(rs.pop2()), null))),
  new Opcode('ior', 0, ((rs) => rs.push(rs.pop() | rs.pop()))),
  new Opcode('lor', 0, ((rs) => rs.push2(rs.pop2().or(rs.pop2()), null))),
  new Opcode('ixor', 0, ((rs) => rs.push(rs.pop() ^ rs.pop()))),
  new Opcode('lxor', 0, ((rs) => rs.push2(rs.pop2().xor(rs.pop2()), null))),
  new IIncOpcode('iinc'),
  new Opcode('i2l', 0, ((rs) => rs.push2(gLong.fromInt(rs.pop()), null))),
  // Intentional no-op: ints and floats have the same representation.
  new Opcode('i2f', 0, function(rs){}),
  new Opcode('i2d', 0, ((rs) => rs.push(null))),
  new Opcode('l2i', 0, ((rs) => rs.push(rs.pop2().toInt()))),
  new Opcode('l2f', 0, ((rs) => rs.push(rs.pop2().toNumber()))),
  new Opcode('l2d', 0, ((rs) => rs.push2(rs.pop2().toNumber(), null))),
  new Opcode('f2i', 0, ((rs) => rs.push(util.float2int(rs.pop())))),
  new Opcode('f2l', 0, ((rs) => rs.push2(gLong.fromNumber(rs.pop()), null))),
  new Opcode('f2d', 0, ((rs) => rs.push(null))),
  new Opcode('d2i', 0, ((rs) => rs.push(util.float2int(rs.pop2())))),
  new Opcode('d2l', 0, function(rs){
    var d_val = rs.pop2();
    if (d_val === Number.POSITIVE_INFINITY) {
      rs.push2(gLong.MAX_VALUE, null);
    } else if (d_val === Number.NEGATIVE_INFINITY) {
      rs.push2(gLong.MIN_VALUE, null);
    } else {
      rs.push2(gLong.fromNumber(d_val), null);
    }
  }),
  new Opcode('d2f', 0, ((rs) => rs.push(util.wrap_float(rs.pop2())))),
  // set all high-order bits to 1
  new Opcode('i2b', 0, ((rs) => rs.push((rs.pop() << 24) >> 24))),
  // 16-bit unsigned integer
  new Opcode('i2c', 0, ((rs) => rs.push(rs.pop() & 0xFFFF))),
  new Opcode('i2s', 0, ((rs) => rs.push((rs.pop() << 16) >> 16))),
  new Opcode('lcmp', 0, function(rs){
    var v2 = rs.pop2();
    rs.push(rs.pop2().compare(v2));
  }),
  new Opcode('fcmpl', 0, function(rs) {
    var v2 = rs.pop();
    var res = util.cmp(rs.pop(), v2);
    if (res == null) rs.push(-1);
    else             rs.push(res);
  }),
  new Opcode('fcmpg', 0, function(rs) {
    var v2 = rs.pop();
    var res = util.cmp(rs.pop(), v2);
    if (res == null) rs.push(1);
    else             rs.push(res);
  }),
  new Opcode('dcmpl', 0, function(rs) {
    var v2 = rs.pop2();
    var res = util.cmp(rs.pop2(), v2);
    if (res == null) rs.push(-1);
    else             rs.push(res);
  }),
  new Opcode('dcmpg', 0, function(rs) {
    var v2 = rs.pop2();
    var res = util.cmp(rs.pop2(), v2);
    if (res == null) rs.push(1);
    else             rs.push(res);
  }),
  new UnaryBranchOpcode('ifeq', ((v) => v === 0)),
  new UnaryBranchOpcode('ifne', ((v) => v !== 0)),
  new UnaryBranchOpcode('iflt', ((v) => v < 0)),
  new UnaryBranchOpcode('ifge', ((v) => v >= 0)),
  new UnaryBranchOpcode('ifgt', ((v) => v > 0)),
  new UnaryBranchOpcode('ifle', ((v) => v <= 0)),
  new BinaryBranchOpcode('if_icmpeq', ((v1,v2) => v1 === v2)),
  new BinaryBranchOpcode('if_icmpne', ((v1,v2) => v1 !== v2)),
  new BinaryBranchOpcode('if_icmplt', ((v1,v2) => v1 < v2)),
  new BinaryBranchOpcode('if_icmpge', ((v1,v2) => v1 >= v2)),
  new BinaryBranchOpcode('if_icmpgt', ((v1,v2) => v1 > v2)),
  new BinaryBranchOpcode('if_icmple', ((v1,v2) => v1 <= v2)),
  new BinaryBranchOpcode('if_acmpeq', ((v1,v2) => v1 === v2)),
  new BinaryBranchOpcode('if_acmpne', ((v1,v2) => v1 !== v2)),
  new GotoOpcode('goto', 2),
  new JSROpcode('jsr', 2),
  new Opcode('ret', 1, function(rs){this.goto_pc(rs, rs.cl(this.args[0]))}),
  new TableSwitchOpcode('tableswitch'),
  new LookupSwitchOpcode('lookupswitch'),
  new ReturnOpcode('ireturn'),
  new ReturnOpcode2('lreturn'),
  new ReturnOpcode('freturn'),
  new ReturnOpcode2('dreturn'),
  new ReturnOpcode('areturn'),
  new VoidReturnOpcode('return'),
  // field access
  new FieldOpcode('getstatic', function(rs) {
    var desc = this.field_spec.class_desc;
    var ref_cls = rs.get_class(desc, true);
    var new_execute: Execute;
    if (this.field_spec.type == 'J' || this.field_spec.type == 'D') {
      new_execute = (rs) => rs.push2(this.cls.static_get(rs, this.field_spec.name), null)
    } else {
      new_execute = (rs) => rs.push(this.cls.static_get(rs, this.field_spec.name))
    }
    if (ref_cls != null) {
      // Get the *actual* class that owns this field.
      // This may not be initialized if it's an interface, so we need to check.
      var cls_type = ref_cls.field_lookup(rs, this.field_spec.name).cls.get_type();
      this.cls = rs.get_class(cls_type, true);
      if (this.cls != null) {
        new_execute.call(this, rs);
        this.execute = new_execute;
      } else {
        // Initialize cls_type and rerun opcode.
        rs.async_op(function(resume_cb, except_cb) {
          rs.get_cl().initialize_class(rs, cls_type, (function(class_file) {
            resume_cb(undefined, undefined, true, false);
          }), except_cb);
        });
      }
    } else {
      // Initialize @field_spec.class and rerun opcode.
      rs.async_op(function(resume_cb, except_cb) {
        rs.get_cl().initialize_class(rs, desc, (function(class_file) {
          resume_cb(undefined, undefined, true, false);
        }), except_cb);
      });
    }
  }),
  new FieldOpcode('putstatic', function(rs) {
    // Get the class referenced by the field_spec.
    var desc = this.field_spec.class_desc;
    var ref_cls = rs.get_class(desc, true);
    var new_execute: Execute;
    if (this.field_spec.type == 'J' || this.field_spec.type == 'D') {
      new_execute = (rs) => this.cls.static_put(rs, this.field_spec.name, rs.pop2())
    } else {
      new_execute = (rs) => this.cls.static_put(rs, this.field_spec.name, rs.pop())
    }
    if (ref_cls != null) {
      // Get the *actual* class that owns this field.
      // This may not be initialized if it's an interface, so we need to check.
      var cls_type = ref_cls.field_lookup(rs, this.field_spec.name).cls.get_type();
      this.cls = rs.get_class(cls_type, true);
      if (this.cls != null) {
        new_execute.call(this, rs);
        this.execute = new_execute;
      } else {
        // Initialize cls_type and rerun opcode.
        rs.async_op(function(resume_cb, except_cb) {
          rs.get_cl().initialize_class(rs, cls_type, (function(class_file) {
            resume_cb(undefined, undefined, true, false);
          }), except_cb);
        });
      }
      return;
    }
    // Initialize @field_spec.class and rerun opcode.
    rs.async_op(function(resume_cb, except_cb) {
      rs.get_cl().initialize_class(rs, desc, (function(class_file) {
        resume_cb(undefined, undefined, true, false);
      }), except_cb);
    });
  }),
  new FieldOpcode('getfield', function(rs) {
    var desc = this.field_spec.class_desc;
    // Check if the object is null; if we do not do this before get_class, then
    // we might try to get a class that we have not initialized!
    var obj = rs.check_null(rs.peek());
    // cls is guaranteed to be in the inheritance hierarchy of obj, so it must be
    // initialized. However, it may not be loaded in the current class's
    // ClassLoader...
    var cls = rs.get_class(desc, true);
    if (cls != null) {
      var field = cls.field_lookup(rs, this.field_spec.name);
      var name = field.cls.get_type() + this.field_spec.name;
      var new_execute: Execute;
      if (this.field_spec.type == 'J' || this.field_spec.type == 'D') {
        new_execute = (rs) => rs.push2(rs.check_null(rs.pop()).get_field(rs, name), null);
      } else {
        new_execute = (rs) => rs.push(rs.check_null(rs.pop()).get_field(rs, name));
      }
      new_execute.call(this, rs);
      this.execute = new_execute;
      return;
    }
    // Alright, tell this class's ClassLoader to load the class.
    rs.async_op(function(resume_cb, except_cb) {
      rs.get_cl().resolve_class(rs, desc, (function() {
        resume_cb(undefined, undefined, true, false);
      }), except_cb);
    });
  }),
  new FieldOpcode('putfield', function(rs) {
    // Check if the object is null; if we do not do this before get_class, then
    // we might try to get a class that we have not initialized!
    var desc = this.field_spec.class_desc;
    var is_cat_2 = (this.field_spec.type == 'J' || this.field_spec.type == 'D');
    rs.check_null(rs.peek(is_cat_2 ? 2 : 1));
    // cls is guaranteed to be in the inheritance hierarchy of obj, so it must be
    // initialized. However, it may not be loaded in the current class's
    // ClassLoader...
    var cls_obj = rs.get_class(desc, true);
    if (cls_obj != null) {
      var field = cls_obj.field_lookup(rs, this.field_spec.name);
      var name = field.cls.get_type() + this.field_spec.name;
      var new_execute: Execute;
      if (is_cat_2) {
        new_execute = function(rs) {
          var val = rs.pop2();
          rs.check_null(rs.pop()).set_field(rs, name, val);
        }
      } else {
        new_execute = function(rs) {
          var val = rs.pop();
          rs.check_null(rs.pop()).set_field(rs, name, val);
        };
      }
      new_execute.call(this, rs);
      this.execute = new_execute;
    } else {
      // Alright, tell this class's ClassLoader to load the class.
      rs.async_op(function(resume_cb, except_cb) {
        rs.get_cl().resolve_class(rs, desc, (function() {
          resume_cb(undefined, undefined, true, false);
        }), except_cb);
      });
    }
  }),
  new DynInvokeOpcode('invokevirtual'),
  new InvokeOpcode('invokespecial'),
  new InvokeOpcode('invokestatic'),
  new DynInvokeOpcode('invokeinterface'),
  null,  // invokedynamic
  new ClassOpcode('new', function(rs) {
    var desc = this.class_desc;
    this.cls = rs.get_class(desc, true);
    if (this.cls != null) {
      // Check if this is a ClassLoader or not.
      if (this.cls.is_castable(rs.get_bs_cl().get_resolved_class('Ljava/lang/ClassLoader;', true))) {
        rs.push(new JavaClassLoaderObject(rs, this.cls));
        this.execute = (rs: runtime.RuntimeState) => rs.push(new JavaClassLoaderObject(rs, this.cls));
      } else if (this.cls.is_castable(rs.get_bs_cl().get_resolved_class('Ljava/lang/Thread;', true))) {
        rs.push(new threading.JavaThreadObject(rs, this.cls));
        this.execute = (rs: runtime.RuntimeState) => rs.push(new threading.JavaThreadObject(rs, this.cls));
      } else {
        rs.push(new JavaObject(rs, this.cls));
        // Self-modify; cache the class file lookup.
        this.execute = (rs: runtime.RuntimeState) => rs.push(new JavaObject(rs, this.cls));
      }
    } else {
      // Initialize @type, create a JavaObject for it, and push it onto the stack.
      // Do not rerun opcode.
      rs.async_op(function(resume_cb, except_cb) {
        var success_fn = function(class_file: ClassData.ReferenceClassData) {
          // Check if this is a ClassLoader or not.
          var obj: java_object.JavaObject;
          if (class_file.is_castable(rs.get_bs_cl().get_resolved_class('Ljava/lang/ClassLoader;', true))) {
            obj = new JavaClassLoaderObject(rs, class_file);
          } else if (class_file.is_castable(rs.get_bs_cl().get_resolved_class('Ljava/lang/Thread;', true))) {
            obj = new threading.JavaThreadObject(rs, class_file);
          } else {
            obj = new JavaObject(rs, class_file);
          }
          resume_cb(obj, undefined, true);
        };
        rs.get_cl().initialize_class(rs, desc, success_fn, except_cb);
      });
    }
  }),
  new NewArrayOpcode('newarray'),
  new ClassOpcode('anewarray', function(rs) {
    var desc = this.class_desc;
    // Make sure the component class is loaded.
    var cls = rs.get_cl().get_resolved_class(desc, true);
    if (cls != null) {
      var new_execute: Execute = (rs) => rs.push(rs.heap_newarray(desc, rs.pop()));
      new_execute.call(this, rs);
      this.execute = new_execute;
    } else {
      // Load @class and rerun opcode.
      rs.async_op(function(resume_cb, except_cb) {
        rs.get_cl().resolve_class(rs, desc, (function(class_file) {
          resume_cb(undefined, undefined, true, false);
        }), except_cb);
      });
    }
  }),
  new Opcode('arraylength', 0, ((rs) => rs.push(rs.check_null(rs.pop()).array.length))),
  new Opcode('athrow', 0, function(rs){throw new JavaException(rs.pop())}),
  new ClassOpcode('checkcast', function(rs) {
    var desc = this.class_desc;
    // Ensure the class is loaded.
    this.cls = rs.get_cl().get_resolved_class(desc, true);
    if (this.cls != null) {
      var new_execute = function(rs: runtime.RuntimeState): void {
        var o = rs.peek();
        if ((o != null) && !o.cls.is_castable(this.cls)) {
          var target_class = this.cls.toExternalString();
          var candidate_class = o.cls.toExternalString();
          var err_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ClassCastException;');
          rs.java_throw(err_cls, candidate_class + " cannot be cast to " + target_class);
        }
      };
      new_execute.call(this, rs);
      this.execute = new_execute;
      return;
    }
    // Fetch @class and rerun opcode.
    rs.async_op(function(resume_cb, except_cb) {
      rs.get_cl().resolve_class(rs, desc,
        (() => resume_cb(undefined, undefined, true, false)), except_cb);
    });
  }),
  new ClassOpcode('instanceof', function(rs) {
    var desc = this.class_desc;
    this.cls = rs.get_cl().get_resolved_class(desc, true);
    if (this.cls != null) {
      var new_execute = function(rs: runtime.RuntimeState) {
        var o = rs.pop();
        rs.push(o != null ? o.cls.is_castable(this.cls) + 0 : 0);
      };
      new_execute.call(this, rs);
      this.execute = new_execute;
      return;
    }
    // Fetch @class and rerun opcode.
    rs.async_op(function(resume_cb, except_cb) {
      rs.get_cl().resolve_class(rs, desc,
        (() => resume_cb(undefined, undefined, true, false)), except_cb);
    });
  }),
  new Opcode('monitorenter', 0, function(rs){
    // we merely peek (instead of pop) here because this op may be called
    // multiple times
    if (!monitorenter(rs, rs.peek(), this)) {
      throw ReturnException;
    }
    rs.pop();
  }),
  new Opcode('monitorexit', 0, ((rs) => monitorexit(rs, rs.pop()))),
  null,  // hole in the opcode array at 196
  new MultiArrayOpcode('multianewarray'),
  new UnaryBranchOpcode('ifnull', ((v) => v == null)),
  new UnaryBranchOpcode('ifnonnull', ((v) => v != null)),
  new GotoOpcode('goto_w', 4),
  new JSROpcode('jsr_w', 4)
];
