"use strict";
import gLong = require('./gLong');
import util = require('./util');
import ByteStream = require('./ByteStream');
import ConstantPool = require('./ConstantPool');
import ClassData = require('./ClassData');
import java_object = require('./java_object');
import threading = require('./threading');
import ClassLoader = require('./ClassLoader');
import enums = require('./enums');
var JavaObject = java_object.JavaObject;
var JavaArray = java_object.JavaArray;
var JavaClassLoaderObject = ClassLoader.JavaClassLoaderObject;

/**
 * Helper function: Pops off two items, returns the second.
 */
function pop2(stack: any[]): any {
  // Ignore NULL.
  stack.pop();
  return stack.pop();
}

/**
 * Helper function: Checks if object is null. Throws a NullPointerException
 * if it is.
 * @return True if the object is null.
 */
function isNull(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, obj: any): boolean {
  if (obj == null) {
    thread.throwNewException('Ljava/lang/NullPointerException;', '');
    return frame.returnToThreadLoop = true;
  }
  return false;
}

/**
 * Helper function: Pauses the thread and initializes a class.
 */
function initializeClass(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, typeStr: string): void {
  thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
  frame.getLoader().initializeClass(thread, typeStr, (cdata: ClassData.ClassData) => {
    if (cdata != null) {
      thread.setStatus(enums.ThreadStatus.RUNNABLE);
    }
  }, false);
  frame.returnToThreadLoop = true;
}

/**
 * Helper function: Pauses the thread and resolves a class.
 */
function resolveClass(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, typeStr: string): void {
  thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
  frame.getLoader().resolveClass(thread, typeStr, (cdata: ClassData.ClassData) => {
    if (cdata != null) {
      thread.setStatus(enums.ThreadStatus.RUNNABLE);
    }
  }, false);
  frame.returnToThreadLoop = true;
}

export interface Execute {
  (thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void;
}

export class Opcode {
  public name: string;
  public byte_count: number;
  public execute: Execute;
  public args: number[];

  constructor(name: string, byte_count?: number, execute?: Execute) {
    this.name = name;
    this.byte_count = byte_count || 0;
    this.execute = execute || this._execute;
  }

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.args = [];
    for (var i = 0; i < this.byte_count; i++) {
      this.args.push(code_array.getUint8());
    }
  }

  /**
   * Called to provide opcode annotations for disassembly and vtrace
   */
  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return '';
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    throw new Error("ERROR: Unimplemented opcode.");
  }

  /**
   * Increments the PC after a successful opcode execution.
   */
  public incPc(frame: threading.BytecodeStackFrame): void {
    frame.pc += 1 + this.byte_count;
  }
}

export class FieldOpcode extends Opcode {
  public field_spec_ref: number
  public field_spec: any

  constructor(name: string, execute?: Execute) {
    super(name, 2, execute);
  }

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.field_spec_ref = code_array.getUint16();
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

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.class_ref = code_array.getUint16();
    this.class_desc = constant_pool.get(this.class_ref).deref();
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    var info = util.format_extra_info(pool.get(this.class_ref));
    return "\t#" + this.class_ref + ";" + info;
  }
}

export class InvokeOpcode extends Opcode {
  public method_spec_ref: number;
  public method_spec: any;

  constructor(name: string) {
    super(name, 2);
  }

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.method_spec_ref = code_array.getUint16();
    this.method_spec = constant_pool.get(this.method_spec_ref).deref();
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    var info = util.format_extra_info(pool.get(this.method_spec_ref));
    return "\t#" + this.method_spec_ref + ";" + info;
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var cls = <ClassData.ReferenceClassData> frame.getLoader().getInitializedClass(thread, this.method_spec.class_desc);
    if (cls != null) {
      var m = cls.method_lookup(thread, this.method_spec.sig);
      if (m != null) {
        thread.runMethod(m, m.takeArgs(frame.stack));
        frame.returnToThreadLoop = true;
      } else {
        // Could not find method! An exception has been thrown.
        frame.returnToThreadLoop = true;
      }
    } else {
      // Initialize our class and rerun opcode.
      var classname = this.method_spec.class_desc;
      initializeClass(thread, frame, classname);
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

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    super.take_args(code_array, constant_pool);
    // invokeinterface has two redundant bytes
    if (this.name === 'invokeinterface') {
      this.count = code_array.getUint8();
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

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var cls = frame.getLoader().getInitializedClass(thread, this.method_spec.class_desc);
    if (cls != null) {
      var stack = frame.stack;
      var obj: java_object.JavaObject = stack[stack.length - this.count];
      if (!isNull(thread, frame, obj)) {
        // Use the class of the *object*.
        var m = obj.cls.method_lookup(thread, this.method_spec.sig);
        if (m != null) {
          thread.runMethod(m, m.takeArgs(stack));
          frame.returnToThreadLoop = true;
        } else {
          // Method could not be found, and an exception has been thrown.
          frame.returnToThreadLoop = true;
        }
      }
      // 'obj' is NULL. isNull took care of throwing an exception for us.
    } else {
      // Initialize our class and rerun opcode.
      var classname = this.method_spec.class_desc;
      initializeClass(thread, frame, classname);
    }
  }
}

export class LoadConstantOpcode extends Opcode {
  public constant_ref: number
  public constant: any
  public str_constant: any

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.constant_ref = code_array.getUint(this.byte_count);
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

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    switch (this.constant.type) {
      case 'String':
        frame.stack.push(thread.getThreadPool().getJVM().internString(this.str_constant.value));
        this.incPc(frame);
        break;
      case 'class':
        // Fetch the jclass object and push it on to the stack. Do not rerun
        // this opcode.
        var cdesc = util.typestr2descriptor(this.str_constant.value);
        thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
        frame.getLoader().resolveClass(thread, cdesc, (cdata: ClassData.ClassData) => {
          if (cdata != null) {
            frame.stack.push(cdata.get_class_object(thread));
            this.incPc(frame);
            thread.setStatus(enums.ThreadStatus.RUNNABLE);
          }
        }, false);
        frame.returnToThreadLoop = true;
        break;
      default:
        if (this.name === 'ldc2_w')
          frame.stack.push(this.constant.value, null);
        else
          frame.stack.push(this.constant.value);
        this.incPc(frame);
        break;
    }
  }
}

export class BranchOpcode extends Opcode {
  public offset: number

  constructor(name: string, execute?: Execute) {
    super(name, 2, execute);
  }

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.offset = code_array.getInt(this.byte_count);
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
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    frame.pc += this.offset;
  }
}

export class JSROpcode extends GotoOpcode {
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    frame.stack.push(frame.pc + this.byte_count + 1);
    frame.pc += this.offset;
  }
}

export class UnaryBranchOpcode extends BranchOpcode {
  private cmp: (v: number) => boolean;

  constructor(name: string, cmp: (v: number) => boolean) {
    super(name);
    this.cmp = cmp;
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    if (this.cmp(frame.stack.pop())) {
      frame.pc += this.offset;
    } else {
      this.incPc(frame);
    }
  }
}

export class BinaryBranchOpcode extends BranchOpcode {
  private cmp: (v1: number, v2: number) => boolean;

  constructor(name: string, cmp: (v1: number, v2: number) => boolean) {
    super(name);
    this.cmp = cmp;
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var v2 = frame.stack.pop();
    var v1 = frame.stack.pop();
    if (this.cmp(v1, v2)) {
      frame.pc += this.offset;
    } else {
      this.incPc(frame);
    }
  }
}

export class PushOpcode extends Opcode {
  public value: number;

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.value = code_array.getInt(this.byte_count);
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + this.value;
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    frame.stack.push(this.value);
    this.incPc(frame);
  }
}

export class IIncOpcode extends Opcode {
  public index: number
  public const: number

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool, wide?: boolean): void {
    var arg_size: number;
    if (wide) {
      this.name += "_w";
      arg_size = 2;
      this.byte_count = 5;
    } else {
      arg_size = 1;
      this.byte_count = 2;
    }
    this.index = code_array.getUint(arg_size);
    this["const"] = code_array.getInt(arg_size);
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + this.index + ", " + this["const"];
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var v = frame.locals[this.index] + this["const"];
    frame.locals[this.index] = v | 0;
    this.incPc(frame);
  }
}

export class LoadOpcode extends Opcode {
  public var_num : number

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    // sneaky hack, works for name =~ /.load_\d/
    this.var_num = parseInt(this.name[6]);
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    frame.stack.push(frame.locals[this.var_num]);
    this.incPc(frame);
  }
}

// For category 2 types.
export class LoadOpcode2 extends LoadOpcode {
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    frame.stack.push(frame.locals[this.var_num], null);
    this.incPc(frame);
  }
}

export class LoadVarOpcode extends LoadOpcode {
  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool, wide?: boolean): void {
    if (wide) {
      this.name += "_w";
      this.byte_count = 3;
      this.var_num = code_array.getUint16();
    } else {
      this.byte_count = 1;
      this.var_num = code_array.getUint8();
    }
  }
  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + this.var_num;
  }
}

export class LoadVarOpcode2 extends LoadVarOpcode {
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    frame.stack.push(frame.locals[this.var_num], null);
    this.incPc(frame);
  }
}

export class StoreOpcode extends Opcode {
  public var_num : number

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    // sneaky hack, works for name =~ /.store_\d/
    this.var_num = parseInt(this.name[7]);
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    frame.locals[this.var_num] = frame.stack.pop();
    this.incPc(frame);
  }
}

// For category 2 types.
export class StoreOpcode2 extends StoreOpcode {
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var stack = frame.stack, varNum = this.var_num, locals = frame.locals;
    // First value is a NULL.
    locals[varNum+1] = stack.pop();
    // Second value is the real value.
    locals[varNum] = stack.pop();
    this.incPc(frame);
  }
}

export class StoreVarOpcode extends StoreOpcode {
  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool, wide?: boolean): void {
    if (wide) {
      this.name += "_w";
      this.byte_count = 3;
      this.var_num = code_array.getUint16();
    } else {
      this.byte_count = 1;
      this.var_num = code_array.getUint8();
    }
  }
  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + this.var_num;
  }
}

export class StoreVarOpcode2 extends LoadVarOpcode {
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var stack = frame.stack, varNum = this.var_num, locals = frame.locals;
    // First value is NULL.
    locals[varNum + 1] = stack.pop();
    // Second value is the true value.
    locals[varNum] = stack.pop();
    this.incPc(frame);
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

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    // account for padding that ensures alignment
    var padding_size = (4 - code_array.pos() % 4) % 4;
    code_array.skip(padding_size);
    this._default = code_array.getInt32();
    var npairs = code_array.getInt32();
    this.offsets = {};
    for (var i = 0; i < npairs; ++i) {
      var match = code_array.getInt32();
      this.offsets[match] = code_array.getInt32();
    }
    this.byte_count = padding_size + 8 * (npairs + 1);
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var offset = this.offsets[frame.stack.pop()];
    if (offset) {
      frame.pc += offset;
    } else {
      frame.pc += this._default;
    }
  }
}

export class TableSwitchOpcode extends LookupSwitchOpcode {
  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    // account for padding that ensures alignment
    var padding_size = (4 - code_array.pos() % 4) % 4;
    code_array.skip(padding_size);
    this._default = code_array.getInt32();
    var low = code_array.getInt32();
    var high = code_array.getInt32();
    this.offsets = {};
    var total_offsets = high - low + 1;
    for (var i = 0; i < total_offsets; ++i) {
      this.offsets[low + i] = code_array.getInt32();
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

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.element_type = NewArray_arr_types[code_array.getUint8()];
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t" + util.internal2external[this.element_type];
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var stack = frame.stack,
      newArray = java_object.heapNewArray(thread, frame.getLoader(), this.element_type, stack.pop());
    // If newArray is undefined, then an exception was thrown.
    if (newArray !== undefined) {
      stack.push(newArray);
      this.incPc(frame);
    } else {
      frame.returnToThreadLoop = true;
    }
  }
}

export class MultiArrayOpcode extends Opcode {
  public class_ref : number
  public class_descriptor : string
  public dim : number

  constructor(name: string) {
    super(name, 3);
  }

  public take_args(code_array: ByteStream, constant_pool: ConstantPool.ConstantPool): void {
    this.class_ref = code_array.getUint16();
    this.class_descriptor = constant_pool.get(this.class_ref).deref();
    this.dim = code_array.getUint8();
  }

  public annotate(idx: number, pool: ConstantPool.ConstantPool): string {
    return "\t#" + this.class_ref + ",  " + this.dim + ";";
  }

  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var cls = frame.getLoader().getInitializedClass(thread, this.class_descriptor);
    if (cls == null) {
      initializeClass(thread, frame, this.class_descriptor);
    } else {
      // cls is loaded. Create a new execute function to avoid this overhead.
      var new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
        var stack = frame.stack,
          counts = stack.splice(-this.dim, this.dim),
          newArray = java_object.heapMultiNewArray(thread, frame.getLoader(), this.class_descriptor, counts);
        // If newArray is undefined, an exception was thrown.
        if (newArray !== undefined) {
          stack.push(newArray);
          this.incPc(frame);
        } else {
          frame.returnToThreadLoop = true;
        }
      };
      new_execute.call(this, thread, frame);
      this.execute = new_execute;
    }
  }
}

export class ArrayLoadOpcode extends Opcode {
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var stack = frame.stack,
      idx = stack.pop(),
      obj = <java_object.JavaArray> stack.pop();//rs.check_null<java_object.JavaArray>(rs.pop());
    if (!isNull(thread, frame, obj)) {
      var len = obj.array.length;
      if (idx < 0 || idx >= len) {
        thread.throwNewException('Ljava/lang/ArrayIndexOutOfBoundsException;', idx + " not in length " + len + " array of type " + obj.cls.get_type());
        frame.returnToThreadLoop = true;
      } else {
        stack.push(obj.array[idx]);
        if (this.name[0] === 'l' || this.name[0] === 'd') {
          stack.push(null);
        }
        this.incPc(frame);
      }
    }
    // 'obj' is NULL. isNull threw an exception for us.
  }
}

export class ArrayStoreOpcode extends Opcode {
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    var stack = frame.stack;
    if (this.name[0] === 'l' || this.name[0] === 'd') {
      // pop2: Ignore the first pop.
      stack.pop();
    }

    var value = stack.pop(),
      idx = stack.pop(),
      obj = <java_object.JavaArray> stack.pop();
    if (!isNull(thread, frame, obj)) {
      var len = obj.array.length;
      if (idx < 0 || idx >= len) {
        thread.throwNewException('Ljava/lang/ArrayIndexOutOfBoundsException;', idx + " not in length " + len + " array of type " + obj.cls.get_type());
        frame.returnToThreadLoop = true;
      } else {
        obj.array[idx] = value;
        this.incPc(frame);
      }
    }
    // 'obj' is NULL. isNull threw an exception for us.
  }
}

export class ReturnOpcode extends Opcode {
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    frame.returnToThreadLoop = true;
    if (frame.method.access_flags.synchronized) {
      // monitorexit
      if (!frame.method.method_lock(thread, frame).exit(thread)) {
        // monitorexit threw an exception.
        return;
      }
    }
    thread.asyncReturn(frame.stack[0]);
  }
}

export class ReturnOpcode2 extends Opcode {
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    frame.returnToThreadLoop = true;
    if (frame.method.access_flags.synchronized) {
      // monitorexit
      if (!frame.method.method_lock(thread, frame).exit(thread)) {
        // monitorexit threw an exception.
        return;
      }
    }
    thread.asyncReturn(frame.stack[0], null);
  }
}

export class VoidReturnOpcode extends Opcode {
  public _execute(thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
    frame.returnToThreadLoop = true;
    if (frame.method.access_flags.synchronized) {
      // monitorexit
      if (!frame.method.method_lock(thread, frame).exit(thread)) {
        // monitorexit threw an exception.
        return;
      }
    }
    thread.asyncReturn();
  }
}

// These objects are used as prototypes for the parsed instructions in the classfile.
// Opcodes are in order, indexed by their binary representation.
export var opcodes: Opcode[] = [
  new Opcode('nop', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    this.incPc(frame);
  }),
  new Opcode('aconst_null', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(null);
    this.incPc(frame);
  }),
  new Opcode('iconst_m1', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(-1);
    this.incPc(frame);
  }),
  new Opcode('iconst_0', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(0);
    this.incPc(frame);
  }),
  new Opcode('iconst_1', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(1);
    this.incPc(frame);
  }),
  new Opcode('iconst_2', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(2);
    this.incPc(frame);
  }),
  new Opcode('iconst_3', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(3);
    this.incPc(frame);
  }),
  new Opcode('iconst_4', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(4);
    this.incPc(frame);
  }),
  new Opcode('iconst_5', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(5);
    this.incPc(frame);
  }),
  new Opcode('lconst_0', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(gLong.ZERO, null);
    this.incPc(frame);
  }),
  new Opcode('lconst_1', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(gLong.ONE, null);
    this.incPc(frame);
  }),
  new Opcode('fconst_0', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(0);
    this.incPc(frame);
  }),
  new Opcode('fconst_1', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(1);
    this.incPc(frame);
  }),
  new Opcode('fconst_2', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(2);
    this.incPc(frame);
  }),
  new Opcode('dconst_0', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(0, null);
    this.incPc(frame);
  }),
  new Opcode('dconst_1', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(1, null);
    this.incPc(frame);
  }),
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
  new Opcode('pop', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.pop();
    this.incPc(frame);
  }),
  new Opcode('pop2', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    pop2(stack);
    this.incPc(frame);
  }),
  new Opcode('dup', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v = stack.pop();
    stack.push(v, v);
    this.incPc(frame);
  }),
  new Opcode('dup_x1', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop();
    stack.push(v1, v2, v1);
    this.incPc(frame);
  }),
  new Opcode('dup_x2', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop(),
      v3 = stack.pop();
    stack.push(v1, v3, v2, v1);
    this.incPc(frame);
  }),
  new Opcode('dup2', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop();
    stack.push(v2, v1, v2, v1);
    this.incPc(frame);
  }),
  new Opcode('dup2_x1', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop(),
      v3 = stack.pop();
    stack.push(v2, v1, v3, v2, v1);
    this.incPc(frame);
  }),
  new Opcode('dup2_x2', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop(),
      v3 = stack.pop(),
      v4 = stack.pop();
    stack.push(v2, v1, v4, v3, v2, v1);
    this.incPc(frame);
  }),
  new Opcode('swap', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop();
    stack.push(v1, v2);
    this.incPc(frame);
  }),
  // math opcodes
  new Opcode('iadd', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push((stack.pop() + stack.pop()) | 0);
    this.incPc(frame);
  }),
  new Opcode('ladd', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    // push2
    stack.push(pop2(stack).add(pop2(stack)), null);
    this.incPc(frame);
  }),
  new Opcode('fadd', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(util.wrap_float(stack.pop() + stack.pop()))
    this.incPc(frame);
  }),
  new Opcode('dadd', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    // push2
    stack.push(pop2(stack) + pop2(stack), null);
    this.incPc(frame);
  }),
  new Opcode('isub', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push((-stack.pop() + stack.pop()) | 0);
    this.incPc(frame);
  }),
  new Opcode('lsub', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).negate().add(pop2(stack)), null);
    this.incPc(frame);
  }),
  new Opcode('fsub', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(util.wrap_float(-stack.pop() + stack.pop()));
    this.incPc(frame);
  }),
  new Opcode('dsub', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(-pop2(stack) + pop2(stack), null);
    this.incPc(frame);
  }),
  new Opcode('imul', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(Math['imul'](stack.pop(), stack.pop()));
    this.incPc(frame);
  }),
  new Opcode('lmul', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    // push2
    stack.push(pop2(stack).multiply(pop2(stack)), null);
    this.incPc(frame);
  }),
  new Opcode('fmul', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(util.wrap_float(stack.pop() * stack.pop()));
    this.incPc(frame);
  }),
  new Opcode('dmul', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack) * pop2(stack), null);
    this.incPc(frame);
  }),
  new Opcode('idiv', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack, b: number = stack.pop(), a: number = stack.pop();
    if (b === 0) {
      thread.throwNewException('Ljava/lang/ArithmeticException;', '/ by zero');
      frame.returnToThreadLoop = true;
    } else {
      // spec: "if the dividend is the negative integer of largest possible magnitude
      // for the int type, and the divisor is -1, then overflow occurs, and the
      // result is equal to the dividend."
      if (a === enums.Constants.INT_MIN && b === -1) {
        stack.push(a);
      } else {
        stack.push((a / b) | 0);
      }
      this.incPc(frame);
    }
  }),
  new Opcode('ldiv', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      b: gLong = pop2(stack),
      a: gLong = pop2(stack);
    if (b.isZero()) {
      thread.throwNewException('Ljava/lang/ArithmeticException;', '/ by zero');
      frame.returnToThreadLoop = true;
    } else {
      stack.push(a.div(b), null);
      this.incPc(frame);
    }
  }),
  new Opcode('fdiv', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      a: number = stack.pop();
    stack.push(util.wrap_float(stack.pop() / a));
    this.incPc(frame);
  }),
  new Opcode('ddiv', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v: number = pop2(stack);
    stack.push(pop2(stack) / v, null);
    this.incPc(frame);
  }),
  new Opcode('irem', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      b: number = stack.pop(),
      a: number = stack.pop();
    if (b === 0) {
      thread.throwNewException('Ljava/lang/ArithmeticException;', '/ by zero');
      frame.returnToThreadLoop = true;
    } else {
      stack.push(a % b);
      this.incPc(frame);
    }
  }),
  new Opcode('lrem', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      b: gLong = pop2(stack),
      a: gLong = pop2(stack);
    if (b.isZero()) {
      thread.throwNewException('Ljava/lang/ArithmeticException;', '/ by zero');
      frame.returnToThreadLoop = true;
    } else {
      stack.push(a.modulo(b), null);
      this.incPc(frame);
    }
  }),
  new Opcode('frem', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      b: number = stack.pop();
    stack.push(stack.pop() % b);
    this.incPc(frame);
  }),
  new Opcode('drem', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      b: number = pop2(stack);
    stack.push(pop2(stack) % b, null);
    this.incPc(frame);
  }),
  new Opcode('ineg', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(-stack.pop() | 0);
    this.incPc(frame);
  }),
  new Opcode('lneg', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).negate(), null);
    this.incPc(frame);
  }),
  new Opcode('fneg', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(-stack.pop());
    this.incPc(frame);
  }),
  new Opcode('dneg', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(-pop2(stack), null);
    this.incPc(frame);
  }),
  new Opcode('ishl', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s: number = stack.pop();
    stack.push(stack.pop() << s);
    this.incPc(frame);
  }),
  new Opcode('lshl', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s: number = stack.pop();
    stack.push(pop2(stack).shiftLeft(gLong.fromInt(s)), null);
    this.incPc(frame);
  }),
  new Opcode('ishr', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s: number = stack.pop();
    stack.push(stack.pop() >> s);
    this.incPc(frame);
  }),
  new Opcode('lshr', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s: number = stack.pop();
    stack.push(pop2(stack).shiftRight(gLong.fromInt(s)), null);
    this.incPc(frame);
  }),
  new Opcode('iushr', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s: number = stack.pop();
    stack.push((stack.pop() >>> s)|0);
    this.incPc(frame);
  }),
  new Opcode('lushr', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s: number = stack.pop();
    stack.push(pop2(stack).shiftRightUnsigned(gLong.fromInt(s)), null);
    this.incPc(frame);
  }),
  new Opcode('iand', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(stack.pop() & stack.pop());
    this.incPc(frame);
  }),
  new Opcode('land', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).and(pop2(stack)), null);
    this.incPc(frame);
  }),
  new Opcode('ior', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(stack.pop() | stack.pop());
    this.incPc(frame);
  }),
  new Opcode('lor', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).or(pop2(stack)), null);
    this.incPc(frame);
  }),
  new Opcode('ixor', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(stack.pop() ^ stack.pop());
    this.incPc(frame);
  }),
  new Opcode('lxor', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).xor(pop2(stack)), null);
    this.incPc(frame);
  }),
  new IIncOpcode('iinc'),
  new Opcode('i2l', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(gLong.fromInt(stack.pop()), null);
    this.incPc(frame);
  }),
  // Intentional no-op: ints and floats have the same representation.
  new Opcode('i2f', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    this.incPc(frame);
  }),
  new Opcode('i2d', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(null);
    this.incPc(frame);
  }),
  new Opcode('l2i', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).toInt());
    this.incPc(frame);
  }),
  new Opcode('l2f', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).toNumber());
    this.incPc(frame);
  }),
  new Opcode('l2d', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).toNumber(), null);
    this.incPc(frame);
  }),
  new Opcode('f2i', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(util.float2int(stack.pop()));
    this.incPc(frame);
  }),
  new Opcode('f2l', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(gLong.fromNumber(stack.pop()), null);
    this.incPc(frame);
  }),
  new Opcode('f2d', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.stack.push(null);
    this.incPc(frame);
  }),
  new Opcode('d2i', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(util.float2int(pop2(stack)));
    this.incPc(frame);
  }),
  new Opcode('d2l', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      d_val: number = pop2(stack);
    if (d_val === Number.POSITIVE_INFINITY) {
      stack.push(gLong.MAX_VALUE, null);
    } else if (d_val === Number.NEGATIVE_INFINITY) {
      stack.push(gLong.MIN_VALUE, null);
    } else {
      stack.push(gLong.fromNumber(d_val), null);
    }
    this.incPc(frame);
  }),
  new Opcode('d2f', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(util.wrap_float(pop2(stack)));
    this.incPc(frame);
  }),
  // set all high-order bits to 1
  new Opcode('i2b', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push((stack.pop() << 24) >> 24);
    this.incPc(frame);
  }),
  // 16-bit unsigned integer
  new Opcode('i2c', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(stack.pop() & 0xFFFF);
    this.incPc(frame);
  }),
  new Opcode('i2s', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push((stack.pop() << 16) >> 16);
    this.incPc(frame);
  }),
  new Opcode('lcmp', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v2: gLong = pop2(stack);
    stack.push(pop2(stack).compare(v2));
    this.incPc(frame);
  }),
  new Opcode('fcmpl', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v2 = stack.pop(),
      res = util.cmp(stack.pop(), v2);
    if (res == null) stack.push(-1);
    else stack.push(res);
    this.incPc(frame);
  }),
  new Opcode('fcmpg', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v2 = stack.pop(),
      res = util.cmp(stack.pop(), v2);
    if (res == null) stack.push(1);
    else stack.push(res);
    this.incPc(frame);
  }),
  new Opcode('dcmpl', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v2 = pop2(stack),
      res = util.cmp(pop2(stack), v2);
    if (res == null) stack.push(-1);
    else stack.push(res);
    this.incPc(frame);
  }),
  new Opcode('dcmpg', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v2 = pop2(stack),
      res = util.cmp(pop2(stack), v2);
    if (res == null) stack.push(1);
    else stack.push(res);
    this.incPc(frame);
  }),
  new UnaryBranchOpcode('ifeq', ((v: number): boolean => v === 0)),
  new UnaryBranchOpcode('ifne', ((v: number): boolean => v !== 0)),
  new UnaryBranchOpcode('iflt', ((v: number): boolean => v < 0)),
  new UnaryBranchOpcode('ifge', ((v: number): boolean => v >= 0)),
  new UnaryBranchOpcode('ifgt', ((v: number): boolean => v > 0)),
  new UnaryBranchOpcode('ifle', ((v: number): boolean => v <= 0)),
  new BinaryBranchOpcode('if_icmpeq', ((v1: number, v2: number): boolean => v1 === v2)),
  new BinaryBranchOpcode('if_icmpne', ((v1: number, v2: number): boolean => v1 !== v2)),
  new BinaryBranchOpcode('if_icmplt', ((v1: number, v2: number): boolean => v1 < v2)),
  new BinaryBranchOpcode('if_icmpge', ((v1: number, v2: number): boolean => v1 >= v2)),
  new BinaryBranchOpcode('if_icmpgt', ((v1: number, v2: number): boolean => v1 > v2)),
  new BinaryBranchOpcode('if_icmple', ((v1: number, v2: number): boolean => v1 <= v2)),
  new BinaryBranchOpcode('if_acmpeq', ((v1: number, v2: number): boolean => v1 === v2)),
  new BinaryBranchOpcode('if_acmpne', ((v1: number, v2: number): boolean => v1 !== v2)),
  new GotoOpcode('goto', 2),
  new JSROpcode('jsr', 2),
  new Opcode('ret', 1, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    frame.pc = frame.locals[this.args[0]];
  }),
  new TableSwitchOpcode('tableswitch'),
  new LookupSwitchOpcode('lookupswitch'),
  new ReturnOpcode('ireturn'),
  new ReturnOpcode2('lreturn'),
  new ReturnOpcode('freturn'),
  new ReturnOpcode2('dreturn'),
  new ReturnOpcode('areturn'),
  new VoidReturnOpcode('return'),
  // field access
  new FieldOpcode('getstatic', function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var desc = this.field_spec.class_desc, loader = frame.getLoader(),
      ref_cls = loader.getInitializedClass(thread, desc),
      new_execute: Execute;
    if (this.field_spec.type == 'J' || this.field_spec.type == 'D') {
      new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
        var stack = frame.stack;
        stack.push(this.cls.static_get(thread, this.field_spec.name), null);
        this.incPc(frame);
      };
    } else {
      new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
        var stack = frame.stack;
        stack.push(this.cls.static_get(thread, this.field_spec.name));
        this.incPc(frame);
      }
    }
    if (ref_cls != null) {
      // Get the *actual* class that owns this field.
      // This may not be initialized if it's an interface, so we need to check.
      var cls_type = ref_cls.field_lookup(thread, this.field_spec.name).cls.get_type();
      if (cls_type != null) {
        this.cls = loader.getInitializedClass(thread, cls_type);
        if (this.cls != null) {
          new_execute.call(this, thread, frame);
          this.execute = new_execute;
        } else {
          // Initialize cls_type and rerun opcode.
          initializeClass(thread, frame, cls_type);
        }
      } else {
        // Field not found.
        frame.returnToThreadLoop = true;
      }
    } else {
      // Initialize @field_spec.class and rerun opcode.
      initializeClass(thread, frame, desc);
    }
  }),
  new FieldOpcode('putstatic', function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    // Get the class referenced by the field_spec.
    var desc = this.field_spec.class_desc, loader = frame.getLoader(),
      ref_cls = loader.getInitializedClass(thread, desc),
      new_execute: Execute;
    if (this.field_spec.type == 'J' || this.field_spec.type == 'D') {
      new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
        this.cls.static_put(thread, this.field_spec.name, pop2(frame.stack));
        this.incPc(frame);
      };
    } else {
      new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
        this.cls.static_put(thread, this.field_spec.name, frame.stack.pop());
        this.incPc(frame);
      };
    }
    if (ref_cls != null) {
      // Get the *actual* class that owns this field.
      // This may not be initialized if it's an interface, so we need to check.
      var cls_type = ref_cls.field_lookup(thread, this.field_spec.name).cls.get_type();
      if (cls_type != null) {
        this.cls = loader.getInitializedClass(thread, cls_type);
        if (this.cls != null) {
          new_execute.call(this, thread, frame);
          this.execute = new_execute;
        } else {
          // Initialize cls_type and rerun opcode.
          initializeClass(thread, frame, cls_type);
        }
      } else {
        // Field not found.
        frame.returnToThreadLoop = true;
      }
    } else {
      // Initialize @field_spec.class and rerun opcode.
      initializeClass(thread, frame, desc);
    }
  }),
  new FieldOpcode('getfield', function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack,
      desc = this.field_spec.class_desc,
      obj: java_object.JavaObject = stack[stack.length - 1],
      loader = frame.getLoader();
    // Check if the object is null; if we do not do this before get_class, then
    // we might try to get a class that we have not initialized!
    if (!isNull(thread, frame, obj)) {
      // cls is guaranteed to be in the inheritance hierarchy of obj, so it must be
      // initialized. However, it may not be loaded in the current class's
      // ClassLoader...
      var cls = loader.getInitializedClass(thread, desc);
      if (cls != null) {
        var field = cls.field_lookup(thread, this.field_spec.name);
        if (field != null) {
          var name = field.cls.get_type() + this.field_spec.name;
          var new_execute: Execute;
          if (this.field_spec.type == 'J' || this.field_spec.type == 'D') {
            new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
              var stack = frame.stack, obj: java_object.JavaObject = stack.pop();
              if (!isNull(thread, frame, obj)) {
                var val = obj.get_field(thread, name);
                if (val !== undefined) {
                  // SUCCESS
                  stack.push(val, null);
                  this.incPc(frame);
                } else {
                  // FAILED
                  frame.returnToThreadLoop = true;
                }
              }
            };
          } else {
            new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
              var stack = frame.stack, obj: java_object.JavaObject = stack.pop();
              if (!isNull(thread, frame, obj)) {
                var val = obj.get_field(thread, name);
                if (val !== undefined) {
                  stack.push(val);
                  this.incPc(frame);
                } else {
                  frame.returnToThreadLoop = true;
                }
              }
            };
          }
          new_execute.call(this, thread, frame);
          this.execute = new_execute;
        } else {
          // Field was NULL; field_lookup threw an exception for us.
          frame.returnToThreadLoop = true;
        }
      } else {
        // Alright, tell this class's ClassLoader to load the class.
        resolveClass(thread, frame, desc);
      }
    }
  }),
  new FieldOpcode('putfield', function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    // Check if the object is null; if we do not do this before get_class, then
    // we might try to get a class that we have not initialized!
    var stack = frame.stack,
      desc = this.field_spec.class_desc,
      is_cat_2 = (this.field_spec.type == 'J' || this.field_spec.type == 'D'),
      obj = stack[stack.length - 1 - (is_cat_2 ? 2 : 1)],
      loader = frame.getLoader();
    if (!isNull(thread, frame, obj)) {
      // cls is guaranteed to be in the inheritance hierarchy of obj, so it must be
      // initialized. However, it may not be loaded in the current class's
      // ClassLoader...
      var cls_obj = loader.getInitializedClass(thread, desc);
      if (cls_obj != null) {
        var field = cls_obj.field_lookup(thread, this.field_spec.name);
        if (field != null) {
          var name = field.cls.get_type() + this.field_spec.name,
            new_execute: Execute;
          if (is_cat_2) {
            new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
              var stack = frame.stack, val = pop2(stack),
                obj: java_object.JavaObject = stack.pop();
              if (!isNull(thread, frame, obj)) {
                if (obj.set_field(thread, name, val)) {
                  this.incPc(frame);
                } else {
                  // Field not found.
                  frame.returnToThreadLoop = true;
                }
              }
            }
          } else {
            new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
              var stack = frame.stack, val = stack.pop(),
                obj: java_object.JavaObject = stack.pop();
              if (!isNull(thread, frame, obj)) {
                if (obj.set_field(thread, name, val)) {
                  this.incPc(frame);
                } else {
                  // Field not found.
                  frame.returnToThreadLoop = true;
                }
              }
            };
          }
          new_execute.call(this, thread, frame);
          this.execute = new_execute;
        } else {
          // Field not found exception.
          frame.returnToThreadLoop = true;
        }
      } else {
        // Alright, tell this class's ClassLoader to load the class.
        resolveClass(thread, frame, desc);
      }
    }
  }),
  new DynInvokeOpcode('invokevirtual'),
  new InvokeOpcode('invokespecial'),
  new InvokeOpcode('invokestatic'),
  new DynInvokeOpcode('invokeinterface'),
  null,  // invokedynamic
  new ClassOpcode('new', function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var desc = this.class_desc;
    this.cls = frame.getLoader().getInitializedClass(thread, desc);
    if (this.cls != null) {
      // XXX: Check if this is a ClassLoader / Thread / other.
      if (this.cls.is_castable(thread.getBsCl().getResolvedClass('Ljava/lang/ClassLoader;'))) {
        this.execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
          frame.stack.push(new ClassLoader.JavaClassLoaderObject(thread, this.cls));
          this.incPc(frame);
        };
      } else if (this.cls.is_castable(thread.getBsCl().getResolvedClass('Ljava/lang/Thread;'))) {
        this.execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
          frame.stack.push(thread.getThreadPool().newThread(this.cls));
          this.incPc(frame);
        };
      } else {
        // Self-modify; cache the class file lookup.
        this.execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
          frame.stack.push(new JavaObject(this.cls));
          this.incPc(frame);
        };
      }
      // Rerun opcode.
      this.execute.call(this, thread, frame);
    } else {
      // Initialize @type and rerun opcode.
      initializeClass(thread, frame, desc);
    }
  }),
  new NewArrayOpcode('newarray'),
  new ClassOpcode('anewarray', function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var desc = this.class_desc;
    // Make sure the component class is loaded.
    var cls = frame.getLoader().getResolvedClass(desc);
    if (cls != null) {
      var new_execute: Execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
        var stack = frame.stack,
          newArray = java_object.heapNewArray(thread, frame.getLoader(), desc, stack.pop());
        // If newArray is undefined, then an exception was thrown.
        if (newArray !== undefined) {
          stack.push(newArray);
          this.incPc(frame);
        } else {
          frame.returnToThreadLoop = true;
        }
      };
      new_execute.call(this, thread, frame);
      this.execute = new_execute;
    } else {
      // Load @class and rerun opcode.
      resolveClass(thread, frame, desc);
    }
  }),
  new Opcode('arraylength', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack, obj: java_object.JavaArray = stack.pop();
    if (!isNull(thread, frame, obj)) {
      stack.push(obj.array.length);
      this.incPc(frame);
    }
    // obj is NULL. isNull threw an exception for us.
  }),
  new Opcode('athrow', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    thread.throwException(frame.stack.pop());
    frame.returnToThreadLoop = true;
  }),
  new ClassOpcode('checkcast', function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var desc = this.class_desc;
    // Ensure the class is loaded.
    this.cls = frame.getLoader().getResolvedClass(desc);
    if (this.cls != null) {
      var new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame): void {
        var stack = frame.stack,
          o = stack[stack.length - 1];
        if ((o != null) && !o.cls.is_castable(this.cls)) {
          var target_class = this.cls.toExternalString();
          var candidate_class = o.cls.toExternalString();
          thread.throwNewException('Ljava/lang/ClassCastException;', candidate_class + " cannot be cast to " + target_class);
          frame.returnToThreadLoop = true;
        } else {
          // Success!
          this.incPc(frame);
        }
      };
      new_execute.call(this, thread, frame);
      this.execute = new_execute;
    } else {
      resolveClass(thread, frame, desc);
    }
  }),
  new ClassOpcode('instanceof', function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var desc = this.class_desc, loader = frame.getLoader();
    this.cls = loader.getResolvedClass(desc);
    if (this.cls != null) {
      var new_execute = function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
        var stack = frame.stack,
          o = stack.pop();
        stack.push(o != null ? o.cls.is_castable(this.cls) + 0 : 0);
        this.incPc(frame);
      };
      new_execute.call(this, thread, frame);
      this.execute = new_execute;
    } else {
      // Fetch class and rerun opcode.
      resolveClass(thread, frame, desc);
    }
  }),
  new Opcode('monitorenter', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var stack = frame.stack, monitorObj: java_object.JavaObject = stack.pop(),
      monitorEntered = () => {
        // [Note: Thread is now in the RUNNABLE state.]
        // Increment the PC.
        this.incPc(frame);
      };

    if (!monitorObj.getMonitor().enter(thread, monitorEntered)) {
      // Opcode failed. monitorEntered will be run once we own the monitor.
      // The thread is now in the BLOCKED state. Tell the frame to return to
      // the thread loop.
      frame.returnToThreadLoop = true;
    } else {
      monitorEntered();
    }
  }),
  new Opcode('monitorexit', 0, function (thread: threading.JVMThread, frame: threading.BytecodeStackFrame) {
    var monitorObj: java_object.JavaObject = frame.stack.pop();
    if (monitorObj.getMonitor().exit(thread)) {
      this.incPc(frame);
    } else {
      // monitorexit failed, and threw an exception.
      frame.returnToThreadLoop = true;
    }
  }),
  null,  // hole in the opcode array at 196
  new MultiArrayOpcode('multianewarray'),
  new UnaryBranchOpcode('ifnull', ((v: number): boolean => v == null)),
  new UnaryBranchOpcode('ifnonnull', ((v: number): boolean => v != null)),
  new GotoOpcode('goto_w', 4),
  new JSROpcode('jsr_w', 4)
];
