/**
 * Contains JVM opcode implementations for the JVM interpreter.
 */
// We use snake case for the opcode names so they match the JVM spec.
// As for typedef:memberVariableDeclarator, we disable this so we can have
// member variable opcodes without explicitly typing them as IOpcodeImplementation.
/* tslint:disable:variable-name typedef:memberVariableDeclarator */
import gLong from './gLong';
import {wrapFloat, float2int, descriptor2typestr} from './util';
import {ClassReference, FieldReference, MethodReference, InterfaceMethodReference, IConstantPoolItem, InvokeDynamic, ConstDouble, ConstLong} from './ConstantPool';
import {ClassData, ArrayClassData} from './ClassData';
import {JVMThread, BytecodeStackFrame} from './threading';
import {ThreadStatus, OpCode, ConstantPoolItemType, Constants} from './enums';
import assert from './assert';
import {Method} from './methods';
import * as JVMTypes from '../includes/JVMTypes';

/**
 * Interface for individual opcode implementations.
 */
export interface IOpcodeImplementation {
  (thread: JVMThread, frame: BytecodeStackFrame, code?: Buffer): void;
}

/**
 * Helper function: Checks if object is null. Throws a NullPointerException
 * if it is.
 * @return True if the object is null.
 */
export function isNull(thread: JVMThread, frame: BytecodeStackFrame, obj: any): boolean {
  if (obj == null) {
    throwException(thread, frame, 'Ljava/lang/NullPointerException;', '');
    return true;
  }
  return false;
}

/**
 * Helper function: Pops off two items, returns the second.
 */
export function pop2(opStack: any[]): any {
  // Ignore NULL.
  opStack.pop();
  return opStack.pop();
}

export function resolveCPItem(thread: JVMThread, frame: BytecodeStackFrame, cpItem: IConstantPoolItem): void {
  thread.setStatus(ThreadStatus.ASYNC_WAITING);
  cpItem.resolve(thread, frame.getLoader(), frame.method.cls, (status: boolean) => {
    if (status) {
      thread.setStatus(ThreadStatus.RUNNABLE);
    }
  }, false);
  frame.returnToThreadLoop = true;
}

export function initializeClassFromClass(thread: JVMThread, frame: BytecodeStackFrame, cls: ClassData): void {
  thread.setStatus(ThreadStatus.ASYNC_WAITING);
  cls.initialize(thread, (cdata: ClassData) => {
    if (cdata != null) {
      thread.setStatus(ThreadStatus.RUNNABLE);
    }
  }, false);
  frame.returnToThreadLoop = true;
}

/**
 * Helper function: Pauses the thread and initializes a class.
 */
export function initializeClass(thread: JVMThread, frame: BytecodeStackFrame, clsRef: ClassReference): void {
  thread.setStatus(ThreadStatus.ASYNC_WAITING);

  function initialize(cls: ClassData) {
    cls.initialize(thread, (cdata: ClassData) => {
      if (cdata != null) {
        thread.setStatus(ThreadStatus.RUNNABLE);
      }
    });
  }

  if (!clsRef.isResolved()) {
    clsRef.resolve(thread, frame.getLoader(), frame.method.cls, (status: boolean) => {
      if (status) {
        initialize(clsRef.cls);
      }
    }, false);
  } else {
    initialize(clsRef.cls);
  }
  frame.returnToThreadLoop = true;
}

/**
 * Interrupts the current method's execution and throws an exception.
 *
 * NOTE: This does *not* interrupt JavaScript control flow, so any opcode
 * calling this function must *return* and not do anything else.
 */
export function throwException<T extends JVMTypes.java_lang_Throwable>(thread: JVMThread, frame: BytecodeStackFrame, clsName: string, msg: string): void {
  thread.throwNewException<T>(clsName, msg);
  frame.returnToThreadLoop = true;
}

export var ArrayTypes : {[t: number]: string; } = {
  4: 'Z', 5: 'C', 6: 'F', 7: 'D', 8: 'B', 9: 'S', 10: 'I', 11: 'J'
};

/**
 * Contains definitions for all JVM opcodes.
 */
export class Opcodes {
  /* 32-bit array load opcodes */

  /**
   * 32-bit array load opcode
   */
  private static _aload_32(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      idx = opStack.pop(),
      obj = <JVMTypes.JVMArray<any>> opStack.pop();
    if (!isNull(thread, frame, obj)) {
      var len = obj.array.length;
      if (idx < 0 || idx >= len) {
        throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', `${idx} not in length ${len} array of type ${obj.getClass().getInternalName()}`);
      } else {
        opStack.push(obj.array[idx]);
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
  private static _aload_64(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      idx = opStack.pop(),
      obj = <JVMTypes.JVMArray<any>> opStack.pop();
    if (!isNull(thread, frame, obj)) {
      var len = obj.array.length;
      if (idx < 0 || idx >= len) {
        throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', `${idx} not in length ${len} array of type ${obj.getClass().getInternalName()}`);
      } else {
        opStack.push(obj.array[idx]);
        // 64-bit value.
        opStack.push(null);
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
  private static _astore_32(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      value = opStack.pop(),
      idx = opStack.pop(),
      obj = <JVMTypes.JVMArray<any>> opStack.pop();
    if (!isNull(thread, frame, obj)) {
      var len = obj.array.length;
      if (idx < 0 || idx >= len) {
        throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', `${idx} not in length ${len} array of type ${obj.getClass().getInternalName()}`);
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
  private static _astore_64(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      value = opStack.pop2(),
      idx = opStack.pop(),
      obj = <JVMTypes.JVMArray<any>> opStack.pop();
    if (!isNull(thread, frame, obj)) {
      var len = obj.array.length;
      if (idx < 0 || idx >= len) {
        throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', `${idx} not in length ${len} array of type ${obj.getClass().getInternalName()}`);
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
  public static aconst_null(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(null);
    frame.pc++;
  }

  private static _const_0_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(0);
    frame.pc++;
  }

  private static _const_1_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(1);
    frame.pc++;
  }

  private static _const_2_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(2);
    frame.pc++;
  }

  public static iconst_m1(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(-1);
    frame.pc++;
  }

  public static iconst_0 = Opcodes._const_0_32;
  public static iconst_1 = Opcodes._const_1_32;
  public static iconst_2 = Opcodes._const_2_32;

  public static iconst_3(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(3);
    frame.pc++;
  }

  public static iconst_4(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(4);
    frame.pc++;
  }

  public static iconst_5(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(5);
    frame.pc++;
  }

  public static fconst_0 = Opcodes._const_0_32;
  public static fconst_1 = Opcodes._const_1_32;
  public static fconst_2 = Opcodes._const_2_32;

  /* 64-bit constants */
  public static lconst_0(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.pushWithNull(gLong.ZERO);
    frame.pc++;
  }

  public static lconst_1(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.pushWithNull(gLong.ONE);
    frame.pc++;
  }

  public static dconst_0(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.pushWithNull(0);
    frame.pc++;
  }

  public static dconst_1(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.pushWithNull(1);
    frame.pc++;
  }

  /* 32-bit load opcodes */
  private static _load_32(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    frame.opStack.push(frame.locals[code[pc + 1]]);
    frame.pc += 2;
  }

  private static _load_0_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(frame.locals[0]);
    frame.pc++;
  }

  private static _load_1_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(frame.locals[1]);
    frame.pc++;
  }

  private static _load_2_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(frame.locals[2]);
    frame.pc++;
  }

  private static _load_3_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(frame.locals[3]);
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
  private static _load_64(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    frame.opStack.pushWithNull(frame.locals[code[pc + 1]]);
    frame.pc += 2;
  }

  private static _load_0_64(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.pushWithNull(frame.locals[0]);
    frame.pc++;
  }

  private static _load_1_64(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.pushWithNull(frame.locals[1]);
    frame.pc++;
  }

  private static _load_2_64(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.pushWithNull(frame.locals[2]);
    frame.pc++;
  }

  private static _load_3_64(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.pushWithNull(frame.locals[3]);
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
  private static _store_32(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    frame.locals[code[pc + 1]] = frame.opStack.pop();
    frame.pc += 2;
  }

  private static _store_0_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.locals[0] = frame.opStack.pop();
    frame.pc++;
  }

  private static _store_1_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.locals[1] = frame.opStack.pop();
    frame.pc++;
  }

  private static _store_2_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.locals[2] = frame.opStack.pop();
    frame.pc++;
  }

  private static _store_3_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.locals[3] = frame.opStack.pop();
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
  private static _store_64(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var offset = code[pc + 1];
    // NULL
    frame.locals[offset + 1] = frame.opStack.pop();
    // The actual value.
    frame.locals[offset] = frame.opStack.pop();
    frame.pc += 2;
  }

  private static _store_0_64(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.locals[1] = frame.opStack.pop();
    frame.locals[0] = frame.opStack.pop();
    frame.pc++;
  }

  private static _store_1_64(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.locals[2] = frame.opStack.pop();
    frame.locals[1] = frame.opStack.pop();
    frame.pc++;
  }

  private static _store_2_64(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.locals[3] = frame.opStack.pop();
    frame.locals[2] = frame.opStack.pop();
    frame.pc++;
  }

  private static _store_3_64(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.locals[4] = frame.opStack.pop();
    frame.locals[3] = frame.opStack.pop();
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

  public static sipush(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    frame.opStack.push(code.readInt16BE(pc + 1));
    frame.pc += 3;
  }

  public static bipush(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    frame.opStack.push(code.readInt8(pc + 1));
    frame.pc += 2;
  }

  public static pop(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.dropFromTop(1);
    frame.pc++;
  }

  public static pop2(thread: JVMThread, frame: BytecodeStackFrame) {
    // http://i.imgur.com/MieF0KG.jpg
    frame.opStack.dropFromTop(2);
    frame.pc++;
  }

  public static dup(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.dup();
    frame.pc++;
  }

  public static dup_x1(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.dup_x1();
    frame.pc++;
  }

  public static dup_x2(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.dup_x2();
    frame.pc++;
  }

  public static dup2(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.dup2();
    frame.pc++;
  }

  public static dup2_x1(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.dup2_x1();
    frame.pc++;
  }

  public static dup2_x2(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      v1 = opStack.pop(),
      v2 = opStack.pop(),
      v3 = opStack.pop(),
      v4 = opStack.pop();
    opStack.push6(v2, v1, v4, v3, v2, v1);
    frame.pc++;
  }

  public static swap(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.swap();
    frame.pc++;
  }

  /* Math Opcodes */
  public static iadd(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push((opStack.pop() + opStack.pop()) | 0);
    frame.pc++;
  }

  public static ladd(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(opStack.pop2().add(opStack.pop2()));
    frame.pc++;
  }

  public static fadd(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(wrapFloat(opStack.pop() + opStack.pop()));
    frame.pc++;
  }

  public static dadd(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(opStack.pop2() + opStack.pop2());
    frame.pc++;
  }

  public static isub(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push((-opStack.pop() + opStack.pop()) | 0);
    frame.pc++;
  }

  public static fsub(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(wrapFloat(-opStack.pop() + opStack.pop()));
    frame.pc++;
  }

  public static dsub(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(-opStack.pop2() + opStack.pop2());
    frame.pc++;
  }

  public static lsub(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(opStack.pop2().negate().add(opStack.pop2()));
    frame.pc++;
  }

  public static imul(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push((<any> Math).imul(opStack.pop(), opStack.pop()));
    frame.pc++;
  }

  public static lmul(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(opStack.pop2().multiply(opStack.pop2()));
    frame.pc++;
  }

  public static fmul(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(wrapFloat(opStack.pop() * opStack.pop()));
    frame.pc++;
  }

  public static dmul(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(opStack.pop2() * opStack.pop2());
    frame.pc++;
  }

  public static idiv(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack, b: number = opStack.pop(), a: number = opStack.pop();
    if (b === 0) {
      throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
    } else {
      // spec: "if the dividend is the negative integer of largest possible magnitude
      // for the int type, and the divisor is -1, then overflow occurs, and the
      // result is equal to the dividend."
      if (a === Constants.INT_MIN && b === -1) {
        opStack.push(a);
      } else {
        opStack.push((a / b) | 0);
      }
      frame.pc++;
    }
  }

  public static ldiv(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      b: gLong = opStack.pop2(),
      a: gLong = opStack.pop2();
    if (b.isZero()) {
      throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
    } else {
      opStack.pushWithNull(a.div(b));
      frame.pc++;
    }
  }

  public static fdiv(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      a: number = opStack.pop();
    opStack.push(wrapFloat(opStack.pop() / a));
    frame.pc++;
  }

  public static ddiv(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      v: number = opStack.pop2();
    opStack.pushWithNull(opStack.pop2() / v);
    frame.pc++;
  }

  public static irem(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      b: number = opStack.pop(),
      a: number = opStack.pop();
    if (b === 0) {
      throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
    } else {
      opStack.push(a % b);
      frame.pc++;
    }
  }

  public static lrem(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      b: gLong = opStack.pop2(),
      a: gLong = opStack.pop2();
    if (b.isZero()) {
      throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
    } else {
      opStack.pushWithNull(a.modulo(b));
      frame.pc++;
    }
  }

  public static frem(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      b: number = opStack.pop();
    opStack.push(opStack.pop() % b);
    frame.pc++;
  }

  public static drem(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      b: number = opStack.pop2();
    opStack.pushWithNull(opStack.pop2() % b);
    frame.pc++;
  }

  public static ineg(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(-opStack.pop() | 0);
    frame.pc++;
  }

  public static lneg(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(opStack.pop2().negate());
    frame.pc++;
  }

  public static fneg(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(-opStack.pop());
    frame.pc++;
  }

  public static dneg(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(-opStack.pop2());
    frame.pc++;
  }

  /* Bitwise Operations */

  public static ishl(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      s: number = opStack.pop();
    opStack.push(opStack.pop() << s);
    frame.pc++;
  }

  public static lshl(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      s: number = opStack.pop();
    opStack.pushWithNull(opStack.pop2().shiftLeft(gLong.fromInt(s)));
    frame.pc++;
  }

  public static ishr(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      s: number = opStack.pop();
    opStack.push(opStack.pop() >> s);
    frame.pc++;
  }

  public static lshr(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      s: number = opStack.pop();
    opStack.pushWithNull(opStack.pop2().shiftRight(gLong.fromInt(s)));
    frame.pc++;
  }

  public static iushr(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      s: number = opStack.pop();
    opStack.push((opStack.pop() >>> s) | 0);
    frame.pc++;
  }

  public static lushr(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      s: number = opStack.pop();
    opStack.pushWithNull(opStack.pop2().shiftRightUnsigned(gLong.fromInt(s)));
    frame.pc++;
  }

  public static iand(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(opStack.pop() & opStack.pop());
    frame.pc++;
  }

  public static land(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(opStack.pop2().and(opStack.pop2()));
    frame.pc++;
  }

  public static ior(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(opStack.pop() | opStack.pop());
    frame.pc++;
  }

  public static lor(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(opStack.pop2().or(opStack.pop2()));
    frame.pc++;
  }

  public static ixor(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(opStack.pop() ^ opStack.pop());
    frame.pc++;
  }

  public static lxor(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(opStack.pop2().xor(opStack.pop2()));
    frame.pc++;
  }

  public static iinc(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var idx = code[pc + 1],
      val = code.readInt8(pc + 2);
    frame.locals[idx] = (frame.locals[idx] + val) | 0;
    frame.pc += 3;
  }

  public static i2l(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(gLong.fromInt(opStack.pop()));
    frame.pc++;
  }

  public static i2f(thread: JVMThread, frame: BytecodeStackFrame) {
    // NOP; we represent ints as floats anyway.
    // @todo What about quantities unexpressable as floats?
    frame.pc++;
  }

  public static i2d(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(null);
    frame.pc++;
  }

  public static l2i(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(opStack.pop2().toInt());
    frame.pc++;
  }

  public static l2f(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(opStack.pop2().toNumber());
    frame.pc++;
  }

  public static l2d(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(opStack.pop2().toNumber());
    frame.pc++;
  }

  public static f2i(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(float2int(opStack.pop()));
    frame.pc++;
  }

  public static f2l(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pushWithNull(gLong.fromNumber(opStack.pop()));
    frame.pc++;
  }

  public static f2d(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.opStack.push(null);
    frame.pc++;
  }

  public static d2i(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(float2int(opStack.pop2()));
    frame.pc++;
  }

  public static d2l(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      d_val: number = opStack.pop2();
    if (d_val === Number.POSITIVE_INFINITY) {
      opStack.pushWithNull(gLong.MAX_VALUE);
    } else if (d_val === Number.NEGATIVE_INFINITY) {
      opStack.pushWithNull(gLong.MIN_VALUE);
    } else {
      opStack.pushWithNull(gLong.fromNumber(d_val));
    }
    frame.pc++;
  }

  public static d2f(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.pop();
    opStack.push(wrapFloat(opStack.pop()));
    frame.pc++;
  }

  public static i2b(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push((opStack.pop() << 24) >> 24);
    frame.pc++;
  }

  public static i2c(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push(opStack.pop() & 0xFFFF);
    frame.pc++;
  }

  public static i2s(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack;
    opStack.push((opStack.pop() << 16) >> 16);
    frame.pc++;
  }

  public static lcmp(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      v2: gLong = opStack.pop2();
    opStack.push(opStack.pop2().compare(v2));
    frame.pc++;
  }

  public static fcmpl(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      v2 = opStack.pop(),
      v1 = opStack.pop();
    if (v1 === v2) {
      opStack.push(0);
    } else if (v1 > v2) {
      opStack.push(1);
    } else {
      // v1 < v2, and if v1 or v2 is NaN.
      opStack.push(-1);
    }
    frame.pc++;
  }

  public static fcmpg(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      v2 = opStack.pop(),
      v1 = opStack.pop();
    if (v1 === v2) {
      opStack.push(0);
    } else if (v1 < v2) {
      opStack.push(-1);
    } else {
      // v1 > v2, and if v1 or v2 is NaN.
      opStack.push(1);
    }
    frame.pc++;
  }

  public static dcmpl(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      v2 = opStack.pop2(),
      v1 = opStack.pop2();
    if (v1 === v2) {
      opStack.push(0);
    } else if (v1 > v2) {
      opStack.push(1);
    } else {
      // v1 < v2, and if v1 or v2 is NaN.
      opStack.push(-1);
    }
    frame.pc++;
  }

  public static dcmpg(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack,
      v2 = opStack.pop2(),
      v1 = opStack.pop2();
    if (v1 === v2) {
      opStack.push(0);
    } else if (v1 < v2) {
      opStack.push(-1);
    } else {
      // v1 > v2, and if v1 or v2 is NaN.
      opStack.push(1);
    }
    frame.pc++;
  }

  /* Unary branch opcodes */
  public static ifeq(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    if (frame.opStack.pop() === 0) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static ifne(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    if (frame.opStack.pop() !== 0) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static iflt(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    if (frame.opStack.pop() < 0) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static ifge(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    if (frame.opStack.pop() >= 0) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static ifgt(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    if (frame.opStack.pop() > 0) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static ifle(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    if (frame.opStack.pop() <= 0) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  /* Binary branch opcodes */
  public static if_icmpeq(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var v2 = frame.opStack.pop();
    var v1 = frame.opStack.pop();
    if (v1 === v2) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static if_icmpne(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var v2 = frame.opStack.pop();
    var v1 = frame.opStack.pop();
    if (v1 !== v2) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static if_icmplt(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var v2 = frame.opStack.pop();
    var v1 = frame.opStack.pop();
    if (v1 < v2) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static if_icmpge(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var v2 = frame.opStack.pop();
    var v1 = frame.opStack.pop();
    if (v1 >= v2) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static if_icmpgt(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var v2 = frame.opStack.pop();
    var v1 = frame.opStack.pop();
    if (v1 > v2) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static if_icmple(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var v2 = frame.opStack.pop();
    var v1 = frame.opStack.pop();
    if (v1 <= v2) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static if_acmpeq(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var v2 = frame.opStack.pop();
    var v1 = frame.opStack.pop();
    if (v1 === v2) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static if_acmpne(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var v2 = frame.opStack.pop();
    var v1 = frame.opStack.pop();
    if (v1 !== v2) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  /* Jump opcodes */
  public static goto(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    const offset = code.readInt16BE(pc + 1);
    frame.pc += offset;
    if (offset < 0) {
      frame.method.incrBBEntries();
    }
  }

  public static jsr(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    frame.opStack.push(pc + 3);
    const offset = code.readInt16BE(pc + 1);
    frame.pc += offset;
    if (offset < 0) {
      frame.method.incrBBEntries();
    }
  }

  public static ret(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    frame.pc = frame.locals[code[pc + 1]];
  }

  public static tableswitch(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    let pc = frame.pc;
    // Ignore padding bytes. The +1 is to skip the opcode byte.
    pc += ((4 - (pc + 1) % 4) % 4) + 1;
    var defaultOffset = code.readInt32BE(pc),
      low = code.readInt32BE(pc + 4),
      high = code.readInt32BE(pc + 8),
      offset = frame.opStack.pop();

    if (offset >= low && offset <= high) {
      frame.pc += code.readInt32BE(pc + 12 + ((offset - low) * 4));
    } else {
      frame.pc += defaultOffset;
    }
  }

  public static lookupswitch(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    let pc = frame.pc;
    // Skip padding bytes. The +1 is to skip the opcode byte.
    pc += ((4 - (pc + 1) % 4) % 4) + 1;
    var defaultOffset = code.readInt32BE(pc),
      nPairs = code.readInt32BE(pc + 4),
      i: number,
      v: number = frame.opStack.pop();

    pc += 8;
    for (i = 0; i < nPairs; i++) {
      if (code.readInt32BE(pc) === v) {
        const offset = code.readInt32BE(pc + 4);
        frame.pc += offset;
        if (offset < 0) {
          frame.method.incrBBEntries();
        }
        return;
      }
      pc += 8;
    }
    // No match found.
    frame.pc += defaultOffset;
  }

  public static return(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.returnToThreadLoop = true;
    if (frame.method.accessFlags.isSynchronized()) {
      // monitorexit
      if (!frame.method.methodLock(thread, frame).exit(thread)) {
        // monitorexit threw an exception.
        return;
      }
    }
    thread.asyncReturn();
  }

  /* 32-bit return bytecodes */

  private static _return_32(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.returnToThreadLoop = true;
    if (frame.method.accessFlags.isSynchronized()) {
      // monitorexit
      if (!frame.method.methodLock(thread, frame).exit(thread)) {
        // monitorexit threw an exception.
        return;
      }
    }
    thread.asyncReturn(frame.opStack.bottom());
  }

  public static ireturn = Opcodes._return_32;
  public static freturn = Opcodes._return_32;
  public static areturn = Opcodes._return_32;

  /* 64-bit return opcodes */

  private static _return_64(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.returnToThreadLoop = true;
    if (frame.method.accessFlags.isSynchronized()) {
      // monitorexit
      if (!frame.method.methodLock(thread, frame).exit(thread)) {
        // monitorexit threw an exception.
        return;
      }
    }
    thread.asyncReturn(frame.opStack.bottom(), null);
  }

  public static lreturn = Opcodes._return_64;
  public static dreturn = Opcodes._return_64;

  public static getstatic(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    assert(fieldInfo.getType() === ConstantPoolItemType.FIELDREF);
    if (fieldInfo.isResolved()) {
      // Get the *actual* class that owns this field.
      // This may not be initialized if it's an interface, so we need to check.
      var fieldOwnerCls = fieldInfo.field.cls;
      if (fieldOwnerCls.isInitialized(thread)) {
        // Opcode is ready to execute! Rewrite to a 'fast' version,
        // and run the fast version.
        if (fieldInfo.nameAndTypeInfo.descriptor === 'J' || fieldInfo.nameAndTypeInfo.descriptor === 'D') {
          code[pc] = OpCode.GETSTATIC_FAST64;
        } else {
          code[pc] = OpCode.GETSTATIC_FAST32;
        }
        // Stash the result of field lookup.
        fieldInfo.fieldOwnerConstructor = fieldOwnerCls.getConstructor(thread);
      } else {
        // Initialize class and rerun opcode
        initializeClassFromClass(thread, frame, fieldOwnerCls);
      }
    } else {
      // Resolve the field.
      resolveCPItem(thread, frame, fieldInfo);
    }
  }

  /**
   * A fast version of getstatic that assumes that relevant classes are
   * initialized.
   *
   * Retrieves a 32-bit value.
   */
  public static getstatic_fast32(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    frame.opStack.push(fieldInfo.fieldOwnerConstructor[fieldInfo.fullFieldName]);
    frame.pc += 3;
  }

  /**
   * A fast version of getstatic that assumes that relevant classes are
   * initialized.
   *
   * Retrieves a 64-bit value.
   */
  public static getstatic_fast64(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    frame.opStack.pushWithNull(fieldInfo.fieldOwnerConstructor[fieldInfo.fullFieldName]);
    frame.pc += 3;
  }

  public static putstatic(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    assert(fieldInfo.getType() === ConstantPoolItemType.FIELDREF);

    if (fieldInfo.isResolved()) {
      // Get the *actual* class that owns this field.
      // This may not be initialized if it's an interface, so we need to check.
      var fieldOwnerCls = fieldInfo.field.cls;
      if (fieldOwnerCls.isInitialized(thread)) {
        // Opcode is ready to execute! Rewrite to a 'fast' version,
        // and run the fast version.
        if (fieldInfo.nameAndTypeInfo.descriptor === 'J' || fieldInfo.nameAndTypeInfo.descriptor === 'D') {
          code[pc] = OpCode.PUTSTATIC_FAST64;
        } else {
          code[pc] = OpCode.PUTSTATIC_FAST32;
        }
        // Stash the result of field lookup.
        fieldInfo.fieldOwnerConstructor = fieldOwnerCls.getConstructor(thread);
      } else {
        // Initialize class and rerun opcode
        initializeClassFromClass(thread, frame, fieldOwnerCls);
      }
    } else {
      // Resolve the field.
      resolveCPItem(thread, frame, fieldInfo);
    }
  }

  /**
   * A fast version of putstatic that assumes that relevant classes are
   * initialized.
   *
   * Puts a 32-bit value.
   */
  public static putstatic_fast32(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    fieldInfo.fieldOwnerConstructor[fieldInfo.fullFieldName] = frame.opStack.pop();
    frame.pc += 3;
  }

  /**
   * A fast version of putstatic that assumes that relevant classes are
   * initialized.
   *
   * Puts a 64-bit value.
   */
  public static putstatic_fast64(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    fieldInfo.fieldOwnerConstructor[fieldInfo.fullFieldName] = frame.opStack.pop2();
    frame.pc += 3;
  }

  public static getfield(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      loader = frame.getLoader(),
      obj = frame.opStack.top();
    assert(fieldInfo.getType() === ConstantPoolItemType.FIELDREF);
    // Check if the object is null; if we do not do this before get_class, then
    // we might try to get a class that we have not initialized!
    if (!isNull(thread, frame, obj)) {
      // cls is guaranteed to be in the inheritance hierarchy of obj, so it must be
      // initialized. However, it may not be loaded in the current class's
      // ClassLoader...
      if (fieldInfo.isResolved()) {
        var field = fieldInfo.field;
        if (field.rawDescriptor == 'J' || field.rawDescriptor == 'D') {
          code[pc] = OpCode.GETFIELD_FAST64;
        } else {
          code[pc] = OpCode.GETFIELD_FAST32;
        }
        // Rerun opcode
      } else {
        resolveCPItem(thread, frame, fieldInfo);
      }
    }
  }

  public static getfield_fast32(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      opStack = frame.opStack, obj: JVMTypes.java_lang_Object = opStack.pop();
    if (!isNull(thread, frame, obj)) {
      opStack.push((<any> obj)[fieldInfo.fullFieldName]);
      frame.pc += 3;
    }
  }

  public static getfield_fast64(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      opStack = frame.opStack, obj: JVMTypes.java_lang_Object = opStack.pop();
    if (!isNull(thread, frame, obj)) {
      opStack.pushWithNull((<any> obj)[fieldInfo.fullFieldName]);
      frame.pc += 3;
    }
  }

  public static putfield(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      loader = frame.getLoader(),
      isLong = fieldInfo.nameAndTypeInfo.descriptor == 'J' || fieldInfo.nameAndTypeInfo.descriptor == 'D',
      obj = frame.opStack.fromTop(isLong ? 2 : 1);
    assert(fieldInfo.getType() === ConstantPoolItemType.FIELDREF);

    // Check if the object is null; if we do not do this before get_class, then
    // we might try to get a class that we have not initialized!
    if (!isNull(thread, frame, obj)) {
      // cls is guaranteed to be in the inheritance hierarchy of obj, so it must be
      // initialized. However, it may not be loaded in the current class's
      // ClassLoader...
      if (fieldInfo.isResolved()) {
        var field = fieldInfo.field;
        if (isLong) {
          code[pc] = OpCode.PUTFIELD_FAST64;
        } else {
          code[pc] = OpCode.PUTFIELD_FAST32;
        }
        // Stash the resolved full field name.
        fieldInfo.fullFieldName = `${descriptor2typestr(field.cls.getInternalName())}/${fieldInfo.nameAndTypeInfo.name}`;
        // Rerun opcode
      } else {
        resolveCPItem(thread, frame, fieldInfo);
      }
    }
  }

  public static putfield_fast32(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var opStack = frame.opStack,
      val = opStack.pop(),
      obj: JVMTypes.java_lang_Object = opStack.pop(),
      fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));

    if (!isNull(thread, frame, obj)) {
      (<any> obj)[fieldInfo.fullFieldName] = val;
      frame.pc += 3;
    }
    // NPE has been thrown.
  }

  public static putfield_fast64(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var opStack = frame.opStack,
      val = opStack.pop2(),
      obj: JVMTypes.java_lang_Object = opStack.pop(),
      fieldInfo = <FieldReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));

    if (!isNull(thread, frame, obj)) {
      (<any> obj)[fieldInfo.fullFieldName] = val;
      frame.pc += 3;
    }
    // NPE has been thrown.
  }

  public static invokevirtual(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <MethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));

    // Ensure referenced class is loaded in the current classloader.
    // Even though we don't use this class for anything, and we know that it
    // must be loaded because it is in the object's inheritance hierarchy,
    // it needs to be present in the current classloader.
    if (methodReference.isResolved()) {
      var m = methodReference.method;
      if (m.isSignaturePolymorphic()) {
        switch (m.name) {
          case 'invokeBasic':
            code[pc] = OpCode.INVOKEBASIC;
            break;
          case 'invoke':
          case 'invokeExact':
            code[pc] = OpCode.INVOKEHANDLE;
            break;
          default:
            throwException(thread, frame, 'Ljava/lang/AbstractMethodError;', `Invalid signature polymorphic method: ${m.cls.getExternalName()}.${m.name}`);
            break;
        }
      } else {
        code[pc] = OpCode.INVOKEVIRTUAL_FAST;
      }
    } else {
      resolveCPItem(thread, frame, methodReference);
    }
  }

  public static invokeinterface(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <InterfaceMethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    if (methodReference.isResolved()) {
      if (methodReference.method.cls.isInitialized(thread)) {
        // Rewrite to fast and rerun.
        code[pc] = OpCode.INVOKEINTERFACE_FAST;
      } else {
        // Initialize our class and rerun opcode.
        // Note that the existance of an object of an interface type does *not*
        // mean that the interface is initialized!
        initializeClass(thread, frame, methodReference.classInfo);
      }
    } else {
      resolveCPItem(thread, frame, methodReference);
    }
  }

  public static invokedynamic(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var callSiteSpecifier = <InvokeDynamic> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    callSiteSpecifier.constructCallSiteObject(thread, frame.getLoader(), frame.method.cls, pc, (status: boolean) => {
      if (status) {
        assert(typeof(callSiteSpecifier.getCallSiteObject(pc)[0].vmtarget) === 'function', "MethodName should be resolved...");
        code[pc] = OpCode.INVOKEDYNAMIC_FAST;
        // Resume and rerun fast opcode.
        thread.setStatus(ThreadStatus.RUNNABLE);
      }
    });
    frame.returnToThreadLoop = true;
  }

  /**
   * XXX: Actually perform superclass method lookup.
   */
  public static invokespecial(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <MethodReference | InterfaceMethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    if (methodReference.isResolved()) {
      // Rewrite and rerun.
      code[pc] = OpCode.INVOKENONVIRTUAL_FAST;
    } else {
      resolveCPItem(thread, frame, methodReference);
    }
  }

  public static invokestatic(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <MethodReference | InterfaceMethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    if (methodReference.isResolved()) {
      var m = methodReference.method;
      if (m.cls.isInitialized(thread)) {
        var newOpcode: OpCode = OpCode.INVOKESTATIC_FAST;
        if (methodReference.method.isSignaturePolymorphic()) {
          switch (methodReference.method.name) {
            case 'linkToInterface':
            case 'linkToVirtual':
              newOpcode = OpCode.LINKTOVIRTUAL;
              break;
            case 'linkToStatic':
            case 'linkToSpecial':
              newOpcode = OpCode.LINKTOSPECIAL;
              break;
            default:
              assert(false, "Should be impossible.");
              break;
          }
        }
        // Rewrite and rerun.
        code[pc] = newOpcode;
      } else {
        initializeClassFromClass(thread, frame, m.cls);
      }
    } else {
      resolveCPItem(thread, frame, methodReference);
    }
  }

  /// Fast invoke opcodes.

  public static invokenonvirtual_fast(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <MethodReference | InterfaceMethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      opStack = frame.opStack, paramSize = methodReference.paramWordSize,
      obj: JVMTypes.java_lang_Object = opStack.fromTop(paramSize);

    if (!isNull(thread, frame, obj)) {
      var args = opStack.sliceFromTop(paramSize);
      opStack.dropFromTop(paramSize + 1);
      assert(typeof (<any> obj)[methodReference.fullSignature] === 'function', `Resolved method ${methodReference.fullSignature} isn't defined?!`, thread);
      (<any> obj)[methodReference.fullSignature](thread, args);
      frame.returnToThreadLoop = true;
    }
  }

  public static invokestatic_fast(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <MethodReference | InterfaceMethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      opStack = frame.opStack, paramSize = methodReference.paramWordSize,
      args = opStack.sliceAndDropFromTop(paramSize);
    assert(methodReference.jsConstructor != null, "jsConstructor is missing?!");
    assert(typeof(methodReference.jsConstructor[methodReference.fullSignature]) === 'function', "Resolved method isn't defined?!");
    methodReference.jsConstructor[methodReference.fullSignature](thread, args);
    frame.returnToThreadLoop = true;
  }

  public static invokevirtual_fast(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <MethodReference | InterfaceMethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      count = methodReference.paramWordSize,
      opStack = frame.opStack,
      obj: JVMTypes.java_lang_Object = opStack.fromTop(count);
    if (!isNull(thread, frame, obj)) {
      // Use the class of the *object*.
      assert(typeof (<any> obj)[methodReference.signature] === 'function', `Resolved method ${methodReference.signature} isn't defined?!`);
      (<any> obj)[methodReference.signature](thread, opStack.sliceFromTop(count));
      opStack.dropFromTop(count + 1);
      frame.returnToThreadLoop = true;
    }
    // Object is NULL; NPE has been thrown.
  }

  public static invokeinterface_fast = Opcodes.invokevirtual_fast;

  public static invokedynamic_fast(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var callSiteSpecifier = <InvokeDynamic> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      cso = callSiteSpecifier.getCallSiteObject(pc),
      appendix = cso[1],
      fcn = cso[0].vmtarget,
      opStack = frame.opStack, paramSize = callSiteSpecifier.paramWordSize,
      args = opStack.sliceAndDropFromTop(paramSize);

    if (appendix !== null) {
      args.push(appendix);
    }
    fcn(thread, null, args);
    frame.returnToThreadLoop = true;
  }

  /**
   * Opcode for MethodHandle.invoke and MethodHandle.invokeExact.
   */
  public static invokehandle(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <MethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      opStack = frame.opStack,
      fcn = methodReference.memberName.vmtarget,
      // Add in 1 for the method handle itself.
      paramSize = methodReference.paramWordSize + 1,
      appendix = methodReference.appendix,
      args = opStack.sliceFromTop(paramSize);

    if (appendix !== null) {
      args.push(appendix);
    }

    if (!isNull(thread, frame, args[0])) {
      opStack.dropFromTop(paramSize);
      // fcn will handle invoking 'this' and such.
      // TODO: If this can be varargs, pass in parameter types to the function.
      fcn(thread, null, args);
      frame.returnToThreadLoop = true;
    }
  }

  /**
   * Opcode for MethodHandle.invokeBasic.
   * Unlike invoke/invokeExact, invokeBasic does not call a generated bytecode
   * method. It calls the vmtarget embedded in the MethodHandler directly.
   * This can cause crashes with malformed calls, thus it is only accesssible
   * to trusted JDK code.
   */
  public static invokebasic(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <MethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      paramSize = methodReference.getParamWordSize(),
      opStack = frame.opStack,
      obj: JVMTypes.java_lang_invoke_MethodHandle = opStack.fromTop(paramSize),
      // Need to include the MethodHandle in the arguments to vmtarget. vmtarget
      // will appropriately invoke it.
      args = opStack.sliceFromTop(paramSize + 1),
      lmbdaForm: JVMTypes.java_lang_invoke_LambdaForm,
      mn: JVMTypes.java_lang_invoke_MemberName,
      m: Method;

    // obj is a MethodHandle.
    if (!isNull(thread, frame, obj)) {
      opStack.dropFromTop(paramSize + 1);
      lmbdaForm = obj['java/lang/invoke/MethodHandle/form'];
      mn = lmbdaForm['java/lang/invoke/LambdaForm/vmentry'];
      assert(mn.vmtarget !== null && mn.vmtarget !== undefined, "vmtarget must be defined");
      mn.vmtarget(thread, methodReference.nameAndTypeInfo.descriptor, args);
      frame.returnToThreadLoop = true;
    }
  }

  /**
   * Also used for linkToStatic.
   * TODO: De-conflate the two.
   * TODO: Varargs functions.
   */
  public static linktospecial(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <MethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      opStack = frame.opStack, paramSize = methodReference.paramWordSize,
      // Final argument is the relevant MemberName. Function args are right
      // before it.
      args = opStack.sliceFromTop(paramSize),
      memberName: JVMTypes.java_lang_invoke_MemberName = args.pop(),
      // TODO: Use parsed descriptor.
      desc = methodReference.nameAndTypeInfo.descriptor;

    if (!isNull(thread, frame, memberName)) {
      opStack.dropFromTop(paramSize);
      assert(memberName.getClass().getInternalName() === "Ljava/lang/invoke/MemberName;");
      // parameterTypes for function are the same as the method reference, but without the trailing MemberName.
      // TODO: Use parsed descriptor, avoid re-doing work here.
      memberName.vmtarget(thread, desc.replace("Ljava/lang/invoke/MemberName;)", ")"), args);
      frame.returnToThreadLoop = true;
    }
  }

  // XXX: Varargs functions. We're supposed to box args if target is varargs.
  public static linktovirtual(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var methodReference = <MethodReference | InterfaceMethodReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      paramSize = methodReference.paramWordSize,
      opStack = frame.opStack,
      args = opStack.sliceFromTop(paramSize),
      // Final argument is the relevant MemberName. Function args are right
      // before it.
      memberName: JVMTypes.java_lang_invoke_MemberName = args.pop(),
      desc = methodReference.nameAndTypeInfo.descriptor;

    if (!isNull(thread, frame, memberName)) {
      opStack.dropFromTop(paramSize);
      assert(memberName.getClass().getInternalName() === "Ljava/lang/invoke/MemberName;");
      // parameterTypes for function are the same as the method reference, but without the trailing MemberName.
      memberName.vmtarget(thread, desc.replace("Ljava/lang/invoke/MemberName;)", ")"), args);
      frame.returnToThreadLoop = true;
    }
  }

  public static breakpoint(thread: JVMThread, frame: BytecodeStackFrame) {
    throwException(thread, frame, "Ljava/lang/Error;", "breakpoint not implemented.");
  }

  public static new(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var classRef = <ClassReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    if (classRef.isResolved()) {
      var cls = classRef.cls;
      if (cls.isInitialized(thread)) {
        code[pc] = OpCode.NEW_FAST;
        // Return to thread, rerun opcode.
      } else {
        initializeClassFromClass(thread, frame, cls);
      }
    } else {
      resolveCPItem(thread, frame, classRef);
    }
  }

  public static new_fast(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var classRef = <ClassReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    frame.opStack.push(new classRef.clsConstructor(thread));
    frame.pc += 3;
  }

  public static newarray(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    // TODO: Stash all of these array types during JVM startup.
    var opStack = frame.opStack,
      type = "[" + ArrayTypes[code[pc + 1]],
      cls = <ArrayClassData<any>> frame.getLoader().getInitializedClass(thread, type),
      length = opStack.pop();
    if (length >= 0) {
      opStack.push(new (cls.getConstructor(thread))(thread, length));
      frame.pc += 2;
    } else {
      throwException(thread, frame, 'Ljava/lang/NegativeArraySizeException;', `Tried to init ${type} array with length ${length}`);
    }
  }

  public static anewarray(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var classRef = <ClassReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    if (classRef.isResolved()) {
      // Rewrite and rerun.
      code[pc] = OpCode.ANEWARRAY_FAST;
      classRef.arrayClass = <ArrayClassData<any>> frame.getLoader().getInitializedClass(thread, `[${classRef.cls.getInternalName()}`);
      classRef.arrayClassConstructor = classRef.arrayClass.getConstructor(thread);
    } else {
      resolveCPItem(thread, frame, classRef);
    }
  }

  public static anewarray_fast(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var opStack = frame.opStack,
      classRef = <ClassReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      length = opStack.pop();

    if (length >= 0) {
      opStack.push(new classRef.arrayClassConstructor(thread, length));
      frame.pc += 3;
    } else {
      throwException(thread, frame, 'Ljava/lang/NegativeArraySizeException;', `Tried to init ${classRef.arrayClass.getInternalName()} array with length ${length}`);
    }
  }

  public static arraylength(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack, obj: JVMTypes.JVMArray<any> = opStack.pop();
    if (!isNull(thread, frame, obj)) {
      opStack.push(obj.array.length);
      frame.pc++;
    }
    // obj is NULL. isNull threw an exception for us.
  }

  public static athrow(thread: JVMThread, frame: BytecodeStackFrame) {
    thread.throwException(frame.opStack.pop());
    frame.returnToThreadLoop = true;
  }

  public static checkcast(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var classRef = <ClassReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    if (classRef.isResolved()) {
      // Rewrite to fast version, and re-execute.
      code[pc] = OpCode.CHECKCAST_FAST;
    } else {
      resolveCPItem(thread, frame, classRef);
    }
  }

  public static checkcast_fast(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var classRef = <ClassReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      cls = classRef.cls,
      opStack = frame.opStack,
      o: JVMTypes.java_lang_Object = opStack.top();
    if ((o != null) && !o.getClass().isCastable(cls)) {
      var targetClass = cls.getExternalName();
      var candidateClass = o.getClass().getExternalName();
      throwException(thread, frame, 'Ljava/lang/ClassCastException;', `${candidateClass} cannot be cast to ${targetClass}`);
    } else {
      // Success!
      frame.pc += 3;
    }
  }

  public static instanceof(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var classRef = <ClassReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    if (classRef.isResolved()) {
      // Rewrite and rerun.
      code[pc] = OpCode.INSTANCEOF_FAST;
    } else {
      // Fetch class and rerun opcode.
      resolveCPItem(thread, frame, classRef);
    }
  }

  public static instanceof_fast(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var classRef = <ClassReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      cls = classRef.cls,
      opStack = frame.opStack,
      o = <JVMTypes.java_lang_Object> opStack.pop();
    opStack.push(o !== null ? (o.getClass().isCastable(cls) ? 1 : 0) : 0);
    frame.pc += 3;
  }

  public static monitorenter(thread: JVMThread, frame: BytecodeStackFrame) {
    var opStack = frame.opStack, monitorObj: JVMTypes.java_lang_Object = opStack.pop(),
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

  public static monitorexit(thread: JVMThread, frame: BytecodeStackFrame) {
    var monitorObj: JVMTypes.java_lang_Object = frame.opStack.pop();
    if (monitorObj.getMonitor().exit(thread)) {
      frame.pc++;
    } else {
      // monitorexit failed, and threw an exception.
      frame.returnToThreadLoop = true;
    }
  }

  public static multianewarray(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var classRef = <ClassReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    if (classRef.isResolved()) {
      // Rewrite and rerun.
      code[pc] = OpCode.MULTIANEWARRAY_FAST;
    } else {
      resolveCPItem(thread, frame, classRef);
    }
  }

  public static multianewarray_fast(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var classRef = <ClassReference> frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1)),
      opStack = frame.opStack,
      dim = code[pc + 3],
      i: number,
      // Arguments to the constructor.
      args = new Array<number>(dim), dimSize: number;

    for (i = 0; i < dim; i++) {
      dimSize = opStack.pop();
      args[dim - i - 1] = dimSize;
      if (dimSize < 0) {
        throwException(thread, frame, 'Ljava/lang/NegativeArraySizeException;', `Tried to init ${classRef.cls.getInternalName()} array with a dimension of length ${dimSize}`);
        return;
      }
    }
    opStack.push(new (classRef.cls.getConstructor(thread))(thread, args));
    frame.pc += 4;
  }

  public static ifnull(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    if (frame.opStack.pop() == null) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static ifnonnull(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    if (frame.opStack.pop() != null) {
      const offset = code.readInt16BE(pc + 1);
      frame.pc += offset;
      if (offset < 0) {
        frame.method.incrBBEntries();
      }
    } else {
      frame.pc += 3;
    }
  }

  public static goto_w(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    const offset = code.readInt32BE(pc + 1);
    frame.pc += offset;
    if (offset < 0) {
      frame.method.incrBBEntries();
    }
  }

  public static jsr_w(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    frame.opStack.push(frame.pc + 5);
    frame.pc += code.readInt32BE(pc + 1);
  }

  public static nop(thread: JVMThread, frame: BytecodeStackFrame) {
    frame.pc += 1;
  }

  public static ldc(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var constant = frame.method.cls.constantPool.get(code[pc + 1]);
    if (constant.isResolved()) {
      assert((() => {
        switch (constant.getType()) {
          case ConstantPoolItemType.STRING:
          case ConstantPoolItemType.CLASS:
          case ConstantPoolItemType.METHOD_HANDLE:
          case ConstantPoolItemType.METHOD_TYPE:
          case ConstantPoolItemType.INTEGER:
          case ConstantPoolItemType.FLOAT:
            return true;
          default:
            return false;
        }
      })(), `Constant pool item ${ConstantPoolItemType[constant.getType()]} is not appropriate for LDC.`);
      frame.opStack.push(constant.getConstant(thread));
      frame.pc += 2;
    } else {
      resolveCPItem(thread, frame, constant);
    }
  }

  public static ldc_w(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var constant = frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    if (constant.isResolved()) {
      assert((() => {
        switch (constant.getType()) {
          case ConstantPoolItemType.STRING:
          case ConstantPoolItemType.CLASS:
          case ConstantPoolItemType.METHOD_HANDLE:
          case ConstantPoolItemType.METHOD_TYPE:
          case ConstantPoolItemType.INTEGER:
          case ConstantPoolItemType.FLOAT:
            return true;
          default:
            return false;
        }
      })(), `Constant pool item ${ConstantPoolItemType[constant.getType()]} is not appropriate for LDC_W.`);
      frame.opStack.push(constant.getConstant(thread));
      frame.pc += 3;
    } else {
      resolveCPItem(thread, frame, constant);
    }
  }

  public static ldc2_w(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var constant = frame.method.cls.constantPool.get(code.readUInt16BE(pc + 1));
    assert(constant.getType() === ConstantPoolItemType.LONG
      || constant.getType() === ConstantPoolItemType.DOUBLE,
      `Invalid ldc_w constant pool type: ${ConstantPoolItemType[constant.getType()]}`);
    frame.opStack.pushWithNull((<ConstLong | ConstDouble> constant).value);
    frame.pc += 3;
  }

  public static wide(thread: JVMThread, frame: BytecodeStackFrame, code: Buffer) {
    const pc = frame.pc;
    var index = code.readUInt16BE(pc + 2);
    // Increment PC before switch to avoid issue where ret chances PC and we
    // erroneously increment the PC further.
    frame.pc += 4;
    switch (code[pc + 1]) {
      case OpCode.ILOAD:
      case OpCode.FLOAD:
      case OpCode.ALOAD:
        frame.opStack.push(frame.locals[index]);
        break;
      case OpCode.LLOAD:
      case OpCode.DLOAD:
        frame.opStack.pushWithNull(frame.locals[index]);
        break;
      case OpCode.ISTORE:
      case OpCode.FSTORE:
      case OpCode.ASTORE:
        frame.locals[index] = frame.opStack.pop();
        break;
      case OpCode.LSTORE:
      case OpCode.DSTORE:
        // NULL
        frame.locals[index + 1] = frame.opStack.pop();
        // The actual value.
        frame.locals[index] = frame.opStack.pop();
        break;
      case OpCode.RET:
        frame.pc = frame.locals[index];
        break;
      case OpCode.IINC:
        var value = code.readInt16BE(pc + 4);
        frame.locals[index] = (frame.locals[index] + value) | 0;
        // wide iinc has 2 extra bytes.
        frame.pc += 2;
        break;
      default:
        assert(false, `Unknown wide opcode: ${code[pc + 1]}`);
        break;
    }
  }
}

export var LookupTable: IOpcodeImplementation[] = new Array(0xff);
// Put in function closure to prevent scope pollution.
(() => {
  for (var i = 0; i < 0xff; i++) {
    if (OpCode.hasOwnProperty("" + i)) {
      LookupTable[i] = (<any> Opcodes)[OpCode[i].toLowerCase()];
      assert(LookupTable[i] != null, `Missing implementation of opcode ${OpCode[i]}`);
    }
  }
})();
