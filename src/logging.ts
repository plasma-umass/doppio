import gLong from './gLong';

// default module: logging

// used for debugging the stack and local variables
export function debug_var(e: any): string {
  if (e === null) {
    return '!';
  } else if (e === void 0) {
    return 'undef';
  } else if (e.ref != null) {
    return "*" + e.ref;
  } else if (e instanceof gLong) {
    return e + "L";
  }
  return e;
}

// used for debugging the stack and local variables
export function debug_vars(arr: any[]): string[] {
  return arr.map<string>(debug_var);
}

// log levels
// TODO: turn this into an enum, if possible
export enum LogLevel {
  VTRACE = 10,
  TRACE = 9,
  DEBUG = 5,
  ERROR = 1
}
export let logLevel: LogLevel = LogLevel.ERROR;
export function setLogLevel(level: LogLevel): void {
  logLevel = level;
}

function log(level: number, msgs: any[]): void {
  if (level <= logLevel) {
    var msg = msgs.join(' ');
    if (level == 1) {
      console.error(msg);
    } else {
      console.log(msg);
    }
  }
}

export function vtrace(...msgs: any[]): void {
  log(LogLevel.VTRACE, msgs);
}

export function trace(...msgs: any[]): void {
  log(LogLevel.TRACE, msgs);
}

export function debug(...msgs: any[]): void {
  log(LogLevel.DEBUG, msgs);
}

export function error(...msgs: any[]): void {
  log(LogLevel.ERROR, msgs);
}
