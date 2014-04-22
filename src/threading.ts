import runtime = require('./runtime');
import ClassData = require('./ClassData');
import java_object = require('./java_object');
import methods = require('./methods');
import enums = require('./enums');
import assert = require('./assert');
import gLong = require('./gLong');
import opcodes = require('./opcodes');
import attributes = require('./attributes');
import logging = require('./logging');

var debug = logging.debug;

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
   */
  scheduleResume: (thread: JVMThread, rv?: any) => void;
  /**
   * Checks if the method can handle the given exception. If so,
   * configures the stack frame to handle the exception.
   * @return True if the method can handle the exception.
   */
  scheduleException: (thread: JVMThread, e: java_object.JavaObject) => boolean;
  /**
   * This stack frame's type.
   */
  type: enums.StackFrameType;
}

/**
 * Represents a stack frame for a bytecode method.
 */
export class BytecodeStackFrame implements IStackFrame {
  public pc: number = 0;
  public locals: any[] = [];
  public stack: any[];

  /**
   * Constructs a bytecode method's stack frame.
   * @param method The bytecode method to run.
   * @param args The arguments to pass to the bytecode method.
   */
  constructor(public method: methods.Method, args: any[]) {
    assert(!method.access_flags.native && !method.access_flags.abstract);
    this.stack = args;
  }

  public run(thread: JVMThread): void {
    var method = this.method, code = (<attributes.Code> this.method.code).opcodes;
    if (method.access_flags.synchronized && this.pc === 0) {
      // We are starting a synchronized method! These must implicitly enter
      // their respective locks.
      if (!method.method_lock(this).enter(thread)) {
        // Failed. Thread is automatically blocked. Return.
        assert(thread.getState() === enums.ThreadState.BLOCKED);
        return;
      }
    }

    while (thread.getState() === enums.ThreadState.RUNNABLE) {
      var op = code[this.pc];
      if (op.execute(thread) === false) {
        break;
      }
      this.pc += 1 + op.byte_count;
    }

    // XXX: Monitorexit if return opcode???
  }

  public scheduleResume(thread: JVMThread, rv?: any): void {
    if (rv) {
      this.stack.push(rv);
    }
  }

  public scheduleException(thread: JVMThread, e: java_object.JavaObject): boolean {
    // STEP 1: We need the pc value of the invoke opcode that caused this mess.
    // Rewind until we find it.
    var code: attributes.Code = this.method.code,
      opcodes: opcodes.Opcode[] = code.opcodes,
      pc = this.pc, method = this.method;
    pc -= 3;
    while (pc >= 0 && (opcodes[pc] == null || opcodes[pc].name.indexOf('invoke') !== 0)) {
      pc--;
    }
    // We either found it, or we're at 0. Good enuff.
    this.pc = pc;

    // STEP 2: See if we can find an appropriate handler for this exception!
    var exceptionHandlers = code.exception_handlers,
      ecls = e.cls, handler: attributes.ExceptionHandler, i: number;
    for (i = 0; i < exceptionHandlers.length; i++) {
      var eh = exceptionHandlers[i];
      if (eh.start_pc <= pc && pc < eh.end_pc) {
        var resolvedCatchType = method.cls.loader.get_resolved_class(eh.catch_type, true);
        // NOTE: If this exception handler type isn't resolved, then this
        // couldn't possibly be the right exception handler -- all of the classes
        // that the exception could be cast as must be resolved by now.
        if (resolvedCatchType != null) {
          if (eh.catch_type === "<any>" || ecls.is_castable(resolvedCatchType)) {
            handler = eh;
            break;
          }
        }
      }
    }

    // STEP 3: Either continue on if we could not find an appropriate handler,
    // or set up the stack for appropriate resumption.
    if (handler != null) {
      // Found the handler.
      debug("caught " + e.cls.get_type() + " in " + method.full_signature() + " as subclass of " + handler.catch_type);
      this.stack = [e]; // clear out anything on the stack; it was made during the try block
      this.pc = handler.handler_pc;
      return true;
    } else {
      // abrupt method invocation completion
      debug("exception not caught, terminating " + method.full_signature());
      // STEP 4: Synchronized method? Exit from the method's monitor.
      if (method.access_flags.synchronized) {
        method.method_lock(this).exit(thread);
      }
      return false;
    }
  }

  /**
   * Indicates the type of this stack frame.
   */
  public type: enums.StackFrameType = enums.StackFrameType.BYTECODE;
}

/**
 * Represents a native method's stack frame.
 */
class NativeStackFrame implements IStackFrame {
  private nativeMethod: Function;

  /**
   * Constructs a native method's stack frame.
   * @param method The native method to run.
   * @param args The arguments to pass to the native method.
   */
  constructor(public method: methods.Method, private args: any[]) {
    assert(method.access_flags.native);
    this.nativeMethod = method.code;
  }

  /**
   * Calls the native method.
   * NOTE: Should only be called once.
   */
  public run(thread: JVMThread): void {
    this.args.unshift(thread);
    var rv: any = this.nativeMethod.apply(null, this.args);
    if (thread.getState() === enums.ThreadState.RUNNABLE) {
      // Normal native method exit.
      thread.asyncReturn(rv);
    }
  }

  /**
   * N/A
   */
  public scheduleResume(thread: JVMThread, rv?: any): void {
    // NOP
  }

  /**
   * Not relevant; the first execution block of a native method will never
   * receive an exception.
   */
  public scheduleException(thread: JVMThread, e: java_object.JavaObject): boolean {
    return false;
  }

  public type: enums.StackFrameType = enums.StackFrameType.NATIVE;
}

/**
 * InternalStackFrames are used by the JVM to launch JVM functions that
 * eventually call back into JavaScript code when they complete or throw a
 * fatal exception.
 */
class InternalStackFrame implements IStackFrame {
  private isException: boolean = false;
  private val: any;

  /**
   * @param cb Callback function. Called with an exception if one occurs, or
   *   the return value from the called method, if relevant.
   */
  constructor(private cb: (thread: JVMThread, e?: java_object.JavaObject, rv?: any) => void) {
  }

  public run(thread: JVMThread): void {
    // Pop myself off of the stack.
    thread.framePop();
    // Pause the thread before returning into native JavaScript code.
    thread.setState(enums.ThreadState.WAITING);
    if (this.isException) {
      this.cb(thread, this.val);
    } else {
      this.cb(thread, null, this.val);
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
  public scheduleException(thread: JVMThread, e: java_object.JavaObject): boolean {
    this.isException = true;
    this.val = e;
    return true;
  }

  public type: enums.StackFrameType = enums.StackFrameType.INTERNAL;
}

/**
 * Represents the JVM thread pool. Handles scheduling duties.
 */
export class ThreadPool {
  private threads: JVMThread[] = [];
  private runningThread: JVMThread;

  private findNextThread(): JVMThread {
    var i: number, threads = this.threads;
    for (i = 0; i < threads.length; i++) {
      if (threads[i].getState() === enums.ThreadState.RUNNABLE) {
        return threads[i];
      }
    }
    return null;
  }

  public nowRunnable(thread: JVMThread): void {
    // We only care if no threads are running right now.
    if (!this.runningThread) {
      this.runningThread = thread;
      // Schedule the thread to run.
      setImmediate(() => { this.run(); });
    }
  }

  public nowTerminated(thread: JVMThread): void {
    var idx: number = this.threads.indexOf(thread);
    assert(idx >= 0);
    // Remove the specified thread from the threadpool.
    this.threads.splice(idx, 1);

    // If this was the running thread, schedule a new one to run.
    if (this.runningThread === thread) {
      this.runningThread = null;
      setImmediate(() => {
        this.run();
      });
    }
  }

  public nowBlocked(thread: JVMThread): void {
    // If this was the running thread, schedule a new one to run.
    if (thread === this.runningThread) {
      this.runningThread = null;
      setImmediate(() => {
        this.run();
      });
    }
  }

  public run() {
    if (this.runningThread) {
      this.runningThread.run();
    } else {
      this.runningThread = this.findNextThread();
      if (this.runningThread) {
        this.runningThread.run();
      }
      // Nothing to do. Need to wait until a thread becomes RUNNABLE.
    }
  }
}

/**
 * Represents a single JVM thread.
 */
export class JVMThread extends java_object.JavaObject {
  /**
   * The current state of this thread, from the JVM level.
   */
  private state: enums.ThreadState = enums.ThreadState.NEW;

  /**
   * The call stack.
   */
  private stack: IStackFrame[] = [];

  /**
   * Initializes a new JVM thread. Starts the thread in the NEW state.
   */
  constructor(private tpool: ThreadPool, cls: ClassData.ReferenceClassData, obj?: any) {
    super(cls, obj);
  }

  /**
   * The thread's main execution loop. Everything starts here!
   * NOTE: This should only be called from the ThreadPool.
   */
  public run(): void {
    var stack = this.stack;
    while (this.state === enums.ThreadState.RUNNABLE && stack.length > 0) {
      stack[stack.length - 1].run(this);      
    }

    if (stack.length === 0) {
      // This thread has finished!
      this.setState(enums.ThreadState.TERMINATED);
    }
  }

  /**
   * Changes the thread's current state.
   */
  public setState(state: enums.ThreadState): void {
    if (this.state !== state) {
      // Illegal transition: Terminated => anything else
      assert(this.state !== enums.ThreadState.TERMINATED);
      this.state = state;
      if (state === enums.ThreadState.RUNNABLE) {
        // Inform the thread pool, in case no threads are currently scheduled.
        this.tpool.nowRunnable(this);
      } else if (state === enums.ThreadState.TERMINATED) {
        // Tell the threadpool to forget about us.
        this.tpool.nowTerminated(this);
      } else {
        // Tell the threadpool we can't run right now.
        this.tpool.nowBlocked(this);
      }
    }
  }

  /**
   * Get the thread's current state.
   */
  public getState(): enums.ThreadState {
    return this.state;
  }

  /**
   * Runs the given method on the thread. Calls the callback with its return
   * value, or an exception if one has occurred.
   * 
   * The method can be a bytecode method or a native method.
   * 
   * Causes the following state transitions:
   * * NEW => RUNNABLE
   * * RUNNABLE => RUNNABLE
   * * WAITING => RUNNABLE
   * 
   * It is not valid to call this method if the thread is in any other state.
   */
  public runMethod(method: methods.Method, args: any[], cb?: (e?: java_object.JavaObject, rv?: any) => void): void {
    assert(this.state === enums.ThreadState.NEW || this.state === enums.ThreadState.RUNNABLE || this.state === enums.ThreadState.WAITING);
    if (cb) {
      // Callback specified. Need to add an internal stack frame that will handle
      // calling back into JavaScript land.
      this.stack.push(new InternalStackFrame(cb));
    }

    // Add a new stack frame for the method.
    if (method.access_flags.native) {
      this.stack.push(new NativeStackFrame(method, args));
    } else {
      this.stack.push(new BytecodeStackFrame(method, args));
    }

    // Thread state transition.
    this.setState(enums.ThreadState.RUNNABLE);
  }

  /**
   * Returns from the currently executing method with the given return value.
   * Used by asynchronous native methods.
   * 
   * Causes the following state transition:
   * * WAITING => RUNNABLE
   * * RUNNABLE => RUNNABLE
   * 
   * It is not valid to call this method if the thread is in any other state.
   */
  public asyncReturn(): void;
  public asyncReturn(rv: number): void;
  public asyncReturn(rv: gLong): void;
  public asyncReturn(rv: java_object.JavaObject): void;
  public asyncReturn(rv: java_object.JavaArray): void;
  public asyncReturn(rv?: any): void {
    var stack = this.stack, frame: IStackFrame;
    assert(this.state === enums.ThreadState.RUNNABLE || this.state === enums.ThreadState.WAITING);
    // Pop off the current method.
    frame = stack.pop();
    // Tell the top of the stack that this RV is waiting for it.
    var idx: number = stack.length - 1;
    // If idx is 0, then the thread will TERMINATE next time it enters its main
    // loop.
    if (idx >= 0) {
      stack[idx].scheduleResume(rv);
    }

    // Thread state transition.
    this.setState(enums.ThreadState.RUNNABLE);
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
   * * WAITING => RUNNABLE
   * * RUNNABLE => RUNNABLE
   * 
   * Or, if the exception is uncaught, one of the following transitions:
   * * WAITING => TERMINATED
   * * RUNNABLE => TERMINATED
   * 
   * It is not valid to call this method if the thread is in any other state.
   */
  public throwException(exception: java_object.JavaObject): void {
    assert(this.state === enums.ThreadState.RUNNABLE || this.state === enums.ThreadState.WAITING);
    assert(this.stack.length > 0);
    var stack = this.stack, idx: number = stack.length - 1;
    // When a native or internal stack frame throws an exception, it cannot
    // process its own exception.
    if (stack[idx].type !== enums.StackFrameType.BYTECODE) {
      stack.pop();
      idx--;
    }

    // Find a stack frame that can handle the exception.
    while (stack.length > 0 && !stack[idx].scheduleException(this, exception)) {
      stack.pop();
      idx--;
    }

    if (stack.length === 0) {
      // !!! UNCAUGHT EXCEPTION !!!
      var threadCls = <ClassData.ReferenceClassData> this.rs.get_bs_class('Ljava/lang/Thread;'),
        dispatchMethod = threadCls.method_lookup(this.rs, 'dispatchUncaughtException(Ljava/lang/Throwable;)V');
      this.runMethod(dispatchMethod, [this, exception]);
    } else {
      // Thread is now runnable.
      this.setState(enums.ThreadState.RUNNABLE);
    }
  }

  /**
   * Construct a new exception object of the given class with the given message.
   * Convenience function for native JavaScript code.
   * @param clsName Name of the class (e.g. "Ljava/lang/Throwable;")
   * @param msg The message to include with the exception.
   */
  public throwNewException(clsName: string, msg: string) {
    var cls: ClassData.ReferenceClassData = null,
      e = new java_object.JavaObject(this.rs, cls),
      cnstrctr = cls.method_lookup(this, '<init>(Ljava/lang/String;)V');

    // Construct the exception, and throw it when done.
    this.runMethod(cnstrctr, [e, java_object.initString(msg)], (err, rv) => {
      if (err) {
        this.throwException(err);
      } else {
        this.throwException(e);
      }
    });
  }
}
