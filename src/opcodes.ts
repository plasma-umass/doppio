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
import interfaces = require('./interfaces');
import assert = require('./assert');
var JavaObject = java_object.JavaObject;

/**
 * Interface for individual opcode implementations.
 */
export interface OpcodeImplementation {
  (thread: threading.JVMThread, frame: threading.BytecodeStackFrame, code?: NodeBuffer, position?: number): void;
}

/**
 * Stashes information pertinent to a static field.
 */
export interface StaticFieldStash {
  cls: ClassData.ReferenceClassData;
  name: string;
}

/**
 * Helper function: Checks if object is null. Throws a NullPointerException
 * if it is.
 * @return True if the object is null.
 */
export function isNull(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, obj: any): boolean {
  if (obj == null) {
    throwException(thread, frame, 'Ljava/lang/NullPointerException;', '');
    return true;
  }
  return false;
}

/**
 * Helper function: Pops off two items, returns the second.
 */
export function pop2(stack: any[]): any {
  // Ignore NULL.
  stack.pop();
  return stack.pop();
}

/**
 * Helper function: Pauses the thread and initializes a class.
 */
export function initializeClass(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, typeStr: string): void {
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
export function resolveClass(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, typeStr: string): void {
  thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
  frame.getLoader().resolveClass(thread, typeStr, (cdata: ClassData.ClassData) => {
    if (cdata != null) {
      thread.setStatus(enums.ThreadStatus.RUNNABLE);
    }
  }, false);
  frame.returnToThreadLoop = true;
}

/**
 * Interrupts the current method's execution and throws an exception.
 *
 * NOTE: This does *not* interrupt JavaScript control flow, so any opcode
 * calling this function must *return* and not do anything else.
 */
export function throwException(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, clsName: string, msg: string): void {
  thread.throwNewException(clsName, msg);
  frame.returnToThreadLoop = true;
}

/**
 * Retrieve a class or field description from the given constant pool.
 * @param code The buffer containing the code in the current method.
 * @param pc The location of the program counter. Must be pointing to the
 *   current opcode, and the first operand must be a constant pool index.
 * @param constantPool The constant pool of the relevant class.
 */
export function getDesc<T>(code: NodeBuffer, pc: number, constantPool: ConstantPool.ConstantPool): T {
  return <T> constantPool.get(code.readUInt16BE(pc + 1)).deref();
}

/**
 * Stash an item into the constant pool.
 */
export function stashCPItem<T>(code: NodeBuffer, pc: number, constantPool: ConstantPool.ConstantPool, item: T): void {
  code.writeUInt16BE(constantPool.stash<T>(item), pc + 1);
}

/**
 * Retrieve a stashed item from the constant pool.
 */
export function getFromCPStash<T>(code: NodeBuffer, pc: number, constantPool: ConstantPool.ConstantPool): T {
  return constantPool.getFromStash<T>(code.readUInt16BE(pc + 1));
}

export var ArrayTypes : {[t: number]: string; } = {
  4: 'Z', 5: 'C', 6: 'F', 7: 'D', 8: 'B', 9: 'S', 10: 'I', 11: 'J'
};

export function getParamWordSize(signature: string): number {
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

export class Opcodes {
  /* 32-bit array load opcodes */

  /**
   * 32-bit array load opcode
   */
  private static _aload_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      idx = stack.pop(),
      obj = <java_object.JavaArray> stack.pop();
    if (!isNull(thread, frame, obj)) {
      var len = obj.array.length;
      if (idx < 0 || idx >= len) {
        throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', idx + " not in length " + len + " array of type " + obj.cls.get_type());
      } else {
        stack.push(obj.array[idx]);
        frame.pc++;
      }
    }
    // 'obj' is NULL. isNull threw an exception for us.
  }

  public static iaload = Opcodes._aload_32;
  public static faload = Opcodes._aload_32;
  public static aaload = Opcodes._aload_32;
  public static baload = Opcodes._aload_32;
  public static caload = Opcodes._aload_32;
  public static saload = Opcodes._aload_32;

  /* 64-bit array load opcodes */

  /**
   * 64-bit array load opcode.
   */
  private static _aload_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      idx = stack.pop(),
      obj = <java_object.JavaArray> stack.pop();
    if (!isNull(thread, frame, obj)) {
      var len = obj.array.length;
      if (idx < 0 || idx >= len) {
        throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', idx + " not in length " + len + " array of type " + obj.cls.get_type());
      } else {
        stack.push(obj.array[idx]);
        // 64-bit value.
        stack.push(null);
        frame.pc++;
      }
    }
    // 'obj' is NULL. isNull threw an exception for us.
  }

  public static daload = Opcodes._aload_64;
  public static laload = Opcodes._aload_64;

  /* 32-bit array store opcodes */

  /**
   * 32-bit array store.
   * @private
   */
  private static _astore_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      value = stack.pop(),
      idx = stack.pop(),
      obj = <java_object.JavaArray> stack.pop();
    if (!isNull(thread, frame, obj)) {
      var len = obj.array.length;
      if (idx < 0 || idx >= len) {
        throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', idx + " not in length " + len + " array of type " + obj.cls.get_type());
      } else {
        obj.array[idx] = value;
        frame.pc++;
      }
    }
    // 'obj' is NULL. isNull threw an exception for us.
  }

  public static iastore = Opcodes._astore_32;
  public static fastore = Opcodes._astore_32;
  public static aastore = Opcodes._astore_32;
  public static bastore = Opcodes._astore_32;
  public static castore = Opcodes._astore_32;
  public static sastore = Opcodes._astore_32;

  /* 64-bit array store opcodes */

  /**
   * 64-bit array store.
   * @private
   */
  private static _astore_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      value = pop2(stack),
      idx = stack.pop(),
      obj = <java_object.JavaArray> stack.pop();
    if (!isNull(thread, frame, obj)) {
      var len = obj.array.length;
      if (idx < 0 || idx >= len) {
        throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', idx + " not in length " + len + " array of type " + obj.cls.get_type());
      } else {
        obj.array[idx] = value;
        frame.pc++;
      }
    }
    // 'obj' is NULL. isNull threw an exception for us.
  }

  public static lastore = Opcodes._astore_64;
  public static dastore = Opcodes._astore_64;

  /* 32-bit constants */
  public static aconst_null(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(null);
    frame.pc++;
  }

  private static _const_0_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(0);
    frame.pc++;
  }

  private static _const_1_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(1);
    frame.pc++;
  }

  private static _const_2_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(2);
    frame.pc++;
  }

  public static iconst_m1(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(-1);
    frame.pc++;
  }

  public static iconst_0 = Opcodes._const_0_32;
  public static iconst_1 = Opcodes._const_1_32;
  public static iconst_2 = Opcodes._const_2_32;

  public static iconst_3(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(3);
    frame.pc++;
  }

  public static iconst_4(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(4);
    frame.pc++;
  }

  public static iconst_5(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(5);
    frame.pc++;
  }

  public static fconst_0 = Opcodes._const_0_32;
  public static fconst_1 = Opcodes._const_1_32;
  public static fconst_2 = Opcodes._const_2_32;

  /* 64-bit constants */
  public static lconst_0(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(gLong.ZERO, null);
    frame.pc++;
  }

  public static lconst_1(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(gLong.ONE, null);
    frame.pc++;
  }

  public static dconst_0(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(0, null);
    frame.pc++;
  }

  public static dconst_1(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(1, null);
    frame.pc++;
  }

  /* 32-bit load opcodes */
  private static _load_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:Buffer, pc:number) {
    frame.stack.push(frame.locals[code.readUInt8(pc + 1)]);
    frame.pc += 2;
  }

  private static _load_0_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(frame.locals[0]);
    frame.pc++;
  }

  private static _load_1_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(frame.locals[1]);
    frame.pc++;
  }

  private static _load_2_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(frame.locals[2]);
    frame.pc++;
  }

  private static _load_3_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(frame.locals[3]);
    frame.pc++;
  }

  public static iload = Opcodes._load_32;
  public static iload_0 = Opcodes._load_0_32;
  public static iload_1 = Opcodes._load_1_32;
  public static iload_2 = Opcodes._load_2_32;
  public static iload_3 = Opcodes._load_3_32;
  public static fload = Opcodes._load_32;
  public static fload_0 = Opcodes._load_0_32;
  public static fload_1 = Opcodes._load_1_32;
  public static fload_2 = Opcodes._load_2_32;
  public static fload_3 = Opcodes._load_3_32;
  public static aload = Opcodes._load_32;
  public static aload_0 = Opcodes._load_0_32;
  public static aload_1 = Opcodes._load_1_32;
  public static aload_2 = Opcodes._load_2_32;
  public static aload_3 = Opcodes._load_3_32;

  /* 64-bit load opcodes */
  private static _load_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:Buffer, pc:number) {
    frame.stack.push(frame.locals[code.readUInt8(pc + 1)], null);
    frame.pc += 2;
  }

  private static _load_0_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(frame.locals[0], null);
    frame.pc++;
  }

  private static _load_1_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(frame.locals[1], null);
    frame.pc++;
  }

  private static _load_2_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(frame.locals[2], null);
    frame.pc++;
  }

  private static _load_3_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(frame.locals[3], null);
    frame.pc++;
  }

  public static lload = Opcodes._load_64;
  public static lload_0 = Opcodes._load_0_64;
  public static lload_1 = Opcodes._load_1_64;
  public static lload_2 = Opcodes._load_2_64;
  public static lload_3 = Opcodes._load_3_64;
  public static dload = Opcodes._load_64;
  public static dload_0 = Opcodes._load_0_64;
  public static dload_1 = Opcodes._load_1_64;
  public static dload_2 = Opcodes._load_2_64;
  public static dload_3 = Opcodes._load_3_64;

  /* 32-bit store opcodes */
  private static _store_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:Buffer, pc:number) {
    frame.locals[code.readUInt8(pc + 1)] = frame.stack.pop();
    frame.pc += 2;
  }

  private static _store_0_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.locals[0] = frame.stack.pop();
    frame.pc++;
  }

  private static _store_1_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.locals[1] = frame.stack.pop();
    frame.pc++;
  }

  private static _store_2_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.locals[2] = frame.stack.pop();
    frame.pc++;
  }

  private static _store_3_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.locals[3] = frame.stack.pop();
    frame.pc++;
  }

  public static istore = Opcodes._store_32;
  public static istore_0 = Opcodes._store_0_32;
  public static istore_1 = Opcodes._store_1_32;
  public static istore_2 = Opcodes._store_2_32;
  public static istore_3 = Opcodes._store_3_32;
  public static fstore = Opcodes._store_32;
  public static fstore_0 = Opcodes._store_0_32;
  public static fstore_1 = Opcodes._store_1_32;
  public static fstore_2 = Opcodes._store_2_32;
  public static fstore_3 = Opcodes._store_3_32;
  public static astore = Opcodes._store_32;
  public static astore_0 = Opcodes._store_0_32;
  public static astore_1 = Opcodes._store_1_32;
  public static astore_2 = Opcodes._store_2_32;
  public static astore_3 = Opcodes._store_3_32;

  /* 64-bit store opcodes */
  private static _store_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:Buffer, pc:number) {
    var offset = code.readUInt8(pc + 1);
    // NULL
    frame.locals[offset + 1] = frame.stack.pop();
    // The actual value.
    frame.locals[offset] = frame.stack.pop();
    frame.pc += 2;
  }

  private static _store_0_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.locals[1] = frame.stack.pop();
    frame.locals[0] = frame.stack.pop();
    frame.pc++;
  }

  private static _store_1_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.locals[2] = frame.stack.pop();
    frame.locals[1] = frame.stack.pop();
    frame.pc++;
  }

  private static _store_2_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.locals[3] = frame.stack.pop();
    frame.locals[2] = frame.stack.pop();
    frame.pc++;
  }

  private static _store_3_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.locals[4] = frame.stack.pop();
    frame.locals[3] = frame.stack.pop();
    frame.pc++;
  }

  public static lstore = Opcodes._store_64;
  public static lstore_0 = Opcodes._store_0_64;
  public static lstore_1 = Opcodes._store_1_64;
  public static lstore_2 = Opcodes._store_2_64;
  public static lstore_3 = Opcodes._store_3_64;
  public static dstore = Opcodes._store_64;
  public static dstore_0 = Opcodes._store_0_64;
  public static dstore_1 = Opcodes._store_1_64;
  public static dstore_2 = Opcodes._store_2_64;
  public static dstore_3 = Opcodes._store_3_64;

  /* Misc. */

  public static sipush(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    frame.stack.push(code.readInt16BE(pc + 1));
    frame.pc += 3;
  }

  public static bipush(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    frame.stack.push(code.readInt8(pc + 1));
    frame.pc += 2;
  }

  public static pop(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.pop();
    frame.pc++;
  }

  public static pop2(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    // http://i.imgur.com/MieF0KG.jpg
    frame.stack.pop();
    frame.stack.pop();
    frame.pc++;
  }

  public static dup(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v = stack.pop();
    stack.push(v, v);
    frame.pc++;
  }

  public static dup_x1(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop();
    stack.push(v1, v2, v1);
    frame.pc++;
  }

  public static dup_x2(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop(),
      v3 = stack.pop();
    stack.push(v1, v3, v2, v1);
    frame.pc++;
  }

  public static dup2(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop();
    stack.push(v2, v1, v2, v1);
    frame.pc++;
  }

  public static dup2_x1(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop(),
      v3 = stack.pop();
    stack.push(v2, v1, v3, v2, v1);
    frame.pc++;
  }

  public static dup2_x2(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop(),
      v3 = stack.pop(),
      v4 = stack.pop();
    stack.push(v2, v1, v4, v3, v2, v1);
    frame.pc++;
  }

  public static swap(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v1 = stack.pop(),
      v2 = stack.pop();
    stack.push(v1, v2);
    frame.pc++;
  }

  /* Math Opcodes */
  public static iadd(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push((stack.pop() + stack.pop()) | 0);
    frame.pc++;
  }

  public static ladd(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    // push2
    stack.push(pop2(stack).add(pop2(stack)), null);
    frame.pc++;
  }

  public static fadd(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(util.wrap_float(stack.pop() + stack.pop()));
    frame.pc++;
  }

  public static dadd(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    // push2
    stack.push(pop2(stack) + pop2(stack), null);
    frame.pc++;
  }

  public static isub(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push((-stack.pop() + stack.pop()) | 0);
    frame.pc++;
  }

  public static fsub(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(util.wrap_float(-stack.pop() + stack.pop()));
    frame.pc++;
  }

  public static dsub(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(-pop2(stack) + pop2(stack), null);
    frame.pc++;
  }

  public static lsub(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).negate().add(pop2(stack)), null);
    frame.pc++;
  }

  public static imul(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(Math['imul'](stack.pop(), stack.pop()));
    frame.pc++;
  }

  public static lmul(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    // push2
    stack.push(pop2(stack).multiply(pop2(stack)), null);
    frame.pc++;
  }

  public static fmul(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(util.wrap_float(stack.pop() * stack.pop()));
    frame.pc++;
  }

  public static dmul(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack) * pop2(stack), null);
    frame.pc++;
  }

  public static idiv(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack, b:number = stack.pop(), a:number = stack.pop();
    if (b === 0) {
      throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
    } else {
      // spec: "if the dividend is the negative integer of largest possible magnitude
      // for the int type, and the divisor is -1, then overflow occurs, and the
      // result is equal to the dividend."
      if (a === enums.Constants.INT_MIN && b === -1) {
        stack.push(a);
      } else {
        stack.push((a / b) | 0);
      }
      frame.pc++;
    }
  }

  public static ldiv(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      b:gLong = pop2(stack),
      a:gLong = pop2(stack);
    if (b.isZero()) {
      throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
    } else {
      stack.push(a.div(b), null);
      frame.pc++;
    }
  }

  public static fdiv(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      a:number = stack.pop();
    stack.push(util.wrap_float(stack.pop() / a));
    frame.pc++;
  }

  public static ddiv(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v:number = pop2(stack);
    stack.push(pop2(stack) / v, null);
    frame.pc++;
  }

  public static irem(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      b:number = stack.pop(),
      a:number = stack.pop();
    if (b === 0) {
      throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
    } else {
      stack.push(a % b);
      frame.pc++;
    }
  }

  public static lrem(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      b:gLong = pop2(stack),
      a:gLong = pop2(stack);
    if (b.isZero()) {
      throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
    } else {
      stack.push(a.modulo(b), null);
      frame.pc++;
    }
  }

  public static frem(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      b:number = stack.pop();
    stack.push(stack.pop() % b);
    frame.pc++;
  }

  public static drem(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      b:number = pop2(stack);
    stack.push(pop2(stack) % b, null);
    frame.pc++;
  }

  public static ineg(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(-stack.pop() | 0);
    frame.pc++;
  }

  public static lneg(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).negate(), null);
    frame.pc++;
  }

  public static fneg(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(-stack.pop());
    frame.pc++;
  }

  public static dneg(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(-pop2(stack), null);
    frame.pc++;
  }

  /* Bitwise Operations */

  public static ishl(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s:number = stack.pop();
    stack.push(stack.pop() << s);
    frame.pc++;
  }

  public static lshl(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s:number = stack.pop();
    stack.push(pop2(stack).shiftLeft(gLong.fromInt(s)), null);
    frame.pc++;
  }

  public static ishr(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s:number = stack.pop();
    stack.push(stack.pop() >> s);
    frame.pc++;
  }

  public static lshr(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s:number = stack.pop();
    stack.push(pop2(stack).shiftRight(gLong.fromInt(s)), null);
    frame.pc++;
  }

  public static iushr(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s:number = stack.pop();
    stack.push((stack.pop() >>> s) | 0);
    frame.pc++;
  }

  public static lushr(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      s:number = stack.pop();
    stack.push(pop2(stack).shiftRightUnsigned(gLong.fromInt(s)), null);
    frame.pc++;
  }

  public static iand(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(stack.pop() & stack.pop());
    frame.pc++;
  }

  public static land(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).and(pop2(stack)), null);
    frame.pc++;
  }

  public static ior(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(stack.pop() | stack.pop());
    frame.pc++;
  }

  public static lor(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).or(pop2(stack)), null);
    frame.pc++;
  }

  public static ixor(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(stack.pop() ^ stack.pop());
    frame.pc++;
  }

  public static lxor(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(pop2(stack).xor(pop2(stack)), null);
    frame.pc++;
  }

  public static iinc(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var idx = code.readUInt8(pc + 1),
      val = code.readInt8(pc + 2);
    frame.locals[idx] = (frame.locals[idx] + val) | 0;
    frame.pc += 3;
  }

  public static i2l(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(gLong.fromInt(stack.pop()), null);
    frame.pc++;
  }

  public static i2f(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    // NOP; we represent ints as floats anyway.
    // @todo What about quantities unexpressable as floats?
    frame.pc++;
  }

  public static i2d(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(null);
    frame.pc++;
  }

  public static l2i(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    // Ignore NULL.
    stack.pop();
    stack.push(stack.pop().toInt());
    frame.pc++;
  }

  public static l2f(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    // Ignore NULL.
    stack.pop();
    stack.push(stack.pop().toNumber());
    frame.pc++;
  }

  public static l2d(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    // Ignore NULL.
    stack.pop();
    stack.push(stack.pop().toNumber(), null);
    frame.pc++;
  }

  public static f2i(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(util.float2int(stack.pop()));
    frame.pc++;
  }

  public static f2l(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(gLong.fromNumber(stack.pop()), null);
    frame.pc++;
  }

  public static f2d(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.stack.push(null);
    frame.pc++;
  }

  public static d2i(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.pop();
    stack.push(util.float2int(stack.pop()));
    frame.pc++;
  }

  public static d2l(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      d_val:number = pop2(stack);
    if (d_val === Number.POSITIVE_INFINITY) {
      stack.push(gLong.MAX_VALUE, null);
    } else if (d_val === Number.NEGATIVE_INFINITY) {
      stack.push(gLong.MIN_VALUE, null);
    } else {
      stack.push(gLong.fromNumber(d_val), null);
    }
    frame.pc++;
  }

  public static d2f(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.pop();
    stack.push(util.wrap_float(stack.pop()));
    frame.pc++;
  }

  public static i2b(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push((stack.pop() << 24) >> 24);
    frame.pc++;
  }

  public static i2c(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push(stack.pop() & 0xFFFF);
    frame.pc++;
  }

  public static i2s(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack;
    stack.push((stack.pop() << 16) >> 16);
    frame.pc++;
  }

  public static lcmp(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v2:gLong = pop2(stack);
    stack.push(pop2(stack).compare(v2));
    frame.pc++;
  }

  public static fcmpl(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v2 = stack.pop(),
      res = util.cmp(stack.pop(), v2);
    if (res == null) {
      stack.push(-1);
    } else {
      stack.push(res);
    }
    frame.pc++;
  }

  public static fcmpg(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v2 = stack.pop(),
      res = util.cmp(stack.pop(), v2);
    if (res == null) {
      stack.push(1);
    } else {
      stack.push(res);
    }
    frame.pc++;
  }

  public static dcmpl(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v2 = pop2(stack),
      res = util.cmp(pop2(stack), v2);
    if (res == null) {
      stack.push(-1);
    } else {
      stack.push(res);
    }
    frame.pc++;
  }

  public static dcmpg(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack,
      v2 = pop2(stack),
      res = util.cmp(pop2(stack), v2);
    if (res == null) {
      stack.push(1);
    } else {
      stack.push(res);
    }
    frame.pc++;
  }

  /* Unary branch opcodes */
  public static ifeq(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    if (frame.stack.pop() === 0) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static ifne(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    if (frame.stack.pop() !== 0) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static iflt(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    if (frame.stack.pop() < 0) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static ifge(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    if (frame.stack.pop() >= 0) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static ifgt(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    if (frame.stack.pop() > 0) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static ifle(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    if (frame.stack.pop() <= 0) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  /* Binary branch opcodes */
  public static if_icmpeq(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var v2 = frame.stack.pop();
    var v1 = frame.stack.pop();
    if (v1 === v2) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static if_icmpne(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var v2 = frame.stack.pop();
    var v1 = frame.stack.pop();
    if (v1 !== v2) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static if_icmplt(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var v2 = frame.stack.pop();
    var v1 = frame.stack.pop();
    if (v1 < v2) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static if_icmpge(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var v2 = frame.stack.pop();
    var v1 = frame.stack.pop();
    if (v1 >= v2) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static if_icmpgt(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var v2 = frame.stack.pop();
    var v1 = frame.stack.pop();
    if (v1 > v2) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static if_icmple(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var v2 = frame.stack.pop();
    var v1 = frame.stack.pop();
    if (v1 <= v2) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static if_acmpeq(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var v2 = frame.stack.pop();
    var v1 = frame.stack.pop();
    if (v1 === v2) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static if_acmpne(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var v2 = frame.stack.pop();
    var v1 = frame.stack.pop();
    if (v1 !== v2) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  /* Jump opcodes */
  public static goto(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    frame.pc += code.readInt16BE(pc + 1);
  }

  public static jsr(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    frame.stack.push(frame.pc + 3);
    frame.pc += code.readInt16BE(pc + 1);
  }

  public static ret(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    frame.pc = frame.locals[code.readUInt8(pc + 1)];
  }

  public static tableswitch(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    // Ignore padding bytes. The +1 is to skip the opcode byte.
    pc += ((4 - (pc + 1) % 4) % 4) + 1;
    var defaultOffset = code.readInt32BE(pc),
      low = code.readInt32BE(pc + 4),
      high = code.readInt32BE(pc + 8),
      offset = frame.stack.pop();

    if (offset >= low && offset <= high) {
      frame.pc += code.readInt32BE(pc + 12 + ((offset - low) * 4));
    } else {
      frame.pc += defaultOffset;
    }
  }

  public static lookupswitch(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    // Skip padding bytes. The +1 is to skip the opcode byte.
    pc += ((4 - (pc + 1) % 4) % 4) + 1;
    var defaultOffset = code.readInt32BE(pc),
      nPairs = code.readInt32BE(pc + 4),
      i:number,
      v:number = frame.stack.pop();

    pc += 8;
    for (i = 0; i < nPairs; i++) {
      if (code.readInt32BE(pc) === v) {
        frame.pc += code.readInt32BE(pc + 4);
        return;
      }
      pc += 8;
    }
    // No match found.
    frame.pc += defaultOffset;
  }

  public static return(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
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

  /* 32-bit return bytecodes */

  private static _return_32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
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

  public static ireturn = Opcodes._return_32;
  public static freturn = Opcodes._return_32;
  public static areturn = Opcodes._return_32;

  /* 64-bit return opcodes */

  private static _return_64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
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

  public static lreturn = Opcodes._return_64;
  public static dreturn = Opcodes._return_64;

  public static getstatic(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var fieldSpec = getDesc<ConstantPool.FieldReferenceValue>(code, pc, frame.method.cls.constant_pool),
      loader = frame.getLoader(),
      refCls = loader.getInitializedClass(thread, fieldSpec.class_desc);

    if (refCls != null) {
      // Get the *actual* class that owns this field.
      // This may not be initialized if it's an interface, so we need to check.
      var clsType = refCls.field_lookup(thread, fieldSpec.name).cls.get_type();
      if (clsType != null) {
        var cls = loader.getInitializedClass(thread, clsType);
        if (cls != null) {
          // Opcode is ready to execute! Rewrite to a 'fast' version,
          // and run the fast version.
          if (fieldSpec.type === 'J' || fieldSpec.type === 'D') {
            code.writeUInt8(enums.OpCode.GETSTATIC_FAST64, pc);
          } else {
            code.writeUInt8(enums.OpCode.GETSTATIC_FAST32, pc);
          }
          stashCPItem<StaticFieldStash>(code, pc, frame.method.cls.constant_pool, {cls: <ClassData.ReferenceClassData> cls, name: fieldSpec.name});
        } else {
          // Initialize clsType and rerun opcode
          initializeClass(thread, frame, clsType);
        }
      }
    } else {
      // Initialize fieldSpec.class and rerun opcode.
      initializeClass(thread, frame, fieldSpec.class_desc);
    }
  }

  /**
   * A fast version of getstatic that assumes that relevant classes are
   * initialized.
   *
   * Retrieves a 32-bit value.
   */
  public static getstatic_fast32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var fieldInfo = getFromCPStash<StaticFieldStash>(code, pc, frame.method.cls.constant_pool);
    frame.stack.push(fieldInfo.cls.static_get(thread, fieldInfo.name));
    frame.pc += 3;
  }

  /**
   * A fast version of getstatic that assumes that relevant classes are
   * initialized.
   *
   * Retrieves a 64-bit value.
   */
  public static getstatic_fast64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var fieldInfo = getFromCPStash<StaticFieldStash>(code, pc, frame.method.cls.constant_pool);
    frame.stack.push(fieldInfo.cls.static_get(thread, fieldInfo.name), null);
    frame.pc += 3;
  }

  public static putstatic(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var fieldSpec = getDesc<ConstantPool.FieldReferenceValue>(code, pc, frame.method.cls.constant_pool),
      loader = frame.getLoader(),
      refCls = loader.getInitializedClass(thread, fieldSpec.class_desc);

    if (refCls != null) {
      // Get the *actual* class that owns this field.
      // This may not be initialized if it's an interface, so we need to check.
      var clsType = refCls.field_lookup(thread, fieldSpec.name).cls.get_type();
      if (clsType != null) {
        var cls = loader.getInitializedClass(thread, clsType);
        if (cls != null) {
          // Opcode is ready to execute! Rewrite to a 'fast' version,
          // and run the fast version.
          if (fieldSpec.type === 'J' || fieldSpec.type === 'D') {
            code.writeUInt8(enums.OpCode.PUTSTATIC_FAST64, pc);
          } else {
            code.writeUInt8(enums.OpCode.PUTSTATIC_FAST32, pc);
          }
          stashCPItem<StaticFieldStash>(code, pc, frame.method.cls.constant_pool, {cls: <ClassData.ReferenceClassData> cls, name: fieldSpec.name});
        } else {
          // Initialize clsType and rerun opcode
          initializeClass(thread, frame, clsType);
        }
      }
    } else {
      // Initialize fieldSpec.class and rerun opcode.
      initializeClass(thread, frame, fieldSpec.class_desc);
    }
  }

  /**
   * A fast version of putstatic that assumes that relevant classes are
   * initialized.
   *
   * Puts a 32-bit value.
   */
  public static putstatic_fast32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var fieldInfo = getFromCPStash<StaticFieldStash>(code, pc, frame.method.cls.constant_pool);

    fieldInfo.cls.static_put(thread, fieldInfo.name, frame.stack.pop());
    frame.pc += 3;
  }

  /**
   * A fast version of putstatic that assumes that relevant classes are
   * initialized.
   *
   * Puts a 64-bit value.
   */
  public static putstatic_fast64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var fieldInfo = getFromCPStash<StaticFieldStash>(code, pc, frame.method.cls.constant_pool);

    fieldInfo.cls.static_put(thread, fieldInfo.name, pop2(frame.stack));
    frame.pc += 3;
  }

  public static getfield(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var fieldSpec = getDesc<ConstantPool.FieldReferenceValue>(code, pc, frame.method.cls.constant_pool),
      loader = frame.getLoader(),
      obj = frame.stack[frame.stack.length - 1];
    // Check if the object is null; if we do not do this before get_class, then
    // we might try to get a class that we have not initialized!
    if (!isNull(thread, frame, obj)) {
      // cls is guaranteed to be in the inheritance hierarchy of obj, so it must be
      // initialized. However, it may not be loaded in the current class's
      // ClassLoader...
      var cls = loader.getInitializedClass(thread, fieldSpec.class_desc);
      if (cls != null) {
        var field = cls.field_lookup(thread, fieldSpec.name);
        if (field != null) {
          if (fieldSpec.type == 'J' || fieldSpec.type == 'D') {
            code.writeUInt8(enums.OpCode.GETFIELD_FAST64, pc);
          } else {
            code.writeUInt8(enums.OpCode.GETFIELD_FAST32, pc);
          }
          stashCPItem(code, pc, frame.method.cls.constant_pool, field.cls.get_type() + fieldSpec.name);
          // Rerun opcode
        } else {
          // Field was NULL; field_lookup threw an exception for us.
          frame.returnToThreadLoop = true;
        }
      } else {
        // Alright, tell this class's ClassLoader to load the class.
        resolveClass(thread, frame, fieldSpec.class_desc);
      }
    }
  }

  public static getfield_fast32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var fieldName = getFromCPStash<string>(code, pc, frame.method.cls.constant_pool),
      stack = frame.stack, obj: java_object.JavaObject = stack.pop();
    if (!isNull(thread, frame, obj)) {
      var val = obj.get_field(thread, fieldName);
      if (val !== undefined) {
        stack.push(val);
        frame.pc += 3;
      } else {
        frame.returnToThreadLoop = true;
      }
    }
  }

  public static getfield_fast64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var fieldName = getFromCPStash<string>(code, pc, frame.method.cls.constant_pool),
      stack = frame.stack, obj: java_object.JavaObject = stack.pop();
    if (!isNull(thread, frame, obj)) {
      var val = obj.get_field(thread, fieldName);
      if (val !== undefined) {
        stack.push(val, null);
        frame.pc += 3;
      } else {
        frame.returnToThreadLoop = true;
      }
    }
  }

  public static putfield(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var fieldSpec = getDesc<ConstantPool.FieldReferenceValue>(code, pc, frame.method.cls.constant_pool),
      loader = frame.getLoader(),
      obj = frame.stack[frame.stack.length - ((fieldSpec.type == 'J' || fieldSpec.type == 'D') ? 3 : 2)];
    // Check if the object is null; if we do not do this before get_class, then
    // we might try to get a class that we have not initialized!
    if (!isNull(thread, frame, obj)) {
      // cls is guaranteed to be in the inheritance hierarchy of obj, so it must be
      // initialized. However, it may not be loaded in the current class's
      // ClassLoader...
      var cls = loader.getInitializedClass(thread, fieldSpec.class_desc);
      if (cls != null) {
        var field = cls.field_lookup(thread, fieldSpec.name);
        if (field != null) {
          if (fieldSpec.type == 'J' || fieldSpec.type == 'D') {
            code.writeUInt8(enums.OpCode.PUTFIELD_FAST64, pc);
          } else {
            code.writeUInt8(enums.OpCode.PUTFIELD_FAST32, pc);
          }
          stashCPItem(code, pc, frame.method.cls.constant_pool, field.cls.get_type() + fieldSpec.name);
          // Rerun opcode
        } else {
          // Field was NULL; field_lookup threw an exception for us.
          frame.returnToThreadLoop = true;
        }
      } else {
        // Alright, tell this class's ClassLoader to load the class.
        resolveClass(thread, frame, fieldSpec.class_desc);
      }
    }
  }

  public static putfield_fast32(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var stack = frame.stack,
      val = stack.pop(),
      obj: java_object.JavaObject = stack.pop(),
      fieldName = getFromCPStash<string>(code, pc, frame.method.cls.constant_pool);

    if (!isNull(thread, frame, obj)) {
      if (obj.set_field(thread, fieldName, val)) {
        frame.pc += 3;
      } else {
        // Field not found.
        frame.returnToThreadLoop = true;
      }
    }
    // NPE has been thrown.
  }

  public static putfield_fast64(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var stack = frame.stack,
      val = pop2(stack),
      obj: java_object.JavaObject = stack.pop(),
      fieldName = getFromCPStash<string>(code, pc, frame.method.cls.constant_pool);

    if (!isNull(thread, frame, obj)) {
      if (obj.set_field(thread, fieldName, val)) {
        frame.pc += 3;
      } else {
        // Field not found.
        frame.returnToThreadLoop = true;
      }
    }
    // NPE has been thrown.
  }

  public static invokevirtual(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var methodSpec = getDesc<ConstantPool.MethodDescriptor>(code, pc, frame.method.cls.constant_pool),
      cls = frame.getLoader().getInitializedClass(thread, methodSpec.class_desc),
      count = 1 + getParamWordSize(methodSpec.sig);
    if (cls != null) {
      var stack = frame.stack,
        obj:java_object.JavaObject = stack[stack.length - count];
      if (!isNull(thread, frame, obj)) {
        // Use the class of the *object*.
        var m = obj.cls.method_lookup(thread, methodSpec.sig);
        if (m != null) {
          thread.runMethod(m, m.takeArgs(stack));
          frame.returnToThreadLoop = true;
        } else {
          // Method could not be found, and an exception has been thrown.
          frame.returnToThreadLoop = true;
        }
      }
      // Object is NULL; NPE has been thrown.
    } else {
      // Initialize our class and rerun opcode.
      initializeClass(thread, frame, methodSpec.class_desc);
    }
  }

  public static invokeinterface(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var methodSpec = getDesc<ConstantPool.MethodDescriptor>(code, pc, frame.method.cls.constant_pool),
      cls = frame.getLoader().getInitializedClass(thread, methodSpec.class_desc),
      count = code.readUInt8(pc + 3);
    if (cls != null) {
      var stack = frame.stack,
        obj:java_object.JavaObject = stack[stack.length - count];
      if (!isNull(thread, frame, obj)) {
        // Use the class of the *object*.
        var m = obj.cls.method_lookup(thread, methodSpec.sig);
        if (m != null) {
          thread.runMethod(m, m.takeArgs(stack));
          frame.returnToThreadLoop = true;
        } else {
          // Method could not be found, and an exception has been thrown.
          frame.returnToThreadLoop = true;
        }
      }
      // Object is NULL; NPE has been thrown.
    } else {
      // Initialize our class and rerun opcode.
      initializeClass(thread, frame, methodSpec.class_desc);
    }
  }

  public static invokedynamic(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    throwException(thread, frame, "Ljava/lang/Error", "Invokedynamic not implemented.");
  }

  public static breakpoint(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    throwException(thread, frame, "Ljava/lang/Error", "breakpoint not implemented.");
  }

  public static invokespecial(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var methodSpec = getDesc<ConstantPool.MethodDescriptor>(code, pc, frame.method.cls.constant_pool),
      cls = frame.getLoader().getInitializedClass(thread, methodSpec.class_desc);
    if (cls != null) {
      var m = cls.method_lookup(thread, methodSpec.sig);
      if (m != null) {
        thread.runMethod(m, m.takeArgs(frame.stack));
        frame.returnToThreadLoop = true;
      } else {
        // Could not find method! An exception has been thrown.
        frame.returnToThreadLoop = true;
      }
    } else {
      // Initialize our class and rerun opcode.
      initializeClass(thread, frame, methodSpec.class_desc);
    }
  }

  // NOTE: Same implementation as invokespecial; difference is handled in takeArgs function.
  public static invokestatic(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var methodSpec = getDesc<ConstantPool.MethodDescriptor>(code, pc, frame.method.cls.constant_pool),
      cls = frame.getLoader().getInitializedClass(thread, methodSpec.class_desc);
    if (cls != null) {
      var m = cls.method_lookup(thread, methodSpec.sig);
      if (m != null) {
        thread.runMethod(m, m.takeArgs(frame.stack));
        frame.returnToThreadLoop = true;
      } else {
        // Could not find method! An exception has been thrown.
        frame.returnToThreadLoop = true;
      }
    } else {
      // Initialize our class and rerun opcode.
      initializeClass(thread, frame, methodSpec.class_desc);
    }
  }

  public static new(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var desc = getDesc<string>(code, pc, frame.method.cls.constant_pool),
      cls = frame.getLoader().getInitializedClass(thread, desc);
    if (cls != null) {
      // XXX: Check if this is a ClassLoader / Thread / other.
      if (cls.is_castable(thread.getBsCl().getResolvedClass('Ljava/lang/ClassLoader;'))) {
        code.writeUInt8(enums.OpCode.NEW_CL_FAST, pc);
      } else if (cls.is_castable(thread.getBsCl().getResolvedClass('Ljava/lang/Thread;'))) {
        code.writeUInt8(enums.OpCode.NEW_THREAD_FAST, pc);
      } else {
        code.writeUInt8(enums.OpCode.NEW_FAST, pc);
      }
      stashCPItem(code, pc, frame.method.cls.constant_pool, cls);
      // Return to thread, rerun opcode.
    } else {
      // Initialize type and rerun opcode.
      initializeClass(thread, frame, desc);
    }
  }

  public static new_cl_fast(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var cls = getFromCPStash<ClassData.ReferenceClassData>(code, pc, frame.method.cls.constant_pool);
    frame.stack.push(new ClassLoader.JavaClassLoaderObject(thread, cls));
    frame.pc += 3;
  }

  public static new_thread_fast(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var cls = getFromCPStash<ClassData.ReferenceClassData>(code, pc, frame.method.cls.constant_pool);
    frame.stack.push(thread.getThreadPool().newThread(cls));
    frame.pc += 3;
  }

  public static new_fast(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var cls = getFromCPStash<ClassData.ReferenceClassData>(code, pc, frame.method.cls.constant_pool);
    frame.stack.push(new JavaObject(cls));
    frame.pc += 3;
  }

  public static newarray(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var stack = frame.stack,
      type = "[" + ArrayTypes[code.readUInt8(pc + 1)],
      cls = frame.getLoader().getInitializedClass(thread, type),
      newArray = java_object.heapNewArray(thread, <ClassData.ArrayClassData> cls, stack.pop());
    // If newArray is undefined, then an exception was thrown.
    if (newArray !== undefined) {
      stack.push(newArray);
      frame.pc += 2;
    } else {
      frame.returnToThreadLoop = true;
    }
  }

  public static anewarray(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var desc = getDesc<string>(code, pc, frame.method.cls.constant_pool),
      // Make sure the component class is loaded.
      cls = frame.getLoader().getResolvedClass(desc);
    if (cls != null) {
      // Rewrite and rerun.
      code.writeUInt8(enums.OpCode.ANEWARRAY_FAST, pc);
      stashCPItem(code, pc, frame.method.cls.constant_pool, frame.getLoader().getResolvedClass("[" + desc));
    } else {
      // Load class and rerun opcode.
      resolveClass(thread, frame, desc);
    }
  }

  public static anewarray_fast(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var stack = frame.stack,
      newArray = java_object.heapNewArray(thread, getFromCPStash<ClassData.ArrayClassData>(code, pc, frame.method.cls.constant_pool), stack.pop());
    // If newArray is undefined, then an exception was thrown.
    if (newArray !== undefined) {
      stack.push(newArray);
      frame.pc += 3;
    } else {
      frame.returnToThreadLoop = true;
    }
  }

  public static arraylength(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack, obj:java_object.JavaArray = stack.pop();
    if (!isNull(thread, frame, obj)) {
      stack.push(obj.array.length);
      frame.pc++;
    }
    // obj is NULL. isNull threw an exception for us.
  }

  public static athrow(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    thread.throwException(frame.stack.pop());
    frame.returnToThreadLoop = true;
  }

  public static checkcast(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var desc = getDesc<string>(code, pc, frame.method.cls.constant_pool),
      // Ensure the class is loaded.
      cls = frame.getLoader().getResolvedClass(desc);
    if (cls != null) {
      // Rewrite to fast version, and re-execute.
      code.writeUInt8(enums.OpCode.CHECKCAST_FAST, pc);
      stashCPItem(code, pc, frame.method.cls.constant_pool, cls);
    } else {
      resolveClass(thread, frame, desc);
    }
  }

  public static checkcast_fast(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var cls = getFromCPStash<ClassData.ClassData>(code, pc, frame.method.cls.constant_pool),
      stack = frame.stack,
      o:java_object.JavaObject = stack[stack.length - 1];
    if ((o != null) && !o.cls.is_castable(cls)) {
      var target_class = cls.toExternalString();
      var candidate_class = o.cls.toExternalString();
      throwException(thread, frame, 'Ljava/lang/ClassCastException;', candidate_class + " cannot be cast to " + target_class);
    } else {
      // Success!
      frame.pc += 3;
    }
  }

  public static instanceof(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var desc = getDesc<string>(code, pc, frame.method.cls.constant_pool),
      loader = frame.getLoader(),
      cls = loader.getResolvedClass(desc);
    if (cls != null) {
      // Rewrite and rerun.
      code.writeUInt8(enums.OpCode.INSTANCEOF_FAST, pc);
      stashCPItem(code, pc, frame.method.cls.constant_pool, cls);
    } else {
      // Fetch class and rerun opcode.
      resolveClass(thread, frame, desc);
    }
  }

  public static instanceof_fast(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var cls = getFromCPStash<ClassData.ClassData>(code, pc, frame.method.cls.constant_pool),
      stack = frame.stack,
      o = stack.pop();
    stack.push(o != null ? o.cls.is_castable(cls) + 0 : 0);
    frame.pc += 3;
  }

  public static monitorenter(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var stack = frame.stack, monitorObj:java_object.JavaObject = stack.pop(),
      monitorEntered = () => {
        // [Note: Thread is now in the RUNNABLE state.]
        // Increment the PC.
        frame.pc++;
      };

    if (!monitorObj.getMonitor().enter(thread, monitorEntered)) {
      // Opcode failed. monitorEntered will be run once we own the monitor.
      // The thread is now in the BLOCKED state. Tell the frame to return to
      // the thread loop.
      frame.returnToThreadLoop = true;
    } else {
      monitorEntered();
    }
  }

  public static monitorexit(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    var monitorObj:java_object.JavaObject = frame.stack.pop();
    if (monitorObj.getMonitor().exit(thread)) {
      frame.pc++;
    } else {
      // monitorexit failed, and threw an exception.
      frame.returnToThreadLoop = true;
    }
  }

  public static multianewarray(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var desc = getDesc<string>(code, pc, frame.method.cls.constant_pool),
      cls = frame.getLoader().getInitializedClass(thread, desc);
    if (cls == null) {
      initializeClass(thread, frame, desc);
    } else {
      // Rewrite and rerun.
      code.writeUInt8(enums.OpCode.MULTIANEWARRAY_FAST, pc);
    }
  }

  public static multianewarray_fast(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    var desc = getDesc<string>(code, pc, frame.method.cls.constant_pool),
      stack = frame.stack,
      dim = code.readUInt8(pc + 3),
      counts = stack.splice(-dim, dim),
      newArray = java_object.heapMultiNewArray(thread, frame.getLoader(), desc, counts);
    // If newArray is undefined, an exception was thrown.
    if (newArray !== undefined) {
      stack.push(newArray);
      frame.pc += 4;
    } else {
      frame.returnToThreadLoop = true;
    }
  }

  public static ifnull(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code: NodeBuffer, pc:number) {
    if (frame.stack.pop() == null) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static ifnonnull(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code: NodeBuffer, pc:number) {
    if (frame.stack.pop() != null) {
      frame.pc += code.readInt16BE(pc + 1);
    } else {
      frame.pc += 3;
    }
  }

  public static goto_w(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code: NodeBuffer, pc:number) {
    frame.pc += code.readInt32BE(pc + 1);
  }

  public static jsr_w(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code:NodeBuffer, pc:number) {
    frame.stack.push(frame.pc + 5);
    frame.pc += code.readInt32BE(pc + 1);
  }

  public static nop(thread:threading.JVMThread, frame:threading.BytecodeStackFrame) {
    frame.pc += 1;
  }

  public static ldc(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code: NodeBuffer, pc:number) {
    var constant = frame.method.cls.constant_pool.get(code.readUInt8(pc + 1));
    switch (constant.type) {
      case 'String':
        frame.stack.push(thread.getThreadPool().getJVM().internString(constant.deref()));
        frame.pc += 2;
        break;
      case 'class':
        // Fetch the jclass object and push it on to the stack. Do not rerun
        // this opcode.
        var cdesc = constant.deref();
        thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
        frame.getLoader().resolveClass(thread, cdesc, (cdata: ClassData.ClassData) => {
          if (cdata != null) {
            frame.stack.push(cdata.get_class_object(thread));
            frame.pc += 2;
            thread.setStatus(enums.ThreadStatus.RUNNABLE);
          }
        }, false);
        frame.returnToThreadLoop = true;
        break;
      default:
        frame.stack.push(constant.value);
        frame.pc += 2;
        break;
    }
  }

  public static ldc_w(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code: NodeBuffer, pc:number) {
    var constant = frame.method.cls.constant_pool.get(code.readUInt16BE(pc + 1));
    switch (constant.type) {
      case 'String':
        frame.stack.push(thread.getThreadPool().getJVM().internString(constant.deref()));
        frame.pc += 3;
        break;
      case 'class':
        // Fetch the jclass object and push it on to the stack. Do not rerun
        // this opcode.
        var cdesc = constant.deref();
        thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
        frame.getLoader().resolveClass(thread, cdesc, (cdata: ClassData.ClassData) => {
          if (cdata != null) {
            frame.stack.push(cdata.get_class_object(thread));
            frame.pc += 3;
            thread.setStatus(enums.ThreadStatus.RUNNABLE);
          }
        }, false);
        frame.returnToThreadLoop = true;
        break;
      default:
        frame.stack.push(constant.value);
        frame.pc += 3;
        break;
    }
  }

  public static ldc2_w(thread:threading.JVMThread, frame:threading.BytecodeStackFrame, code: NodeBuffer, pc:number) {
    var constant = frame.method.cls.constant_pool.get(code.readUInt16BE(pc + 1));
    assert(constant.type !== 'String' && constant.type !== 'class', 'Invalid ldc_w constant pool type: ' + constant.type);
    frame.stack.push(constant.value, null);
    frame.pc += 3;
  }

  public static wide(thread: threading.JVMThread, frame: threading.BytecodeStackFrame, code: NodeBuffer, pc: number) {
    var index = code.readUInt16BE(pc + 2);
    // Increment PC before switch to avoid issue where ret chances PC and we
    // erroneously increment the PC further.
    frame.pc += 4;
    switch (code.readUInt8(pc + 1)) {
      case enums.OpCode.ILOAD:
      case enums.OpCode.FLOAD:
      case enums.OpCode.ALOAD:
        frame.stack.push(frame.locals[index]);
        break;
      case enums.OpCode.LLOAD:
      case enums.OpCode.DLOAD:
        frame.stack.push(frame.locals[index], null);
        break;
      case enums.OpCode.ISTORE:
      case enums.OpCode.FSTORE:
      case enums.OpCode.ASTORE:
        frame.locals[index] = frame.stack.pop();
        break;
      case enums.OpCode.LSTORE:
      case enums.OpCode.DSTORE:
        // NULL
        frame.locals[index + 1] = frame.stack.pop();
        // The actual value.
        frame.locals[index] = frame.stack.pop();
        break;
      case enums.OpCode.RET:
        frame.pc = frame.locals[index];
        break;
      case enums.OpCode.IINC:
        var value = code.readInt16BE(pc + 4);
        frame.locals[index] = (frame.locals[index] + value) | 0;
        // wide iinc has 2 extra bytes.
        frame.pc += 2;
        break;
    }
  }
}

export var LookupTable: OpcodeImplementation[] = new Array(0xff);
// Put in function closure to prevent scope pollution.
(() => {
  for (var i = 0; i < 0xff; i++) {
    if (enums.OpCode.hasOwnProperty("" + i)) {
      LookupTable[i] = Opcodes[enums.OpCode[i].toLowerCase()];
      assert(LookupTable[i] != null, "Missing implementation of opcode " + enums.OpCode[i]);
    }
  }
})();
