import ClassData = require('./ClassData');
import ClassLoader = require('./ClassLoader');
import java_object = require('./java_object');
import methods = require('./methods');
import enums = require('./enums');
import assert = require('./assert');
import gLong = require('./gLong');
import opcodes = require('./opcodes');
import attributes = require('./attributes');
import logging = require('./logging');
import JVM = require('./jvm');

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
   * @rv2 The second return value, which will always be null if applicable.
   */
  scheduleResume: (thread: JVMThread, rv?: any, rv2?: any) => void;
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
  /**
   * Retrieve a stack trace frame from this stack trace. If this stack frame
   * should not be language-visible, return null.
   */
  getStackTraceFrame(): IStackTraceFrame;
}

/**
 * Represents a stack frame for a bytecode method.
 */
export class BytecodeStackFrame implements IStackFrame {
  public pc: number = 0;
  public locals: any[] = [];
  public stack: any[];
  public returnToThreadLoop: boolean = false;

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
    var method = this.method, code = this.method.getCode();
    if (method.access_flags.synchronized && this.pc === 0) {
      // We are starting a synchronized method! These must implicitly enter
      // their respective locks.
      if (!method.method_lock(thread, this).enter(thread)) {
        // Failed. Thread is automatically blocked. Return.
        assert(thread.getStatus() === enums.ThreadStatus.BLOCKED);
        return;
      }
    }

    // Reset the returnToThreadLoop switch. The current value is leftover
    // from the previous time this method was run, and is meaningless.
    this.returnToThreadLoop = false;

    // Run until we get the signal to return to the thread loop.
    while (!this.returnToThreadLoop) {
      var op = code[this.pc];
      op.execute(thread, this);
    }
  }

  public scheduleResume(thread: JVMThread, rv?: any, rv2?: any): void {
    if (rv) {
      this.stack.push(rv);
    }
    if (rv2) {
      this.stack.push(rv2);
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
  public scheduleException(thread: JVMThread, e: java_object.JavaObject): boolean {
    // STEP 1: We need the pc value of the invoke opcode that caused this mess.
    // Rewind until we find it.
    var code = this.method.getCodeAttribute(),
      opcodes: opcodes.Opcode[] = this.method.getCode(),
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
        if (eh.catch_type === "<any>") {
          handler = eh;
          break;
        } else {
          var resolvedCatchType = method.cls.loader.getResolvedClass(eh.catch_type);
          if (resolvedCatchType != null) {
            if (ecls.is_castable(resolvedCatchType)) {
              handler = eh;
              break;
            }
          } else {
            // ASYNC PATH: We'll need to asynchronously resolve these handlers.
            var handlerClasses: string[] = [];
            exceptionHandlers.forEach((handler: attributes.ExceptionHandler) => {
              if (handler.catch_type !== "<any>") {
                handlerClasses.push(handler.catch_type);
              }
            });
            method.cls.loader.resolveClasses(thread, handlerClasses, (classes) => {
              if (classes !== null) {
                // Rethrow the exception to trigger scheduleException again.
                // @todo If the ClassLoader throws an exception during resolution,
                // this could result in an infinite loop.
                thread.throwException(e);
              }
            });
            // Tell the thread we'll handle it.
            return true;
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
        method.method_lock(thread, this).exit(thread);
      }
      return false;
    }
  }

  /**
   * Returns the classloader for the stack frame.
   */
  public getLoader(): ClassLoader.ClassLoader {
    return this.method.cls.loader;
  }

  /**
   * Indicates the type of this stack frame.
   */
  public type: enums.StackFrameType = enums.StackFrameType.BYTECODE;

  public getStackTraceFrame(): IStackTraceFrame {
    return {
      method: this.method,
      pc: this.pc,
      stack: this.stack.slice(0),
      locals: this.locals.slice(0)
    };
  }
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
    this.nativeMethod = method.getNativeFunction();
  }

  /**
   * Calls the native method.
   * NOTE: Should only be called once.
   */
  public run(thread: JVMThread): void {
    this.args.unshift(thread);
    var rv: any = this.nativeMethod.apply(null, this.args);
    if (thread.getStatus() === enums.ThreadStatus.RUNNABLE) {
      // Normal native method exit.
      var returnType = this.method.return_type;
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
  public scheduleException(thread: JVMThread, e: java_object.JavaObject): boolean {
    return false;
  }

  public type: enums.StackFrameType = enums.StackFrameType.NATIVE;

  public getStackTraceFrame(): IStackTraceFrame {
    return {
      method: this.method,
      pc: -1,
      stack: [],
      locals: []
    };
  }
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
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
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

  public getStackTraceFrame(): IStackTraceFrame {
    // These should not be language visible.
    return null;
  }
}

/**
 * Represents the JVM thread pool. Handles scheduling duties.
 */
export class ThreadPool {
  private threads: JVMThread[] = [];
  private runningThread: JVMThread;
  private parkCounts: { [threadRef: number]: number } = {};

  constructor(private jvm: JVM, private bsCl: ClassLoader.BootstrapClassLoader) {

  }

  public getThreads(): JVMThread[] {
    // Return a copy of our internal array.
    return this.threads.slice(0);
  }

  public newThread(cls: ClassData.ReferenceClassData): JVMThread {
    var thread = new JVMThread(this.bsCl, this, cls);
    this.threads.push(thread);
    return thread;
  }

  public getJVM(): JVM {
    return this.jvm;
  }

  private scheduleNextThread(): void {
    var i: number, threads = this.threads;
    assert(this.runningThread == null);
    for (i = 0; i < threads.length; i++) {
      if (threads[i].getStatus() === enums.ThreadStatus.RUNNABLE) {
        this.runningThread = threads[i];
        setImmediate(() => { threads[i].setStatus(enums.ThreadStatus.RUNNING); });
        return;
      }
    }
    return null;
  }

  public threadRunnable(thread: JVMThread): void {
    // We only care if no threads are running right now.
    if (!this.runningThread) {
      this.runningThread = thread;
      // Schedule the thread to run.
      setImmediate(() => { thread.setStatus(enums.ThreadStatus.RUNNING); });
    }
  }

  public threadTerminated(thread: JVMThread): void {
    var idx: number = this.threads.indexOf(thread);
    assert(idx >= 0);
    // Remove the specified thread from the threadpool.
    this.threads.splice(idx, 1);

    // If this was the running thread, schedule a new one to run.
    if (this.runningThread === thread) {
      this.runningThread = null;
      this.scheduleNextThread();
    }
  }

  public threadSuspended(thread: JVMThread): void {
    // If this was the running thread, schedule a new one to run.
    if (thread === this.runningThread) {
      this.runningThread = null;
      this.scheduleNextThread();
    }
  }

  public park(thread: JVMThread): void {
    if (!this.parkCounts.hasOwnProperty("" + thread.ref)) {
      this.parkCounts[thread.ref] = 0;
    }

    if (++this.parkCounts[thread.ref] > 0) {
      thread.setStatus(enums.ThreadStatus.PARKED);
    }
  }

  public unpark(thread: JVMThread): void {
    if (!this.parkCounts.hasOwnProperty("" + thread.ref)) {
      this.parkCounts[thread.ref] = 0;
    }

    if (--this.parkCounts[thread.ref] <= 0) {
      thread.setStatus(enums.ThreadStatus.RUNNABLE);
    }
  }

  public completelyUnpark(thread: JVMThread): void {
    this.parkCounts[thread.ref] = 0;
    thread.setStatus(enums.ThreadStatus.RUNNABLE);
  }

  public isParked(thread: JVMThread): boolean {
    return this.parkCounts[thread.ref] > 0;
  }
}

export interface IStackTraceFrame {
  method: methods.Method;
  pc: number;
  stack: any[];
  locals: any[];
}

/**
 * Represents a single JVM thread.
 */
export class JVMThread extends java_object.JavaObject {
  /**
   * The current state of this thread, from the JVM level.
   */
  private status: enums.ThreadStatus = enums.ThreadStatus.NEW;

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
  private monitor: java_object.Monitor = null;

  /**
   * Initializes a new JVM thread. Starts the thread in the NEW state.
   */
  constructor(private bsCl: ClassLoader.BootstrapClassLoader,
    private tpool: ThreadPool, cls: ClassData.ReferenceClassData, obj?: any) {
    super(cls, obj);
  }

  /**
   * Check if this thread's interrupted flag is set.
   */
  public isInterrupted(): boolean {
    return this.interrupted;
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
  public getBsCl(): ClassLoader.BootstrapClassLoader {
    return this.bsCl;
  }

  /**
   * Retrieve the thread pool that this thread belongs to.
   */
  public getThreadPool(): ThreadPool {
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
   * The thread's main execution loop. Everything starts here!
   */
  private run(): void {
    var stack = this.stack;
    while (this.status === enums.ThreadStatus.RUNNING && stack.length > 0) {
      stack[stack.length - 1].run(this);
    }

    if (stack.length === 0) {
      // This thread has finished!
      this.setStatus(enums.ThreadStatus.TERMINATED);
    }
  }

  /**
   * [DEBUG] Performs a sanity check on the thread.
   */
  private sanityCheck(): boolean {
    switch (this.status) {
      case enums.ThreadStatus.NEW:
        return true;
      case enums.ThreadStatus.RUNNING:
        return this.stack.length > 0;
      case enums.ThreadStatus.RUNNABLE:
        return this.stack.length > 0;
      case enums.ThreadStatus.TIMED_WAITING:
        return this.monitor != null && this.monitor.isTimedWaiting(this);
      case enums.ThreadStatus.WAITING:
        return this.monitor != null && this.monitor.isWaiting(this);
      case enums.ThreadStatus.BLOCKED:
        return this.monitor != null && this.monitor.isBlocked(this);
      case enums.ThreadStatus.ASYNC_WAITING:
        return true;
      case enums.ThreadStatus.TERMINATED:
        return true;
      case enums.ThreadStatus.PARKED:
        return this.getThreadPool().isParked(this);
      default:
        // Invalid ThreadStatus.
        return false;
    }
  }

  /**
   * Changes the thread's current state.
   */
  public setStatus(status: enums.ThreadStatus, monitor?: java_object.Monitor): void {
    if (this.status !== status) {
      // Illegal transition: Terminated => anything else
      assert(this.status !== enums.ThreadStatus.TERMINATED);
      assert(status === enums.ThreadStatus.RUNNING ? this.status === enums.ThreadStatus.RUNNABLE : true);
      this.status = status;
      this.monitor = null;
      switch (status) {
        case enums.ThreadStatus.RUNNING:
          // I'm now scheduled to run!
          this.run();
          break;
        case enums.ThreadStatus.RUNNABLE:
          // Inform the thread pool, in case no threads are currently scheduled.
          this.tpool.threadRunnable(this);
          break;
        case enums.ThreadStatus.TERMINATED:
          // Tell the threadpool to forget about us.
          this.tpool.threadTerminated(this);
          break;
        case enums.ThreadStatus.BLOCKED:
        case enums.ThreadStatus.TIMED_WAITING:
        case enums.ThreadStatus.WAITING:
          assert(monitor !== null);
          this.monitor = monitor;
          // FALLTHROUGH
        default:
          // Tell the threadpool we can't run right now.
          this.tpool.threadSuspended(this);
      }
    }
  }

  /**
   * Get this thread's monitor.
   */
  public getMonitor(): java_object.Monitor {
    return this.monitor;
  }

  /**
   * Get the thread's current state.
   */
  public getStatus(): enums.ThreadStatus {
    return this.status;
  }

  /**
   * Runs the given method on the thread. Calls the callback with its return
   * value, or an exception if one has occurred.
   *
   * The method can be a bytecode method or a native method.
   *
   * Causes the following state transitions:
   * * NEW => RUNNABLE
   * * RUNNING => RUNNABLE
   * * RUNNABLE => RUNNABLE
   * * ASYNC_WAITING => RUNNABLE
   *
   * It is not valid to call this method if the thread is in any other state.
   */
  public runMethod(method: methods.Method, args: any[], cb?: (e?: java_object.JavaObject, rv?: any) => void): void {
    assert(this.status === enums.ThreadStatus.NEW || this.status === enums.ThreadStatus.RUNNING || this.status === enums.ThreadStatus.RUNNABLE || this.status === enums.ThreadStatus.ASYNC_WAITING);
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
    this.setStatus(enums.ThreadStatus.RUNNABLE);
  }

  /**
   * Returns from the currently executing method with the given return value.
   * Used by asynchronous native methods.
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
  public asyncReturn(rv: java_object.JavaObject): void;
  public asyncReturn(rv: java_object.JavaArray): void;
  public asyncReturn(rv: number, rv2: any): void;
  public asyncReturn(rv: gLong, rv2: any): void;
  public asyncReturn(rv?: any, rv2?: any): void {
    var stack = this.stack, frame: IStackFrame;
    assert(this.status === enums.ThreadStatus.RUNNING || this.status === enums.ThreadStatus.RUNNABLE || this.status === enums.ThreadStatus.ASYNC_WAITING);
    assert(typeof (rv) !== 'boolean' && rv2 == null);
    // Pop off the current method.
    frame = stack.pop();
    // Tell the top of the stack that this RV is waiting for it.
    var idx: number = stack.length - 1;
    // If idx is 0, then the thread will TERMINATE next time it enters its main
    // loop.
    if (idx >= 0) {
      stack[idx].scheduleResume(rv, rv2);
    }

    // Thread state transition.
    this.setStatus(enums.ThreadStatus.RUNNABLE);
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
   * * WAITING => TERMINATED
   *
   * It is not valid to call this method if the thread is in any other state.
   */
  public throwException(exception: java_object.JavaObject): void {
    assert(this.status === enums.ThreadStatus.RUNNING || this.status === enums.ThreadStatus.RUNNABLE || this.status === enums.ThreadStatus.WAITING);
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
      // This should actually never happen. All executions should end at the
      // internal frame created by runMethod.
      assert(false);
    } else {
      // Thread is now runnable.
      this.setStatus(enums.ThreadStatus.RUNNABLE);
    }
  }

  /**
   * Construct a new exception object of the given class with the given message.
   * Convenience function for native JavaScript code.
   * @param clsName Name of the class (e.g. "Ljava/lang/Throwable;")
   * @param msg The message to include with the exception.
   */
  public throwNewException(clsName: string, msg: string) {
    var cls = <ClassData.ReferenceClassData> this.bsCl.getInitializedClass(clsName),
      throwException = () => {
        var e = new java_object.JavaObject(cls),
          cnstrctr = cls.method_lookup(this, '<init>(Ljava/lang/String;)V');

        // Construct the exception, and throw it when done.
        this.runMethod(cnstrctr, [e, java_object.initString(this.bsCl, msg)], (err, rv) => {
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
      this.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      this.bsCl.initializeClass(this, clsName, (cdata) => {
        if (cdata != null) {
          throwException();
        }
      }, false);
    }
  }
}
