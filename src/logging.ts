"use strict";
import gLong = module('./gLong');

// default module: logging

function debug_var(e: any): string {
  if (e === null) {
    return '!';
  }
  if (e === void 0) {
    return 'undef';
  }
  if (e.ref != null) {
    return "*" + e.ref;
  }
  if (e instanceof gLong) {
    return "" + e + "L";
  }
  return e;
}

// used for debugging the stack and local variables
export function debug_vars(arr: Array): string[] {
  return arr.map(debug_var);
}

// log levels
// TODO: turn this into an enum, if possible
export var VTRACE = 10;
export var TRACE = 9;
export var DEBUG = 5;
export var ERROR = 1;
export var log_level = ERROR;

function log(level: number, msgs: any[]): void {
  if (level <= log_level) {
    var msg = msgs.join(' ');
    if (level == 1) {
      console.error(msg);
    } else {
      console.log(msg);
    }
  }
};

export function vtrace(...msgs: any[]): void {
  log(VTRACE, msgs);
}

export function trace(...msgs: any[]): void {
  log(TRACE, msgs);
}

export function debug(...msgs: any[]): void {
  log(DEBUG, msgs);
}

export function error(...msgs: any[]): void {
  log(ERROR, msgs);
}

