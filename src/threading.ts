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
import util = require('./util');

var debug = logging.debug, vtrace = logging.vtrace,
  // The number of method resumes we should allow before yielding for
  // responsiveness. Updated using a cumulative moving average to ensure
  // Doppio is responsive.
  maxMethodResumes: number = 10000,
  // The number of method resumes until Doppio should yield again.
  methodResumesLeft: number = maxMethodResumes,
  // How responsive Doppio should aim to be, in milliseconds.
  responsiveness: number = 1000,
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
  public locals: any[];
  public stack: any[] = [];
  public returnToThreadLoop: boolean = false;
  public lockedMethodLock: boolean = false;

  /**
   * Constructs a bytecode method's stack frame.
   * @param method The bytecode method to run.
   * @param args The arguments to pass to the bytecode method.
   */
  constructor(public method: methods.Method, args: any[]) {
    assert(!method.access_flags.native, 'Cannot run a native method using a BytecodeStackFrame.');
    // @todo This should be a runtime error, since reflection can cause you to
    // try to do this.
    assert(!method.access_flags.abstract, 'Cannot run an abstract method!');
    this.locals = args;
  }

  public run(thread: JVMThread): void {
    var method = this.method, code = this.method.getCode();
    if (this.pc === 0) {
      vtrace("T" + thread.ref + " " + this.method.full_signature() + " [Bytecode]");
    }
    if (method.access_flags.synchronized && !this.lockedMethodLock) {
      // We are starting a synchronized method! These must implicitly enter
      // their respective locks.
      this.lockedMethodLock = method.method_lock(thread, this).enter(thread, () => {
        // Lock succeeded. Set the flag so we don't attempt to reacquire it
        // when this method reruns.
        this.lockedMethodLock = true;
      });
      if (!this.lockedMethodLock) {
        // Failed. Thread is automatically blocked. Return.
        assert(thread.getStatus() === enums.ThreadStatus.BLOCKED, "Failed to enter a monitor. Thread must be BLOCKED.");
        return;
      }
    }

    // Reset the returnToThreadLoop switch. The current value is leftover
    // from the previous time this method was run, and is meaningless.
    this.returnToThreadLoop = false;

    vtrace("T" + thread.ref + " Resuming " + this.method.full_signature() + ":" + this.pc + " [Bytecode]");
    vtrace("T" + thread.ref + " BEFORE: D: " + thread.getStackTrace().length + ", S: [" + logging.debug_vars(this.stack) + "], L: [" + logging.debug_vars(this.locals) + "], T: " + thread.ref);
    // Run until we get the signal to return to the thread loop.
    while (!this.returnToThreadLoop) {
      var op = code[this.pc];
      vtrace("T" + thread.ref + " D: " + thread.getStackTrace().length + ", S: [" + logging.debug_vars(this.stack) + "], L: [" + logging.debug_vars(this.locals) + "], T: " + thread.ref);
      vtrace("T" + thread.ref + " " + method.cls.get_type() + "::" + method.name + ":" + this.pc + " => " + op.name + op.annotate(this.pc, method.cls.constant_pool));
      op.execute(thread, this);
    }
    vtrace("T" + thread.ref + " AFTER: D: " + thread.getStackTrace().length + ", S: [" + logging.debug_vars(this.stack) + "], L: [" + logging.debug_vars(this.locals) + "], T: " + thread.ref);
  }

  public scheduleResume(thread: JVMThread, rv?: any, rv2?: any): void {
    // Advance to the next opcode.
    this.method.getCode()[this.pc].incPc(this);
    if (rv !== undefined) {
      this.stack.push(rv);
    }
    if (rv2 !== undefined) {
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
    var code = this.method.getCodeAttribute(),
      opcodes: opcodes.Opcode[] = this.method.getCode(),
      pc = this.pc, method = this.method,
      // STEP 1: See if we can find an appropriate handler for this exception!
      exceptionHandlers = code.exception_handlers,
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
            debug(method.full_signature() + " needs to resolve some exception types...");
            var handlerClasses: string[] = [];
            exceptionHandlers.forEach((handler: attributes.ExceptionHandler) => {
              if (handler.catch_type !== "<any>") {
                handlerClasses.push(handler.catch_type);
              }
            });
            thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
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

    // STEP 2: Either continue on if we could not find an appropriate handler,
    // or set up the stack for appropriate resumption.
    if (handler != null) {
      // Found the handler.
      debug("{BOLD}{YELLOW}" + method.full_signature() + "{/YELLOW}{/BOLD}: Caught {GREEN}" + e.cls.get_type() + "{/GREEN} as subclass of {GREEN}" + handler.catch_type + "{/GREEN}");
      this.stack = [e]; // clear out anything on the stack; it was made during the try block
      this.pc = handler.handler_pc;
      return true;
    } else {
      // abrupt method invocation completion
      debug("{BOLD}{YELLOW}" + method.full_signature() + "{/YELLOW}{/BOLD}: Did not catch {GREEN}" + e.cls.get_type() + "{/GREEN}.");
      // STEP 3: Synchronized method? Exit from the method's monitor.
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
    vtrace("T" + thread.ref + " " + this.method.full_signature() + " [Native Code]");
    var rv: any = this.nativeMethod.apply(null, this.method.convertArgs(thread, this.args));
    // Ensure thread is running, and we are the running method.
    if (thread.getStatus() === enums.ThreadStatus.RUNNING && thread.currentMethod() === this.method) {
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
  constructor(private cb: (e?: java_object.JavaObject, rv?: any) => void) {
  }

  public run(thread: JVMThread): void {
    // Pop myself off of the stack.
    thread.framePop();
    // Pause the thread before returning into native JavaScript code.
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
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
  private runningThreadIndex: number = -1;
  private parkCounts: { [threadRef: number]: number } = {};
  /**
   * Called when the ThreadPool becomes empty. This is usually a sign that
   * execution has finished, and the JVM should be terminated.
   */
  private emptyCallback: () => void;

  constructor(private jvm: JVM, private bsCl: ClassLoader.BootstrapClassLoader,
    emptyCallback: () => void) {
    this.emptyCallback = emptyCallback;
  }

  public getThreads(): JVMThread[] {
    // Return a copy of our internal array.
    return this.threads.slice(0);
  }

  private addThread(thread: JVMThread): void {
    if (this.threads.indexOf(thread) === -1) {
      this.threads.push(thread);
    }
  }

  public newThread(cls: ClassData.ReferenceClassData): JVMThread {
    var thread = new JVMThread(this.bsCl, this, cls);
    this.addThread(thread);
    return thread;
  }

  /**
   * Resurrects a previously-terminated thread.
   */
  public resurrectThread(thread: JVMThread): void {
    this.addThread(thread);
  }

  public getJVM(): JVM {
    return this.jvm;
  }

  /**
   * Schedules and runs the next thread.
   */
  private scheduleNextThread(): void {
    // Reset stack depth, start at beginning of new JS event.
    setImmediate(() => {
      var i: number, i_fixed: number, threads = this.threads, thread: JVMThread;
      if (this.runningThread == null) {
        for (i = 0; i < threads.length; i++) {
          // Cycle through the threads, starting at the thread just past the
          // previously-run thread. (Round Robin scheduling algorithm)
          i_fixed = (this.runningThreadIndex + 1 + i) % threads.length;
          thread = threads[i_fixed];
          if (thread.getStatus() === enums.ThreadStatus.RUNNABLE) {
            this.runningThread = thread;
            this.runningThreadIndex = i_fixed;
            thread.setStatus(enums.ThreadStatus.RUNNING);
            break;
          }
        }
      }
    });
  }

  public threadRunnable(thread: JVMThread): void {
    // We only care if no threads are running right now.
    if (this.runningThread == null) {
      this.scheduleNextThread();
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
      // The runningThreadIndex is currently pointing to the *next* thread we
      // should schedule, so take it back by one.
      this.runningThreadIndex = this.runningThreadIndex - 1;
      if (this.threads.length > 0) {
        this.scheduleNextThread();
      } else {
        // Tell the JVM that execution is over.
        this.emptyCallback();
      }
    } else {
      // Update the index so it still points to the running thread.
      this.runningThreadIndex = this.threads.indexOf(this.runningThread);
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
   * Returns the currently running method. Returns NULL if stack is empty.
   */
  public currentMethod(): methods.Method {
    var stack = this.stack, idx = stack.length, method: methods.Method;
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
   * [DEBUG] Return a printable string of the thread's current stack trace.
   */
  public getPrintableStackTrace(): string {
    var rv: string = "";
    this.getStackTrace().reverse().forEach((trace: IStackTraceFrame) => {
      rv += "\tat " + util.ext_classname(trace.method.cls.this_class) + "." + trace.method.name + "(";
      if (trace.pc >= 0) {
        // Bytecode method
        var code = trace.method.getCodeAttribute();
        var table = <attributes.LineNumberTable> code.get_attribute('LineNumberTable');
        var srcAttr = <attributes.SourceFile> trace.method.cls.get_attribute('SourceFile');
        if (srcAttr != null) {
          rv += srcAttr.filename;
        } else {
          rv += 'unknown';
        }
        if (table != null) {
          var lastLine: number = -1, lastPc: number = -1;
          table.entries.forEach((entry) => {
            if (entry.start_pc < trace.pc && lastPc < entry.start_pc) {
              lastPc = entry.start_pc;
              lastLine = entry.line_number;
            }
          });
          rv += ":" + lastLine;
          rv += " Bytecode offset: " + trace.pc;
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
   */
  private run(): void {
    // console.log("Thread " + this.ref + " is now running!");
    var stack = this.stack,
      startTime: number = (new Date()).getTime(),
      endTime: number,
      duration: number,
      estMaxMethodResumes: number;

    // Reset counter. Threads always start from a fresh stack / yield.
    methodResumesLeft = maxMethodResumes;
    while (this.status === enums.ThreadStatus.RUNNING && stack.length > 0) {
      stack[stack.length - 1].run(this);
      if (--methodResumesLeft === 0) {
        endTime = (new Date()).getTime();
        duration = endTime - startTime;
        // Estimated number of methods we can resume before needing to yield.
        estMaxMethodResumes = Math.floor((maxMethodResumes / duration) * responsiveness);
        // Update CMA.
        maxMethodResumes = (estMaxMethodResumes + numSamples * maxMethodResumes) / (numSamples + 1);
        numSamples++;
        // Yield.
        this.setStatus(enums.ThreadStatus.ASYNC_WAITING);
        setImmediate(() => { this.setStatus(enums.ThreadStatus.RUNNABLE); });
      }
    }

    // console.log("Thread " + this.ref + " is suspending: " + enums.ThreadStatus[this.status]);

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
   * Should only be called by setStatus.
   * Updates both the JVMThread object and this object.
   */
  private rawSetStatus(newStatus: enums.ThreadStatus): void {
    this.status = newStatus;
    // Ensures that JVM code can introspect on our threads.
    // @todo Merge these fields.
    this.set_field(this, 'Ljava/lang/Thread;threadStatus', newStatus);
  }

  /**
   * Transitions the thread from one state to the next.
   */
  public setStatus(status: enums.ThreadStatus, monitor?: java_object.Monitor): void {
    function invalidTransition() {
      throw new Error("Invalid state transition: " + enums.ThreadStatus[oldStatus] + " => " + enums.ThreadStatus[status]);
    }

    // Ignore RUNNING => RUNNABLE transitions.
    if (this.status !== status && !(this.status === enums.ThreadStatus.RUNNING && status === enums.ThreadStatus.RUNNABLE)) {
      var oldStatus = this.status;
      vtrace("T" + this.ref + " " + enums.ThreadStatus[oldStatus] + " => " + enums.ThreadStatus[status]);
      assert(validateThreadTransition(oldStatus, status), "Invalid thread transition: " + enums.ThreadStatus[oldStatus] + " => " + enums.ThreadStatus[status]);

      // Optimistically change state.
      this.rawSetStatus(status);
      this.monitor = null;

      /** Pre-transition actions **/
      switch (oldStatus) {
        case enums.ThreadStatus.TERMINATED:
          // Resurrect thread.
          this.tpool.resurrectThread(this);
          break;
        case enums.ThreadStatus.PARKED:
          // XXX: Return from sun.misc.Unsafe.park
          this.asyncReturn();
          break;
      }

      /** Post-transition actions **/
      switch (this.status) {
        case enums.ThreadStatus.RUNNABLE:
          // Tell the threadpool we're ready to run.
          this.tpool.threadRunnable(this);
          break;
        case enums.ThreadStatus.RUNNING:
          // I'm scheduled to run!
          this.run();
          break;
        case enums.ThreadStatus.TERMINATED:
          this.exit();
          break;
        case enums.ThreadStatus.BLOCKED:
        case enums.ThreadStatus.UNINTERRUPTABLY_BLOCKED:
        case enums.ThreadStatus.WAITING:
        case enums.ThreadStatus.TIMED_WAITING:
          assert(monitor != null);
          this.monitor = monitor;
          // FALL-THROUGH
        default:
          this.tpool.threadSuspended(this);
          break;
      }
    }
  }

  /**
   * Called when a thread finishes executing.
   */
  private exit(): void {
    var monitor: java_object.Monitor = this.getMonitor(),
      phase2 = () => {
        // Notify everyone.
        monitor.notifyAll(this);
        // Exit monitor.
        monitor.exit(this);
        // Become terminated before the other threads start running.
        this.rawSetStatus(enums.ThreadStatus.TERMINATED);
        // Remove ourselves from the thread pool.
        this.tpool.threadTerminated(this);
      };
    // Revert our status to ASYNC_WAITING so we can acquire a monitor.
    this.rawSetStatus(enums.ThreadStatus.ASYNC_WAITING);

    // Acquire the monitor associated with our JavaObject.
    if (monitor.enter(this, phase2)) {
      phase2();
    }
  }

  /**
   * Get the monitor that this thread is waiting or blocked on.
   */
  public getMonitorBlock(): java_object.Monitor {
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
   * * [XXX: JVM bootup hack] TERMINATED => RUNNABLE
   *
   * It is not valid to call this method if the thread is in any other state.
   */
  public runMethod(method: methods.Method, args: any[], cb?: (e?: java_object.JavaObject, rv?: any) => void): void {
    assert(this.status === enums.ThreadStatus.NEW ||
      this.status === enums.ThreadStatus.RUNNING ||
      this.status === enums.ThreadStatus.RUNNABLE ||
      this.status === enums.ThreadStatus.ASYNC_WAITING ||
      this.status === enums.ThreadStatus.TERMINATED, "T " + this.ref + ": Tried to run method while thread was in state " + enums.ThreadStatus[this.status]);
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
    var stack = this.stack;
    assert(this.status === enums.ThreadStatus.RUNNING || this.status === enums.ThreadStatus.RUNNABLE || this.status === enums.ThreadStatus.ASYNC_WAITING);
    assert(typeof (rv) !== 'boolean' && rv2 == null);
    // Pop off the current method.
    var frame = stack.pop();
    if (frame.type != enums.StackFrameType.INTERNAL) {
      var frameCast = <BytecodeStackFrame> frame;
      assert(validateReturnValue(this, frameCast.method,
        frameCast.method.return_type, this.bsCl,
        frameCast.method.cls.get_class_loader(), rv, rv2), "Invalid return value for method " + frameCast.method.full_signature());
    }
    // Tell the top of the stack that this RV is waiting for it.
    var idx: number = stack.length - 1;
    // If idx is 0, then the thread will TERMINATE next time it enters its main
    // loop.
    if (idx >= 0) {
      stack[idx].scheduleResume(this, rv, rv2);
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
   * * ASYNC_WAITING => TERMINATED
   *
   * It is not valid to call this method if the thread is in any other state.
   */
  public throwException(exception: java_object.JavaObject): void {
    assert(this.status === enums.ThreadStatus.RUNNING || this.status === enums.ThreadStatus.RUNNABLE || this.status === enums.ThreadStatus.ASYNC_WAITING,
      "Tried to throw exception while thread was in state " + enums.ThreadStatus[this.status]);
    var stack = this.stack, idx: number = stack.length - 1;

    // Stack may actually be empty, so guard against this.
    if (idx >= 0) {
      // An internal stack frame cannot process its own thrown exception.
      if (stack[idx].type === enums.StackFrameType.INTERNAL) {
        stack.pop();
        idx--;
      }

      // Find a stack frame that can handle the exception.
      // Set our status *before* scheduling the exception. Some exception handlers
      // may want to do something asynchronous before resuming execution.
      this.setStatus(enums.ThreadStatus.RUNNABLE);
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
  public throwNewException(clsName: string, msg: string) {
    var cls = <ClassData.ReferenceClassData> this.bsCl.getInitializedClass(this, clsName),
      throwException = () => {
        var e = new java_object.JavaObject(cls),
          cnstrctr = cls.method_lookup(this, '<init>(Ljava/lang/String;)V');

        // Construct the exception, and throw it when done.
        this.runMethod(cnstrctr, [e, java_object.initString(this.bsCl, msg)], (err?, rv?) => {
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
      this.bsCl.initializeClass(this, clsName, (cdata: ClassData.ReferenceClassData) => {
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
  public handleUncaughtException(exception: java_object.JavaObject) {
    var threadCls = <ClassData.ReferenceClassData> this.bsCl.getResolvedClass('Ljava/lang/Thread;'),
      dispatchMethod = threadCls.method_lookup(this, 'dispatchUncaughtException(Ljava/lang/Throwable;)V');
    assert(dispatchMethod != null);
    this.runMethod(dispatchMethod, [this, exception]);
  }
}

/**
 * [DEBUG] Stores all of the valid thread transitions.
 * @todo Any way to make this smaller?
 * @todo Move into 'debug' module that we NOP out in release builds.
 */
export var validTransitions: { [oldStatus: number]: { [newStatus: number]: string } } = {};
validTransitions[enums.ThreadStatus.NEW] = {};
validTransitions[enums.ThreadStatus.NEW][enums.ThreadStatus.RUNNABLE] = "RunMethod invoked on new thread";
validTransitions[enums.ThreadStatus.NEW][enums.ThreadStatus.ASYNC_WAITING] = "[JVM bootup only] Internal operation occurs on new thread";
validTransitions[enums.ThreadStatus.ASYNC_WAITING] = {};
validTransitions[enums.ThreadStatus.ASYNC_WAITING][enums.ThreadStatus.RUNNABLE] = "Async operation completes";
validTransitions[enums.ThreadStatus.ASYNC_WAITING][enums.ThreadStatus.TERMINATED] = "RunMethod completes and callstack is empty";
validTransitions[enums.ThreadStatus.BLOCKED] = {};
validTransitions[enums.ThreadStatus.BLOCKED][enums.ThreadStatus.RUNNABLE] = "Acquires monitor, or is interrupted";
validTransitions[enums.ThreadStatus.PARKED] = {};
validTransitions[enums.ThreadStatus.PARKED][enums.ThreadStatus.RUNNABLE] = "Balancing unpark, or is interrupted";
validTransitions[enums.ThreadStatus.RUNNABLE] = {};
validTransitions[enums.ThreadStatus.RUNNABLE][enums.ThreadStatus.RUNNING] = "Scheduled to run";
validTransitions[enums.ThreadStatus.RUNNABLE][enums.ThreadStatus.ASYNC_WAITING] = "Scheduled to run thread performs an asynchronous JavaScript operation";
validTransitions[enums.ThreadStatus.RUNNING] = {};
validTransitions[enums.ThreadStatus.RUNNING][enums.ThreadStatus.RUNNABLE] = "[Ignored transition; stays RUNNING]";
validTransitions[enums.ThreadStatus.RUNNING][enums.ThreadStatus.ASYNC_WAITING] = "Thread performs an asynchronous JavaScript operation";
validTransitions[enums.ThreadStatus.RUNNING][enums.ThreadStatus.TERMINATED] = "Callstack is empty";
validTransitions[enums.ThreadStatus.RUNNING][enums.ThreadStatus.BLOCKED] = "Thread waits to acquire monitor";
validTransitions[enums.ThreadStatus.RUNNING][enums.ThreadStatus.WAITING] = "Thread waits on monitor (Object.wait)";
validTransitions[enums.ThreadStatus.RUNNING][enums.ThreadStatus.TIMED_WAITING] = "Thread waits on monitor with timeout (Object.wait)";
validTransitions[enums.ThreadStatus.RUNNING][enums.ThreadStatus.PARKED] = "Thread parks itself";
validTransitions[enums.ThreadStatus.TERMINATED] = {};
validTransitions[enums.ThreadStatus.TERMINATED][enums.ThreadStatus.NEW] = "Thread is resurrected for re-use";
validTransitions[enums.ThreadStatus.TERMINATED][enums.ThreadStatus.RUNNABLE] = "Thread is resurrected for re-use";
validTransitions[enums.ThreadStatus.TERMINATED][enums.ThreadStatus.ASYNC_WAITING] = "[JVM Bootup] Thread is resurrected for internal operation";
validTransitions[enums.ThreadStatus.TIMED_WAITING] = {};
validTransitions[enums.ThreadStatus.TIMED_WAITING][enums.ThreadStatus.RUNNABLE] = "Timer expires, or thread is interrupted, and thread immediately acquires lock";
validTransitions[enums.ThreadStatus.TIMED_WAITING][enums.ThreadStatus.UNINTERRUPTABLY_BLOCKED] = "Thread is interrupted or notified, or timer expires, and lock already owned";
validTransitions[enums.ThreadStatus.UNINTERRUPTABLY_BLOCKED] = {};
validTransitions[enums.ThreadStatus.UNINTERRUPTABLY_BLOCKED][enums.ThreadStatus.RUNNABLE] = "Thread acquires monitor";
validTransitions[enums.ThreadStatus.WAITING] = {};
validTransitions[enums.ThreadStatus.WAITING][enums.ThreadStatus.RUNNABLE] = "Thread is interrupted, and immediately acquires lock";
validTransitions[enums.ThreadStatus.WAITING][enums.ThreadStatus.UNINTERRUPTABLY_BLOCKED] = "Thread is notified or interrupted, and does not immediately acquire lock";

/**
 * [DEBUG] Ensures that a thread transition is legal.
 */
function validateThreadTransition(oldStatus: enums.ThreadStatus, newStatus: enums.ThreadStatus): boolean {
  var rv = validTransitions.hasOwnProperty("" + oldStatus) &&
    validTransitions[oldStatus].hasOwnProperty("" + newStatus);
  return rv;
}

/**
 * [DEBUG] Asserts that the return value of the function passes basic sanity
 * checks.
 */
function validateReturnValue(thread: JVMThread, method: methods.Method, returnType: string, bsCl: ClassLoader.BootstrapClassLoader, cl: ClassLoader.ClassLoader, rv1: any, rv2: any): boolean {
  try {
    var cls: ClassData.ClassData;
    if (util.is_primitive_type(returnType)) {
      switch (returnType) {
        case 'Z': // Boolean
          assert(rv2 === undefined);
          assert(rv1 === 1 || rv1 === 0);
          break;
        case 'B': // Byte
          assert(rv2 === undefined);
          assert(rv1 <= 127 && rv1 >= -128);
          break;
        case 'C':
          assert(rv2 === undefined);
          assert(rv1 <= 65535 && rv1 >= 0);
          break;
        case 'S':
          assert(rv2 === undefined);
          assert(rv1 <= 32767 && rv1 >= -32768);
          break;
        case 'I': // int
          assert(rv2 === undefined);
          assert(rv1 <= 2147483647 && rv1 >= -2147483648);
          break;
        case 'J': // long //-9223372036854775808 to 9223372036854775807
          assert(rv2 === null);
          assert((<gLong>rv1).lessThanOrEqual(gLong.MAX_VALUE) && (<gLong>rv1).greaterThanOrEqual(gLong.MIN_VALUE));
          break;
        case 'F': // Float
          assert(rv2 === undefined);
          // NaN !== NaN, so we have to have a special case here.
          assert(util.wrap_float(rv1) === rv1 || (isNaN(rv1) && isNaN(util.wrap_float(rv1))));
          break;
        case 'D': // Double
          assert(rv2 === null);
          assert(typeof rv1 === 'number');
          break;
        case 'V':
          assert(rv1 === undefined && rv2 === undefined);
          break;
      }
    } else if (util.is_array_type(returnType)) {
      assert(rv2 === undefined);
      assert(rv1 === null || rv1 instanceof java_object.JavaArray);
      if (rv1 != null) {
        cls = cl.getInitializedClass(thread, returnType);
        if (cls === null) {
          cls = bsCl.getInitializedClass(thread, returnType);
        }
        assert(cls != null);
        assert(rv1.cls.is_castable(cls));
      }
    } else {
      assert(util.is_reference_type(returnType));
      assert(rv2 === undefined);
      assert(rv1 === null || rv1 instanceof java_object.JavaObject || rv1 instanceof java_object.JavaArray);
      if (rv1 != null) {
        cls = cl.getResolvedClass(returnType);
        if (cls === null) {
          cls = bsCl.getResolvedClass(returnType);
        }
        assert(cls != null);
        if (!cls.access_flags["interface"]) {
          // You can return an interface type without initializing it,
          // since they don't need to be initialized until you try to
          // invoke one of their methods.
          // NOTE: We don't check if the class is in the INITIALIZED state,
          // since it is possible that it is currently in th process of being
          // initialized. getInitializedClass handles this subtlety.
          assert(cl.getInitializedClass(thread, returnType) != null || bsCl.getInitializedClass(thread, returnType) != null);
        }
        assert(rv1.cls.is_castable(cls));
      }
    }
  } catch (e) {
    return false;
  }
  return true;
}
