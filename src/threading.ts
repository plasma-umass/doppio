import {ClassData, IJVMConstructor, ReferenceClassData} from './ClassData';
import {ClassLoader, BootstrapClassLoader} from './ClassLoader';
import {Method} from './methods';
import {ThreadStatus, StackFrameType, OpCode, Constants, JVMTIThreadState, OpcodeLayoutType, ConstantPoolItemType, OpcodeLayouts} from './enums';
import assert from './assert';
import gLong from './gLong';
import {LookupTable, throwException, isNull, resolveCPItem, ArrayTypes} from './opcodes';
import {ExceptionHandler, LineNumberTable, SourceFile} from './attributes';
import {logLevel, LogLevel, debug_vars, setLogLevel, debug_var} from './logging';
import * as logging from './logging';
import JVM from './jvm';
import {float2int, wrapFloat, asyncForEach, initString, ext_classname, is_primitive_type, is_array_type, is_reference_type} from './util';
import {IConstantPoolItem, MethodReference, ClassReference, InterfaceMethodReference, FieldReference, NameAndTypeInfo} from './ConstantPool';
import * as JVMTypes from '../includes/JVMTypes';
import Monitor from './Monitor';
import {default as ThreadPool, Thread} from './threadpool';
import {setImmediate} from 'browserfs';
import global from './global';

const debug = logging.debug;
const vtrace = logging.vtrace;
const trace = logging.trace;

declare var RELEASE: boolean;

// The number of method resumes we should allow before yielding for
// responsiveness. Updated using a cumulative moving average to ensure
// Doppio is responsive.
let maxMethodResumes: number = 10000,
  // The number of method resumes until Doppio should yield again.
  methodResumesLeft: number = maxMethodResumes,
  // Used for the CMA.
  numSamples: number = 1;

/**
 * Represents a stack frame.
 */
export interface IStackFrame {
  /**
   * Runs or resumes the method, as configured.
   */
  run: (thread: JVMThread) => void;
  /**
   * Configures the method to resume after a method call.
   * @rv The return value from the method call, if applicable.
   * @rv2 The second return value, which will always be null if applicable.
   */
  scheduleResume: (thread: JVMThread, rv?: any, rv2?: any) => void;
  /**
   * Checks if the method can handle the given exception. If so,
   * configures the stack frame to handle the exception.
   * @return True if the method can handle the exception.
   */
  scheduleException: (thread: JVMThread, e: JVMTypes.java_lang_Throwable) => boolean;
  /**
   * This stack frame's type.
   */
  type: StackFrameType;
  /**
   * Retrieve a stack trace frame from this stack trace. If this stack frame
   * should not be language-visible, return null.
   */
  getStackTraceFrame(): IStackTraceFrame;
  /**
   * Retrieve the classloader for this method.
   */
  getLoader(): ClassLoader;
}

export class PreAllocatedStack {
  private store: any[];
  private curr: number = 0;

  constructor(initialSize: number) {
    this.store = new Array(initialSize);
  }

  push(x: any) {
    this.store[this.curr++] = x;
  }

  pushAll() {
    const n = arguments.length;
    for (let i = 0; i < n; i++) {
      this.store[this.curr++] = arguments[i];
    }
  }

  pushWithNull(x: any) {
    this.store[this.curr] = x;

    // XXX: Although setting `null` is required in theory, it has no functional impact in practice.
    // Performance is improved when commented.
    // this.store[this.curr + 1] = null;

    this.curr += 2;
  }

  push6(x: any, y: any, z: any, z1: any, z2: any, z3: any) {
    this.store[this.curr++] = x;
    this.store[this.curr++] = y;
    this.store[this.curr++] = z;
    this.store[this.curr++] = z1;
    this.store[this.curr++] = z2;
    this.store[this.curr++] = z3;
  }

  swap() {
    const tmp = this.store[this.curr - 1];
    this.store[this.curr - 1] = this.store[this.curr - 2];
    this.store[this.curr - 2] = tmp;
  }

  dup() {
    this.store[this.curr] = this.store[this.curr - 1];
    this.curr++;
  }

  dup2() {
    this.store[this.curr] = this.store[this.curr - 2];
    this.store[this.curr + 1] = this.store[this.curr - 1];
    this.curr += 2;
  }

  dup_x1() {
    const v1 = this.store[this.curr - 1];

    this.store[this.curr - 1] = this.store[this.curr - 2];
    this.store[this.curr] = v1;
    this.store[this.curr - 2] = v1;

    this.curr++;
  }

  dup_x2() {
    const v1 = this.store[this.curr - 1];

    this.store[this.curr - 1] = this.store[this.curr - 2];
    this.store[this.curr - 2] = this.store[this.curr - 3];
    this.store[this.curr] = v1;
    this.store[this.curr - 3] = v1;

    this.curr++;
  }

  dup2_x1() {
    const v1 = this.store[this.curr - 1];
    const v2 = this.store[this.curr - 2];

    this.store[this.curr] = v2;
    this.store[this.curr + 1] = v1;
    this.store[this.curr - 1] = this.store[this.curr - 3];
    this.store[this.curr - 2] = v1;
    this.store[this.curr - 3] = v2;

    this.curr += 2;
  }

  pop(): any {
    return this.store[--this.curr];
  }

  pop2(): any {
    this.curr -= 2;
    return this.store[this.curr];
  }

  bottom(): any {
    return this.store[0];
  }

  top(): any {
    return this.store[this.curr - 1];
  }

  fromTop(n: number): any {
    return this.store[this.curr - (n + 1)];
  }

  sliceFromBottom(n: number): any {
    return this.store.slice(n, this.curr);
  }

  sliceFromTop(n: number): any {
    return this.store.slice(this.curr - n, this.curr);
  }

  dropFromTop(n: number) {
    this.curr -= n;
  }

  sliceAndDropFromTop(n: number): any {
    const curr = this.curr;
    this.curr -= n;
    return this.store.slice(curr - n, curr);
  }

  getRaw(): any[] {
    return this.store.slice(0, this.curr);
  }

  clear() {
    this.curr = 0;
  }
}

const jitUtil = {
  isNull: isNull,
  resolveCPItem: resolveCPItem,
  throwException: throwException,
  gLong: gLong,
  float2int: float2int,
  wrapFloat: wrapFloat,
  Constants: Constants
};

/**
 * Represents a stack frame for a bytecode method.
 */
export class BytecodeStackFrame implements IStackFrame {
  public pc: number = 0;
  public locals: any[];
  public opStack: PreAllocatedStack;
  public returnToThreadLoop: boolean = false;
  public lockedMethodLock: boolean = false;
  public method: Method;

  /**
   * Constructs a bytecode method's stack frame.
   * @param method The bytecode method to run.
   * @param args The arguments to pass to the bytecode method.
   */
  constructor(method: Method, args: any[]) {
    this.method = method;
    method.incrBBEntries();
    assert(!method.accessFlags.isNative(), 'Cannot run a native method using a BytecodeStackFrame.');
    // @todo This should be a runtime error, since reflection can cause you to
    // try to do this.
    assert(!method.accessFlags.isAbstract(), 'Cannot run an abstract method!');
    this.locals = args;
    this.opStack = new PreAllocatedStack(method.getCodeAttribute().getMaxStack());
  }

  public run(thread: JVMThread): void {
    var method = this.method, code = this.method.getCodeAttribute().getCode(),
      opcodeTable = LookupTable;
    if (!RELEASE && logLevel >= LogLevel.TRACE) {
      if (this.pc === 0) {
        trace(`\nT${thread.getRef()} D${thread.getStackTrace().length} Running ${this.method.getFullSignature()} [Bytecode]:`);
      } else {
        trace(`\nT${thread.getRef()} D${thread.getStackTrace().length} Resuming ${this.method.getFullSignature()}:${this.pc} [Bytecode]:`);
      }
      vtrace(`  S: [${debug_vars(this.opStack.getRaw())}], L: [${debug_vars(this.locals)}]`);
    }

    if (method.accessFlags.isSynchronized() && !this.lockedMethodLock) {
      // We are starting a synchronized method! These must implicitly enter
      // their respective locks.
      this.lockedMethodLock = method.methodLock(thread, this).enter(thread, () => {
        // Lock succeeded. Set the flag so we don't attempt to reacquire it
        // when this method reruns.
        this.lockedMethodLock = true;
      });
      if (!this.lockedMethodLock) {
        // Failed. Thread is automatically blocked. Return.
        assert(thread.getStatus() === ThreadStatus.BLOCKED, "Failed to enter a monitor. Thread must be BLOCKED.");
        return;
      }
    }

    // Reset the returnToThreadLoop switch. The current value is leftover
    // from the previous time this method was run, and is meaningless.
    this.returnToThreadLoop = false;

    if (thread.getJVM().isJITDisabled()) {
      // Interpret until we get the signal to return to the thread loop.
      while (!this.returnToThreadLoop) {
        var opCode = code[this.pc];
        if (!RELEASE && logLevel === LogLevel.VTRACE) {
          vtrace(`  ${this.pc} ${annotateOpcode(op, method, code, this.pc)}`);
        }
        opcodeTable[opCode](thread, this, code);
        if (!RELEASE && !this.returnToThreadLoop && logLevel === LogLevel.VTRACE) {
          vtrace(`    S: [${debug_vars(this.opStack.getRaw())}], L: [${debug_vars(this.locals)}]`);
        }
      }
    } else {
      // Run until we get the signal to return to the thread loop.
      while (!this.returnToThreadLoop) {
        var op = method.getOp(this.pc, code, thread);
        if (typeof op === 'function') {
          if (!RELEASE && logLevel === LogLevel.VTRACE) {
            vtrace(`  ${this.pc} running JIT compiled function:\n${op.toString()}`);
          }
          op(this, thread, jitUtil);
        } else {
          if (!RELEASE && logLevel === LogLevel.VTRACE) {
            vtrace(`  ${this.pc} ${annotateOpcode(op, method, code, this.pc)}`);
          }
          opcodeTable[op](thread, this, code);
        }
        if (!RELEASE && !this.returnToThreadLoop && logLevel === LogLevel.VTRACE) {
          vtrace(`    S: [${debug_vars(this.opStack.getRaw())}], L: [${debug_vars(this.locals)}]`);
        }
      }
    }
  }

  public scheduleResume(thread: JVMThread, rv?: any, rv2?: any): void {
    // Advance to the next opcode.
    var prevOp = this.method.getCodeAttribute().getCode()[this.pc];
    switch (prevOp) {
      case OpCode.INVOKEINTERFACE:
      case OpCode.INVOKEINTERFACE_FAST:
        this.pc += 5;
        break;
      case OpCode.INVOKESPECIAL:
      case OpCode.INVOKESTATIC:
      case OpCode.INVOKEVIRTUAL:
      case OpCode.INVOKESTATIC_FAST:
      case OpCode.INVOKENONVIRTUAL_FAST:
      case OpCode.INVOKEVIRTUAL_FAST:
      case OpCode.INVOKEHANDLE:
      case OpCode.INVOKEBASIC:
      case OpCode.LINKTOSPECIAL:
      case OpCode.LINKTOVIRTUAL:
      case OpCode.INVOKEDYNAMIC:
      case OpCode.INVOKEDYNAMIC_FAST:
        this.pc += 3;
        break;
      default:
        // Should be impossible.
        assert(false, `Resuming from a non-invoke opcode! Opcode: ${OpCode[prevOp]} [${prevOp}]`);
        break;
    }

    if (rv !== undefined) {
      this.opStack.push(rv);
    }
    if (rv2 !== undefined) {
      this.opStack.push(rv2);
    }
  }

  /**
   * Checks if this method can handle the specified exception 'e'.
   * Returns true if it can, or if it needs to asynchronously resolve some
   * classes.
   *
   * In the latter case, scheduleException will handle rethrowing the exception
   * in the event that it can't actually handle it.
   */
  public scheduleException(thread: JVMThread, e: JVMTypes.java_lang_Throwable): boolean {
    var codeAttr = this.method.getCodeAttribute(),
      pc = this.pc, method = this.method,
      // STEP 1: See if we can find an appropriate handler for this exception!
      exceptionHandlers = codeAttr.exceptionHandlers,
      ecls = e.getClass(), handler: ExceptionHandler;
    for (let i = 0; i < exceptionHandlers.length; i++) {
      let eh = exceptionHandlers[i];
      if (eh.startPC <= pc && pc < eh.endPC) {
        if (eh.catchType === "<any>") {
          handler = eh;
          break;
        } else {
          let resolvedCatchType = method.cls.getLoader().getResolvedClass(eh.catchType);
          if (resolvedCatchType != null) {
            if (ecls.isCastable(resolvedCatchType)) {
              handler = eh;
              break;
            }
          } else {
            // ASYNC PATH: We'll need to asynchronously resolve these handlers.
            debug(`${method.getFullSignature()} needs to resolve some exception types...`);
            let handlerClasses: string[] = [];
            for (let i = 0; i < exceptionHandlers.length; i++) {
              let handler = exceptionHandlers[i];
              if (handler.catchType !== "<any>") {
                handlerClasses.push(handler.catchType);
              }
            }
            debug(`${method.getFullSignature()}: Has to resolve exception classes. Deferring scheduling...`);
            thread.setStatus(ThreadStatus.ASYNC_WAITING);
            method.cls.getLoader().resolveClasses(thread, handlerClasses, (classes: { [name: string]: ClassData; }) => {
              if (classes !== null) {
                debug(`${method.getFullSignature()}: Rethrowing exception to handle!`);
                // Rethrow the exception to trigger scheduleException again.
                // @todo If the ClassLoader throws an exception during resolution,
                // this could result in an infinite loop. Fix would be to sync check
                // if class failed to load previously.
                thread.throwException(e);
              }
            });
            // Tell the thread we'll handle it.
            return true;
          }
        }
      }
    }

    // STEP 2: Either continue on if we could not find an appropriate handler,
    // or set up the stack for appropriate resumption.
    if (handler != null) {
      // Found the handler.
      debug(`${method.getFullSignature()}: Caught ${e.getClass().getInternalName()} as subclass of ${handler.catchType}`);

      // clear out anything on the stack; it was made during the try block
      this.opStack.clear();
      this.opStack.push(e);

      this.pc = handler.handlerPC;
      return true;
    } else {
      // abrupt method invocation completion
      debug(`${method.getFullSignature()}: Did not catch ${e.getClass().getInternalName()}.`);
      // STEP 3: Synchronized method? Exit from the method's monitor.
      if (method.accessFlags.isSynchronized()) {
        method.methodLock(thread, this).exit(thread);
      }
      return false;
    }
  }

  /**
   * Returns the classloader for the stack frame.
   */
  public getLoader(): ClassLoader {
    return this.method.cls.getLoader();
  }

  /**
   * Indicates the type of this stack frame.
   */
  public type: StackFrameType = StackFrameType.BYTECODE;

  public getStackTraceFrame(): IStackTraceFrame {
    return {
      method: this.method,
      pc: this.pc,
      stack: this.opStack.sliceFromBottom(0),
      locals: this.locals.slice(0)
    };
  }
}

/**
 * Represents a native method's stack frame.
 */
export class NativeStackFrame implements IStackFrame {
  private nativeMethod: Function;
  public method: Method;
  private args: any[];

  /**
   * Constructs a native method's stack frame.
   * @param method The native method to run.
   * @param args The arguments to pass to the native method.
   */
  constructor(method: Method, args: any[]) {
    this.method = method;
    this.args = args;
    assert(method.accessFlags.isNative());
    this.nativeMethod = method.getNativeFunction();
  }

  /**
   * Calls the native method.
   * NOTE: Should only be called once.
   */
  public run(thread: JVMThread): void {
    trace(`\nT${thread.getRef()} D${thread.getStackTrace().length} Running ${this.method.getFullSignature()} [Native]:`);
    var rv: any = this.nativeMethod.apply(null, this.method.convertArgs(thread, this.args));
    // Ensure thread is running, and we are the running method.
    if (thread.getStatus() === ThreadStatus.RUNNABLE && thread.currentMethod() === this.method) {
      // Normal native method exit.
      var returnType = this.method.returnType;
      switch (returnType) {
        case 'J':
        case 'D':
          // Two stack return values for methods that return a long or a double.
          thread.asyncReturn(rv, null);
          break;
        case 'Z':
          // Convert to a number.
          thread.asyncReturn(rv ? 1 : 0);
          break;
        default:
          thread.asyncReturn(rv);
          break;
      }
    }
  }

  /**
   * N/A
   */
  public scheduleResume(thread: JVMThread, rv?: any, rv2?: any): void {
    // NOP
  }

  /**
   * Not relevant; the first execution block of a native method will never
   * receive an exception.
   */
  public scheduleException(thread: JVMThread, e: JVMTypes.java_lang_Throwable): boolean {
    return false;
  }

  public type: StackFrameType = StackFrameType.NATIVE;

  public getStackTraceFrame(): IStackTraceFrame {
    return {
      method: this.method,
      pc: -1,
      stack: [],
      locals: []
    };
  }

  /**
   * Returns the classloader for the stack frame.
   */
  public getLoader(): ClassLoader {
    return this.method.cls.getLoader();
  }
}

/**
 * InternalStackFrames are used by the JVM to launch JVM functions that
 * eventually call back into JavaScript code when they complete or throw a
 * fatal exception.
 */
export class InternalStackFrame implements IStackFrame {
  private isException: boolean = false;
  private val: any;
  private cb: (e?: JVMTypes.java_lang_Throwable, rv?: any) => void;

  /**
   * @param cb Callback function. Called with an exception if one occurs, or
   *   the return value from the called method, if relevant.
   */
  constructor(cb: (e?: JVMTypes.java_lang_Throwable, rv?: any) => void) {
    this.cb = cb;
  }

  public run(thread: JVMThread): void {
    // Pop myself off of the stack.
    thread.framePop();
    // Pause the thread before returning into native JavaScript code.
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    if (this.isException) {
      this.cb(this.val);
    } else {
      this.cb(null, this.val);
    }
  }

  /**
   * Resumes the JavaScript code that created this stack frame.
   */
  public scheduleResume(thread: JVMThread, rv?: any): void {
    this.isException = false;
    this.val = rv;
  }

  /**
   * Resumes the JavaScript code that created this stack frame with the given
   * exception.
   */
  public scheduleException(thread: JVMThread, e: JVMTypes.java_lang_Throwable): boolean {
    this.isException = true;
    this.val = e;
    return true;
  }

  public type: StackFrameType = StackFrameType.INTERNAL;

  public getStackTraceFrame(): IStackTraceFrame {
    // These should not be language visible.
    return null;
  }

  public getLoader(): ClassLoader {
    throw new Error("Internal stack frames have no loader.");
  }
}

export interface IStackTraceFrame {
  method: Method;
  pc: number;
  stack: any[];
  locals: any[];
}

/**
 * Represents a single JVM thread.
 */
export class JVMThread implements Thread {
  /**
   * The current state of this thread, from the JVM level.
   */
  private status: ThreadStatus = ThreadStatus.NEW;

  /**
   * The call stack.
   */
  private stack: IStackFrame[] = [];

  /**
   * Whether or not this thread has been interrupted. It's a JVM thing.
   */
  private interrupted: boolean = false;

  /**
   * If the thread is WAITING, BLOCKED, or TIMED_WAITING, this field holds the
   * monitor that is involved.
   */
  private monitor: Monitor = null;
  private bsCl: BootstrapClassLoader;
  private tpool: ThreadPool<JVMThread>;
  private jvmThreadObj: JVMTypes.java_lang_Thread;
  private jvm: JVM;

  /**
   * Initializes a new JVM thread. Starts the thread in the NEW state.
   */
  constructor(jvm: JVM, tpool: ThreadPool<JVMThread>, threadObj: JVMTypes.java_lang_Thread) {
    this.jvm = jvm;
    this.bsCl = jvm.getBootstrapClassLoader();
    this.tpool = tpool;
    this.jvmThreadObj = threadObj;
  }

  /**
   * Get the JVM thread object that represents this thread.
   */
  public getJVMObject(): JVMTypes.java_lang_Thread {
    return this.jvmThreadObj;
  }

  /**
   * Is this thread a daemon?
   */
  public isDaemon(): boolean {
    return this.jvmThreadObj['java/lang/Thread/daemon'] !== 0;
  }

  /**
   * Get the priority of this thread.
   */
  public getPriority(): number {
    return this.jvmThreadObj['java/lang/Thread/priority'];
  }

  /**
   * XXX: Used during bootstrapping to set the first thread's Thread object.
   */
  public setJVMObject(obj: JVMTypes.java_lang_Thread): void {
    obj['java/lang/Thread/threadStatus'] = this.jvmThreadObj['java/lang/Thread/threadStatus'];
    this.jvmThreadObj = obj;
  }

  /**
   * Return the reference number for this thread.
   */
  public getRef(): number {
    return this.jvmThreadObj.ref;
  }

  /**
   * Check if this thread's interrupted flag is set.
   */
  public isInterrupted(): boolean {
    return this.interrupted;
  }

  /**
   * Returns the currently running method. Returns NULL if stack is empty.
   */
  public currentMethod(): Method {
    var stack = this.stack, idx = stack.length, method: Method;
    while (--idx >= 0) {
      method = stack[idx].getStackTraceFrame().method;
      if (method !== null) {
        return method;
      }
    }
    return null;
  }

  /**
   * Set or unset this thread's interrupted flag.
   */
  public setInterrupted(interrupted: boolean): void {
    this.interrupted = interrupted;
  }

  /**
   * Retrieve the bootstrap classloader.
   */
  public getBsCl(): BootstrapClassLoader {
    return this.bsCl;
  }

  /**
   * Get the classloader for the current frame.
   */
  public getLoader(): ClassLoader {
    let loader = this.stack[this.stack.length - 1].getLoader();
    if (loader) {
      return loader;
    } else {
      // Crawl stack until we find one.
      let len = this.stack.length;
      for (let i = 2; i <= len; i++) {
        loader = this.stack[len - i].getLoader();
        if (loader) {
          return loader;
        }
      }
      throw new Error(`Unable to find loader.`);
    }
  }

  /**
   * Imports & initializes the given Java class or classes. Returns the JavaScript
   * object that represents the class -- e.g. contains static methods
   * and fields.
   *
   * If multiple names are specified, it returns an array of class objects.
   *
   * If there is an error resolving or initializing any class, it will
   * throw an exception without invoking your callback.
   */
  public import<T>(name: string, cb: (rv?: T) => void, explicit?: boolean): void;
  public import<T>(names: string[], cb: (rv?: T) => void, explicit?: boolean): void;
  public import<T>(names: string | string[], cb: (rv?: T) => void, explicit: boolean = true): void {
    let loader = this.getLoader();
    this.setStatus(ThreadStatus.ASYNC_WAITING);
    if (Array.isArray(names)) {
      let rv: IJVMConstructor<any>[] = [];
      asyncForEach(names, (name, nextItem) => {
        this._import(name, loader, (cons) => {
          rv.push(cons);
          nextItem();
        }, explicit);
      }, (e?: any) => {
        cb(<T> <any> rv);
      });
    } else {
      this._import(names, loader, <any> cb, explicit);
    }
  }

  private _import(name: string, loader: ClassLoader, cb: (rv?: IJVMConstructor<any>) => void, explicit: boolean): void {
    let cls = <ReferenceClassData<any>> loader.getInitializedClass(this, name);
    if (cls) {
      setImmediate(() => cb(cls.getConstructor(this)));
    } else {
      loader.initializeClass(this, name, (cdata: ReferenceClassData<any>) => {
        if (cdata) {
          cb(cdata.getConstructor(this));
        }
      }, explicit);
    }
  }

  /**
   * Retrieve the JVM instantiation that this thread belongs to.
   */
  public getJVM(): JVM {
    return this.jvm;
  }

  /**
   * Retrieve the thread pool that this thread belongs to.
   */
  public getThreadPool(): ThreadPool<JVMThread> {
    return this.tpool;
  }

  /**
   * Retrieves the current stack trace.
   */
  public getStackTrace(): IStackTraceFrame[] {
    var trace: IStackTraceFrame[] = [], i: number,
      frame: IStackTraceFrame;
    for (i = 0; i < this.stack.length; i++) {
      frame = this.stack[i].getStackTraceFrame();
      if (frame != null) {
        trace.push(frame);
      }
    }
    return trace;
  }

  /**
   * [DEBUG] Return a printable string of the thread's current stack trace.
   */
  public getPrintableStackTrace(): string {
    var rv: string = "";
    this.getStackTrace().reverse().forEach((trace: IStackTraceFrame) => {
      rv += `\tat ${ext_classname(trace.method.cls.getInternalName())}::${trace.method.name}(`;
      if (trace.pc >= 0) {
        // Bytecode method
        var code = trace.method.getCodeAttribute();
        var table = <LineNumberTable> code.getAttribute('LineNumberTable');
        var srcAttr = <SourceFile> trace.method.cls.getAttribute('SourceFile');
        if (srcAttr != null) {
          rv += srcAttr.filename;
        } else {
          rv += 'unknown';
        }
        if (table != null) {
          var lineNumber = table.getLineNumber(trace.pc);
          rv += `:${lineNumber}`;
          rv += ` Bytecode offset: ${trace.pc}`;
        }
      } else {
        // Native method.
        rv += "native";
      }
      rv += ")\n";
    });
    return rv;
  }

  /**
   * The thread's main execution loop. Everything starts here!
   *
   * SHOULD ONLY BE INVOKED BY THE SCHEDULER.
   */
  public run(): void {
    var stack = this.stack,
      startTime: number = (new Date()).getTime();

    // Reset counter. Threads always start from a fresh stack / yield.
    methodResumesLeft = maxMethodResumes;
    while (this.status === ThreadStatus.RUNNABLE && stack.length > 0) {
      const sf = stack[stack.length - 1];
      if (!RELEASE) {
        if (sf.type === StackFrameType.BYTECODE && this.jvm.shouldVtrace((<BytecodeStackFrame> sf).method.fullSignature)) {
          var oldLevel = logLevel;
          setLogLevel(LogLevel.VTRACE);
          sf.run(this);
          setLogLevel(oldLevel);
        } else {
          sf.run(this);
        }
      } else {
        sf.run(this);
      }
      if (--methodResumesLeft === 0) {
        const endTime = (new Date()).getTime();
        const duration = endTime - startTime;
        // Estimated number of methods we can resume before needing to yield.
        const estMaxMethodResumes = ((maxMethodResumes / duration) * this.jvm.getResponsiveness()) | 0;
        // Update CMA.
        maxMethodResumes = ((estMaxMethodResumes + numSamples * maxMethodResumes) / (numSamples + 1)) | 0;
        if (maxMethodResumes <= 0) {
          // Sanity check. Should never really occur.
          maxMethodResumes = 10;
        }
        vtrace(`T${this.getRef()} Quantum over. Method resumes: Max ${maxMethodResumes} Est ${estMaxMethodResumes} Samples ${numSamples}`);
        numSamples++;
        // Tell the scheduler that our quantum is over.
        this.tpool.quantumOver(this);
        // Break out of while loop.
        break;
      }
    }

    if (stack.length === 0) {
      // This thread has finished!
      this.setStatus(ThreadStatus.TERMINATED);
    }
  }

  /**
   * [DEBUG] Performs a sanity check on the thread.
   */
  private sanityCheck(): boolean {
    switch (this.status) {
      case ThreadStatus.NEW:
        return true;
      case ThreadStatus.RUNNABLE:
        assert(this.stack.length > 0, 'A runnable thread must not have an empty stack.');
        return true;
      case ThreadStatus.TIMED_WAITING:
        assert(this.monitor != null && this.monitor.isTimedWaiting(this), 'A timed waiting thread must be waiting on a monitor.');
        return true;
      case ThreadStatus.WAITING:
        assert(this.monitor != null && this.monitor.isWaiting(this), "A waiting thread must be waiting on a monitor.");
        return true;
      case ThreadStatus.BLOCKED:
      case ThreadStatus.UNINTERRUPTABLY_BLOCKED:
        assert(this.monitor != null && this.monitor.isBlocked(this), "A blocked thread must be blocked on a monitor");
        return true;
      case ThreadStatus.ASYNC_WAITING:
        return true;
      case ThreadStatus.TERMINATED:
        assert(this.stack.length === 0, "A terminated thread must have an empty stack.");
        return true;
      case ThreadStatus.PARKED:
        assert(this.jvm.getParker().isParked(this), "A parked thread must be parked.");
        return true;
      default:
        // Invalid ThreadStatus.
        return false;
    }
  }

  /**
   * Should only be called by setStatus.
   * Updates both the JVMThread object and this object.
   */
  private rawSetStatus(newStatus: ThreadStatus): void {
    var jvmNewStatus: number = 0, oldStatus = this.status;

    if (logLevel === LogLevel.VTRACE) {
      vtrace(`\nT${this.getRef()} ${ThreadStatus[oldStatus]} => ${ThreadStatus[newStatus]}`);
    }
    assert(validateThreadTransition(oldStatus, newStatus), `Invalid thread transition: ${ThreadStatus[oldStatus]} => ${ThreadStatus[newStatus]}`);

    this.status = newStatus;
    // Map our status value back to JVM's threadStatus value.
    // Ensures that JVM code can introspect on our threads.
    switch (newStatus) {
      case ThreadStatus.NEW:
        jvmNewStatus |= JVMTIThreadState.ALIVE;
        break;
      case ThreadStatus.RUNNABLE:
        jvmNewStatus |= JVMTIThreadState.RUNNABLE;
        break;
      case ThreadStatus.BLOCKED:
      case ThreadStatus.UNINTERRUPTABLY_BLOCKED:
        jvmNewStatus |= JVMTIThreadState.BLOCKED_ON_MONITOR_ENTER;
        break;
      case ThreadStatus.WAITING:
      case ThreadStatus.ASYNC_WAITING:
      case ThreadStatus.PARKED:
        jvmNewStatus |= JVMTIThreadState.WAITING_INDEFINITELY;
        break;
      case ThreadStatus.TIMED_WAITING:
        jvmNewStatus |= JVMTIThreadState.WAITING_WITH_TIMEOUT;
        break;
      case ThreadStatus.TERMINATED:
        jvmNewStatus |= JVMTIThreadState.TERMINATED;
        break;
      default:
        jvmNewStatus = JVMTIThreadState.RUNNABLE;
        break;
    }

    this.jvmThreadObj['java/lang/Thread/threadStatus'] = jvmNewStatus;
    this.tpool.statusChange(this, oldStatus, this.status);
  }

  /**
   * Transitions the thread from one state to the next.
   * Contains JVM-specific thread logic.
   */
  public setStatus(status: ThreadStatus, monitor: Monitor = null): void {
    if (this.status !== status) {
      let oldStatus = this.status;

      // Update the monitor.
      this.monitor = monitor;

      if (status !== ThreadStatus.TERMINATED) {
        // Actually change state.
        this.rawSetStatus(status);
      } else {
        // Call exit() first.
        this.exit();
      }

      // Validate current state (debug builds only)
      assert(this.sanityCheck(), `Invalid thread status.`);
    }
  }

  /**
   * Called when a thread finishes executing.
   */
  private exit(): void {
    var monitor: Monitor = this.jvmThreadObj.getMonitor();
    if (monitor.isBlocked(this) || monitor.getOwner() === this || this.status === ThreadStatus.TERMINATED) {
      // Thread is already shutting down.
      return;
    }

    if (this.stack.length === 0) {
      // De-schedule thread.
      this.setStatus(ThreadStatus.ASYNC_WAITING);
      // Only applicable if it's not an early death, e.g. before VM bootup.
      if (this.jvm.hasVMBooted()) {
        trace(`T${this.getRef()} Exiting.`);
        var phase2 = () => {
            trace(`T${this.getRef()} Entered exit monitor.`);
            // Exit.
            this.jvmThreadObj["exit()V"](this, null, (e?) => {
              // Notify everyone.
              monitor.notifyAll(this);
              // Exit monitor.
              monitor.exit(this);
              trace(`T${this.getRef()} Terminated.`);
              // Actually become terminated.
              this.rawSetStatus(ThreadStatus.TERMINATED);
            });
          };

        // Acquire the monitor associated with our JavaObject.
        if (monitor.enter(this, phase2)) {
          phase2();
        }
      } else {
        trace(`T${this.getRef()} Not exiting; VM is still booting.`);
      }
    } else {
      // There are things on the stack. This exit is occuring before the stack has emptied.
      // Clear the stack, set to terminated.
      while (this.stack.length > 0) {
        this.stack.pop();
      }
      trace(`T${this.getRef()} Terminated.`);
      this.rawSetStatus(ThreadStatus.TERMINATED);
    }
  }

  /**
   * Called when the priority of the thread changes.
   * Should only be called by java.lang.setPriority0.
   */
  public signalPriorityChange(): void {
    this.tpool.priorityChange(this);
  }

  /**
   * Get the monitor that this thread is waiting or blocked on.
   */
  public getMonitorBlock(): Monitor {
    return this.monitor;
  }

  /**
   * Get the thread's current state.
   */
  public getStatus(): ThreadStatus {
    return this.status;
  }

  /**
   * Returns from the currently executing method with the given return value.
   * Used by asynchronous native
   *
   * Causes the following state transition:
   * * RUNNING => RUNNABLE
   * * RUNNABLE => RUNNABLE
   * * ASYNC_WAITING => RUNNABLE
   *
   * It is not valid to call this method if the thread is in any other state.
   */
  public asyncReturn(): void;
  public asyncReturn(rv: number): void;
  public asyncReturn(rv: JVMTypes.java_lang_Object): void;
  public asyncReturn(rv: number, rv2: any): void;
  public asyncReturn(rv: gLong, rv2: any): void;
  public asyncReturn(rv?: any, rv2?: any): void {
    var stack = this.stack;
    assert(this.status === ThreadStatus.RUNNABLE || this.status === ThreadStatus.ASYNC_WAITING);
    assert(typeof (rv) !== 'boolean' && rv2 == null);
    // Pop off the current method.
    var frame = stack.pop();
    if (frame.type != StackFrameType.INTERNAL) {
      var frameCast = <BytecodeStackFrame> frame;
      if (frame.type === StackFrameType.BYTECODE) {
        // This line will be preceded by a line that prints the method, so can be short n' sweet.
        trace(`  Returning: ${debug_var(rv)}`);
      }

      trace(`\nT${this.getRef()} D${this.getStackTrace().length + 1} Returning value from ${frameCast.method.getFullSignature()} [${frameCast.method.accessFlags.isNative() ? 'Native' : 'Bytecode'}]: ${debug_var(rv)}`);
      assert(validateReturnValue(this, frameCast.method,
        frameCast.method.returnType, this.bsCl,
        frameCast.method.cls.getLoader(), rv, rv2), `Invalid return value for method ${frameCast.method.getFullSignature()}`);
    }
    // Tell the top of the stack that this RV is waiting for it.
    var idx: number = stack.length - 1;
    // If idx is 0, then the thread will TERMINATE next time it enters its main
    // loop.
    if (idx >= 0) {
      stack[idx].scheduleResume(this, rv, rv2);
    }

    // Thread state transition.
    this.setStatus(ThreadStatus.RUNNABLE);
  }

  /**
   * Pops the top stackframe off of the call stack.
   * WARNING: SHOULD ONLY BE CALLED BY InternalStackFrame.run()!
   */
  public framePop(): void {
    this.stack.pop();
  }

  /**
   * Throws the given JVM exception. Causes the thread to unwind the stack until
   * it can find a stack frame that can handle the exception.
   *
   * Causes the following state transition:
   * * RUNNING => RUNNABLE
   * * RUNNABLE => RUNNABLE
   * * ASYNC_WAITING => RUNNABLE
   *
   * Or, if the exception is uncaught, one of the following transitions:
   * * RUNNING => TERMINATED
   * * RUNNABLE => TERMINATED
   * * ASYNC_WAITING => TERMINATED
   *
   * It is not valid to call this method if the thread is in any other state.
   */
  public throwException(exception: JVMTypes.java_lang_Throwable): void {
    assert(this.status === ThreadStatus.RUNNABLE || this.status === ThreadStatus.ASYNC_WAITING,
      `Tried to throw exception while thread was in state ${ThreadStatus[this.status]}`);
    var stack = this.stack, idx: number = stack.length - 1;

    // Stack may actually be empty, so guard against this.
    if (idx >= 0) {
      // An internal stack frame cannot process its own thrown exception.
      if (stack[idx].type === StackFrameType.INTERNAL) {
        stack.pop();
        idx--;
      }

      // Find a stack frame that can handle the exception.
      // Set our status *before* scheduling the exception. Some exception handlers
      // may want to do something asynchronous before resuming execution.
      this.setStatus(ThreadStatus.RUNNABLE);
      while (stack.length > 0 && !stack[idx].scheduleException(this, exception)) {
        stack.pop();
        idx--;
      }
    }

    if (stack.length === 0) {
      // Uncaught exception!
      this.handleUncaughtException(exception);
    }
  }

  /**
   * Construct a new exception object of the given class with the given message.
   * Convenience function for native JavaScript code.
   * @param clsName Name of the class (e.g. "Ljava/lang/Throwable;")
   * @param msg The message to include with the exception.
   */
  public throwNewException<T extends JVMTypes.java_lang_Throwable>(clsName: string, msg: string) {
    var cls = <ReferenceClassData<T>> this.getLoader().getInitializedClass(this, clsName),
      throwException = () => {
        var eCons = cls.getConstructor(this),
          e = new eCons(this);

        // Construct the exception, and throw it when done.
        e['<init>(Ljava/lang/String;)V'](this, [initString(this.bsCl, msg)], (err?: JVMTypes.java_lang_Throwable) => {
          if (err) {
            this.throwException(err);
          } else {
            this.throwException(e);
          }
        });
      };
    if (cls != null) {
      // No initialization required.
      throwException();
    } else {
      // Initialization required.
      this.setStatus(ThreadStatus.ASYNC_WAITING);
      this.getLoader().initializeClass(this, clsName, (cdata: ReferenceClassData<T>) => {
        if (cdata != null) {
          cls = cdata;
          throwException();
        }
      }, false);
    }
  }

  /**
   * Handles an uncaught exception on a thread.
   */
  public handleUncaughtException(exception: JVMTypes.java_lang_Throwable) {
    this.jvmThreadObj['dispatchUncaughtException(Ljava/lang/Throwable;)V'](this, [exception]);
  }

  public close() {
    this.jvm = null;
  }
}

/**
 * [DEBUG] Stores all of the valid thread transitions.
 * @todo Any way to make this smaller?
 * @todo Move into 'debug' module that we NOP out in release builds.
 */
export var validTransitions: { [oldStatus: number]: { [newStatus: number]: string } } = {};
validTransitions[ThreadStatus.NEW] = {};
validTransitions[ThreadStatus.NEW][ThreadStatus.RUNNABLE] = "RunMethod invoked on new thread";
validTransitions[ThreadStatus.NEW][ThreadStatus.ASYNC_WAITING] = "[JVM bootup only] Internal operation occurs on new thread";
validTransitions[ThreadStatus.NEW][ThreadStatus.TERMINATED] = "[JVM halt0 only] When the JVM shuts down, it terminates all threads, including those that have never been run.";
validTransitions[ThreadStatus.ASYNC_WAITING] = {};
validTransitions[ThreadStatus.ASYNC_WAITING][ThreadStatus.RUNNABLE] = "Async operation completes";
validTransitions[ThreadStatus.ASYNC_WAITING][ThreadStatus.TERMINATED] = "RunMethod completes and callstack is empty";
validTransitions[ThreadStatus.BLOCKED] = {};
validTransitions[ThreadStatus.BLOCKED][ThreadStatus.RUNNABLE] = "Acquires monitor, or is interrupted";
validTransitions[ThreadStatus.BLOCKED][ThreadStatus.TERMINATED] = "Thread is terminated whilst blocked.";
validTransitions[ThreadStatus.PARKED] = {};
validTransitions[ThreadStatus.PARKED][ThreadStatus.ASYNC_WAITING] = "Balancing unpark, or is interrupted";
validTransitions[ThreadStatus.PARKED][ThreadStatus.TERMINATED] = "Thread is terminated whilst parked.";
validTransitions[ThreadStatus.RUNNABLE] = {};
validTransitions[ThreadStatus.RUNNABLE][ThreadStatus.ASYNC_WAITING] = "Thread performs an asynchronous JavaScript operation";
validTransitions[ThreadStatus.RUNNABLE][ThreadStatus.TERMINATED] = "Callstack is empty";
validTransitions[ThreadStatus.RUNNABLE][ThreadStatus.BLOCKED] = "Thread waits to acquire monitor";
validTransitions[ThreadStatus.RUNNABLE][ThreadStatus.WAITING] = "Thread waits on monitor (Object.wait)";
validTransitions[ThreadStatus.RUNNABLE][ThreadStatus.TIMED_WAITING] = "Thread waits on monitor with timeout (Object.wait)";
validTransitions[ThreadStatus.RUNNABLE][ThreadStatus.PARKED] = "Thread parks itself";
validTransitions[ThreadStatus.TERMINATED] = {};
validTransitions[ThreadStatus.TERMINATED][ThreadStatus.NEW] = "Thread is resurrected for re-use";
validTransitions[ThreadStatus.TERMINATED][ThreadStatus.RUNNABLE] = "Thread is resurrected for re-use";
validTransitions[ThreadStatus.TERMINATED][ThreadStatus.ASYNC_WAITING] = "[JVM Bootup] Thread is resurrected for internal operation";
validTransitions[ThreadStatus.TIMED_WAITING] = {};
validTransitions[ThreadStatus.TIMED_WAITING][ThreadStatus.RUNNABLE] = "Timer expires, or thread is interrupted, and thread immediately acquires lock";
validTransitions[ThreadStatus.TIMED_WAITING][ThreadStatus.UNINTERRUPTABLY_BLOCKED] = "Thread is interrupted or notified, or timer expires, and lock already owned";
validTransitions[ThreadStatus.TIMED_WAITING][ThreadStatus.TERMINATED] = "Thread is terminated whilst waiting.";
validTransitions[ThreadStatus.UNINTERRUPTABLY_BLOCKED] = {};
validTransitions[ThreadStatus.UNINTERRUPTABLY_BLOCKED][ThreadStatus.RUNNABLE] = "Thread acquires monitor";
validTransitions[ThreadStatus.UNINTERRUPTABLY_BLOCKED][ThreadStatus.TERMINATED] = "Thread is terminated whilst blocked.";
validTransitions[ThreadStatus.WAITING] = {};
validTransitions[ThreadStatus.WAITING][ThreadStatus.RUNNABLE] = "Thread is interrupted, and immediately acquires lock";
validTransitions[ThreadStatus.WAITING][ThreadStatus.UNINTERRUPTABLY_BLOCKED] = "Thread is notified or interrupted, and does not immediately acquire lock";
validTransitions[ThreadStatus.WAITING][ThreadStatus.TERMINATED] = "Thread is terminated whilst waiting.";

/**
 * [DEBUG] Ensures that a thread transition is legal.
 */
function validateThreadTransition(oldStatus: ThreadStatus, newStatus: ThreadStatus): boolean {
  var rv = validTransitions.hasOwnProperty("" + oldStatus) &&
    validTransitions[oldStatus].hasOwnProperty("" + newStatus);
  return rv;
}

/**
 * [DEBUG] Asserts that the return value of the function passes basic sanity
 * checks.
 */
function validateReturnValue(thread: JVMThread, method: Method, returnType: string, bsCl: BootstrapClassLoader, cl: ClassLoader, rv1: any, rv2: any): boolean {
  // invokeBasic is typed with an Object return value, but it can return any
  // damn type it wants, primitive or no.
  if (method.fullSignature === "java/lang/invoke/MethodHandle/invokeBasic([Ljava/lang/Object;)Ljava/lang/Object;") {
    return true;
  }

  var cls: ClassData;
  if (is_primitive_type(returnType)) {
    switch (returnType) {
      case 'Z': // Boolean
        assert(rv2 === undefined, "Second return value must be undefined for Boolean type.");
        assert(rv1 === 1 || rv1 === 0, "Booleans must be 0 or 1.");
        break;
      case 'B': // Byte
        assert(rv2 === undefined, "Second return value must be undefined for Byte type.");
        assert(rv1 <= 127 && rv1 >= -128, `Byte value for method ${method.name} is out of bounds: ${rv1}`);
        break;
      case 'C':
        assert(rv2 === undefined, "Second return value must be undefined for Character type.");
        assert(rv1 <= 65535 && rv1 >= 0, `Character value is out of bounds: ${rv1}`);
        break;
      case 'S':
        assert(rv2 === undefined, "Second return value must be undefined for Short type.");
        assert(rv1 <= 32767 && rv1 >= -32768, `Short value is out of bounds: ${rv1}`);
        break;
      case 'I': // int
        assert(rv2 === undefined, "Second return value must be undefined for Int type.");
        assert(rv1 <= 2147483647 && rv1 >= -2147483648, `Int value is out of bounds: ${rv1}`);
        break;
      case 'J': // long //-9223372036854775808 to 9223372036854775807
        assert(rv2 === null, "Second return value must be NULL for Long type.");
        assert((<gLong> rv1).lessThanOrEqual(gLong.MAX_VALUE) && (<gLong> rv1).greaterThanOrEqual(gLong.MIN_VALUE), `Long value is out of bounds: ${rv1}`);
        break;
      case 'F': // Float
        assert(rv2 === undefined, "Second return value must be undefined for Float type.");
        // NaN !== NaN, so we have to have a special case here.
        assert(wrapFloat(rv1) === rv1 || (isNaN(rv1) && isNaN(wrapFloat(rv1))), `Float value is out of bounds: ${rv1}`);
        break;
      case 'D': // Double
        assert(rv2 === null, "Second return value must be NULL for Double type.");
        assert(typeof rv1 === 'number', `Invalid double value: ${rv1}`);
        break;
      case 'V':
        assert(rv1 === undefined && rv2 === undefined, "Return values must be undefined for Void type");
        break;
    }
  } else if (is_array_type(returnType)) {
    assert(rv2 === undefined, "Second return value must be undefined for array type.");
    assert(rv1 === null || (typeof rv1 === 'object' && typeof rv1['getClass'] === 'function'), `Invalid array object: ${rv1}`);
    if (rv1 != null) {
      cls = assertClassInitializedOrResolved(thread, cl, returnType, true);
      assert(rv1.getClass().isCastable(cls), `Return value of type ${rv1.getClass().getInternalName()} unable to be cast to return type ${returnType}.`);
    }
  } else {
    assert(is_reference_type(returnType), `Invalid reference type: ${returnType}`);
    assert(rv2 === undefined, `Second return value must be undefined for reference type.`);
    // All objects and arrays are instances of java/lang/Object.
    assert(rv1 === null || rv1 instanceof (<ReferenceClassData<JVMTypes.java_lang_Object>> bsCl.getInitializedClass(thread, 'Ljava/lang/Object;')).getConstructor(thread), `Reference return type must be an instance of Object; value: ${rv1}`);
    if (rv1 != null) {
      cls = assertClassInitializedOrResolved(thread, cl, returnType, false);
      if (!cls.accessFlags.isInterface()) {
        // You can return an interface type without initializing it,
        // since they don't need to be initialized until you try to
        // invoke one of their
        // NOTE: We don't check if the class is in the INITIALIZED state,
        // since it is possible that it is currently in the process of being
        // initialized. getInitializedClass handles this subtlety.
        assertClassInitializedOrResolved(thread, cl, returnType, true);
      }
      assert(rv1.getClass().isCastable(cls), `Unable to cast ${rv1.getClass().getInternalName()} to ${returnType}.`);
    }
  }
  return true;
}

function assertClassInitializedOrResolved(thread: JVMThread, cl: ClassLoader, type: string, initialized: boolean): ClassData {
  var cls: ClassData = null;
  // Break out of loop once class is found.
  while (cls === null) {
    cls = initialized ? cl.getInitializedClass(thread, type) : cl.getResolvedClass(type);
    if (cl.getLoaderObject() !== null) {
      if (cl.getLoaderObject()['java/lang/ClassLoader/parent'] === null) {
        cl = thread.getBsCl();
      } else {
        cl = cl.getLoaderObject()['java/lang/ClassLoader/parent'].$loader;
      }
    } else {
      // We just checked the bootstrap classloader, so we reached the root.
      assert(cls !== null, `Unable to get initialized class for type ${type}.`);
    }
  }
  return cls;
}

function printConstantPoolItem(cpi: IConstantPoolItem): string {
  switch (cpi.getType()) {
    case ConstantPoolItemType.METHODREF:
      var cpiMR = <MethodReference> cpi;
      return ext_classname(cpiMR.classInfo.name) + "." + cpiMR.signature;
    case ConstantPoolItemType.INTERFACE_METHODREF:
      var cpiIM = <InterfaceMethodReference> cpi;
      return ext_classname(cpiIM.classInfo.name) + "." + cpiIM.signature;
    case ConstantPoolItemType.FIELDREF:
      var cpiFR = <FieldReference> cpi;
      return ext_classname(cpiFR.classInfo.name) + "." + cpiFR.nameAndTypeInfo.name + ":" + ext_classname(cpiFR.nameAndTypeInfo.descriptor);
    case ConstantPoolItemType.NAME_AND_TYPE:
      var cpiNAT = <NameAndTypeInfo> cpi;
      return cpiNAT.name + ":" + cpiNAT.descriptor;
    case ConstantPoolItemType.CLASS:
      var cpiClass = <ClassReference> cpi;
      return ext_classname(cpiClass.name);
    default:
      return debug_var((<any> cpi).value);
  }
}

// TODO: Prefix behind DEBUG, cache lowercase opcode names.
export var OpcodeLayoutPrinters: {[layoutAtom: number]: (method: Method, code: NodeBuffer, pc: number) => string} = {};
OpcodeLayoutPrinters[OpcodeLayoutType.OPCODE_ONLY] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase();
OpcodeLayoutPrinters[OpcodeLayoutType.CONSTANT_POOL] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase() + " " + printConstantPoolItem(method.cls.constantPool.get(code.readUInt16BE(pc + 1)));
OpcodeLayoutPrinters[OpcodeLayoutType.CONSTANT_POOL_UINT8] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase() + " " + printConstantPoolItem(method.cls.constantPool.get(code[pc + 1]));
OpcodeLayoutPrinters[OpcodeLayoutType.CONSTANT_POOL_AND_UINT8_VALUE] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase() + " " + printConstantPoolItem(method.cls.constantPool.get(code.readUInt16BE(pc + 1))) + " " + code[pc + 3];
OpcodeLayoutPrinters[OpcodeLayoutType.UINT8_VALUE] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase() + " " + code[pc + 1];
OpcodeLayoutPrinters[OpcodeLayoutType.UINT8_AND_INT8_VALUE] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase() + " " + code[pc + 1] + " " + code[pc + 2];
OpcodeLayoutPrinters[OpcodeLayoutType.INT8_VALUE] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase() + " " + code.readInt8(pc + 1);
OpcodeLayoutPrinters[OpcodeLayoutType.INT16_VALUE] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase() + " " + code.readInt16BE(pc + 1);
OpcodeLayoutPrinters[OpcodeLayoutType.INT32_VALUE] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase() + " " + code.readInt32BE(pc + 1);
OpcodeLayoutPrinters[OpcodeLayoutType.ARRAY_TYPE] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase() + " " + ArrayTypes[code[pc + 1]];
OpcodeLayoutPrinters[OpcodeLayoutType.WIDE] = (method: Method, code: NodeBuffer, pc: number) => OpCode[code[pc]].toLowerCase();

export function annotateOpcode(op: number, method: Method, code: NodeBuffer, pc: number): string {
  return OpcodeLayoutPrinters[OpcodeLayouts[op]](method, code, pc);
}
