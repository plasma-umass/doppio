"use strict";

/**
 * A class can be in one of these states at any given point in time.
 */
export enum ClassState {
  // The class has yet to be loaded.
  NOT_LOADED,
  // The class's definition has been downloaded and parsed.
  LOADED,
  // This class and its super classes' definitions have been downloaded and
  // parsed.
  RESOLVED,
  // This class, its super classes', and its interfaces have been downloaded,
  // parsed, and statically initialized.
  INITIALIZED
}

/**
 * A thread can be in one of these states at any given point in time.
 */
export enum ThreadStatus {
  // A thread that has not yet started is in this state.
  NEW,
  // A thread that is actively running. Only one thread can be running at once.
  RUNNING,
  // A thread that is not actively running, but is ready to run.
  RUNNABLE,
  // A thread that is blocked waiting for a monitor lock is in this state.
  BLOCKED,
  // A thread that is waiting indefinitely for another thread to perform a
  // particular action is in this state.
  WAITING,
  // A thread that is waiting for another thread to perform an action for up to
  // a specified waiting time is in this state.
  TIMED_WAITING,
  // A thread that is waiting for an asynchronous browser operation to complete.
  ASYNC_WAITING,
  // A thread that is parked.
  PARKED,
  // A thread that has exited is in this state.
  TERMINATED
}

/**
 * Indicates the type of a stack frame.
 */
export enum StackFrameType {
  /**
   * A JVM internal stack frame. These should be completely invisible to the
   * JVM program.
   */
  INTERNAL,
  /**
   * A bytecode method's stack frame. These have an actual stack.
   */
  BYTECODE,
  /**
   * A native method's stack frame. These typically consist of just a JavaScript
   * function and a method association.
   */
  NATIVE
}

/**
 * Various constant values. Enum'd so they are inlined by the TypeScript
 * compiler.
 */
export enum Constants {
  INT_MAX = Math.pow(2, 31) - 1,
  INT_MIN = -INT_MAX - 1,
  FLOAT_POS_INFINITY = Math.pow(2, 128),
  FLOAT_NEG_INFINITY = -1 * FLOAT_POS_INFINITY,
  FLOAT_POS_INFINITY_AS_INT = 0x7F800000,
  FLOAT_NEG_INFINITY_AS_INT = -8388608,
  // We use the JavaScript NaN as our NaN value, and convert it to
  // a NaN value in the SNaN range when an int equivalent is requested.
  FLOAT_NaN_AS_INT = 0x7fc00000
}
