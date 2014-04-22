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
 * From: http://docs.oracle.com/javase/1.5.0/docs/api/java/lang/Thread.State.html
 */
export enum ThreadState {
  // A thread that has not yet started is in this state.
  NEW,
  // A thread executing in the Java virtual machine is in this state.
  RUNNABLE,
  // A thread that is blocked waiting for a monitor lock is in this state.
  BLOCKED,
  // A thread that is waiting indefinitely for another thread to perform a particular action is in this state.
  WAITING,
  // A thread that is waiting for another thread to perform an action for up to a specified waiting time is in this state.
  TIMED_WAITING,
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
