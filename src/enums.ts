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
 * 
 * NOTE: When altering ThreadStatus, remember to update the following things.
 * 
 * - Thread.validTransitions: Describes each valid thread transition.
 * - sun.misc.VM.getThreadStateValues: Maps ThreadStatus values to Thread.State
 *   values.
 * - Assertion statements in Thread regarding its status.
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
  // A thread that is blocked waiting for a monitor lock that was previously
  // interrupted from waiting on a monitor is in this state.
  // Why? Well, the thread has *already* been interrupted once, but cannot
  // process the interruption until it regains the lock.
  UNINTERRUPTABLY_BLOCKED,
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

/**
 * Characters used on the terminal to format output.
 * Maps each type of formatting to its [beginning, end] characters as an array.
 * 
 * Modified from colors.js.
 * @url https://github.com/Marak/colors.js
 */
export var FormatChars = {
  //styles
  BOLD: ['\x1B[1m', '\x1B[22m'],
  ITALICS: ['\x1B[3m', '\x1B[23m'],
  UNDERLINE: ['\x1B[4m', '\x1B[24m'],
  INVERSE: ['\x1B[7m', '\x1B[27m'],
  STRIKETHROUGH: ['\x1B[9m', '\x1B[29m'],
  //text colors
  //grayscale
  WHITE: ['\x1B[37m', '\x1B[39m'],
  GREY: ['\x1B[90m', '\x1B[39m'],
  BLACK: ['\x1B[30m', '\x1B[39m'],
  //colors
  BLUE: ['\x1B[34m', '\x1B[39m'],
  CYAN: ['\x1B[36m', '\x1B[39m'],
  GREEN: ['\x1B[32m', '\x1B[39m'],
  MAGENTA: ['\x1B[35m', '\x1B[39m'],
  RED: ['\x1B[31m', '\x1B[39m'],
  YELLOW: ['\x1B[33m', '\x1B[39m'],
  //background colors
  //grayscale
  WHITE_BG: ['\x1B[47m', '\x1B[49m'],
  GREY_BG: ['\x1B[49;5;8m', '\x1B[49m'],
  BLACK_BG: ['\x1B[40m', '\x1B[49m'],
  //colors
  BLUE_BG: ['\x1B[44m', '\x1B[49m'],
  CYAN_BG: ['\x1B[46m', '\x1B[49m'],
  GREEN_BG: ['\x1B[42m', '\x1B[49m'],
  MAGENTA_BG: ['\x1B[45m', '\x1B[49m'],
  RED_BG: ['\x1B[41m', '\x1B[49m'],
  YELLOW_BG: ['\x1B[43m', '\x1B[49m']
};
