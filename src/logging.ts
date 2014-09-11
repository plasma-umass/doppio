"use strict";
import gLong = require('./gLong');
import enums = require('./enums');

// default module: logging

// used for debugging the stack and local variables
function debug_var(e: any): string {
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
export var VTRACE = 10;
export var TRACE = 9;
export var DEBUG = 5;
export var ERROR = 1;
export var log_level = ERROR;

function formatMessage(msg: string): string {
  var idx = -1, lastEndTagIdx = -1,
    tagStack: string[] = [], tag: string, msgParts: string[] = [],
    stackIdx: number, i: number;
  while (-1 !== (idx = msg.indexOf('{', lastEndTagIdx + 1))) {
    // Pre-tag string
    msgParts.push(msg.substring(lastEndTagIdx + 1, idx));

    lastEndTagIdx = msg.indexOf('}', idx + 1);

    // Tag string
    tag = msg.substring(idx + 1, lastEndTagIdx);
    if (tag.charAt(0) !== '/') {
      // Starting tag.
      if (enums.FormatChars.hasOwnProperty(tag)) {
        tagStack.push(tag);
        msgParts.push(enums.FormatChars[tag][0]);
      }
    } else {
      // Ending tag.
      tag = tag.slice(1);
      stackIdx = tagStack.indexOf(tag);
      if (stackIdx !== -1) {
        tagStack.splice(stackIdx, 1);
        msgParts.push(enums.FormatChars[tag][1]);
      }
    }
  }
  // Last part of the string.
  if (lastEndTagIdx + 1 < msg.length) {
    msgParts.push(msg.slice(lastEndTagIdx + 1));
  }

  // Emit ending tags for any unclosed tags.
  for (i = 0; i < tagStack.length; i++) {
    msgParts.push(enums.FormatChars[tagStack[i]][1]);
  }

  return msgParts.join("");
}

function log(level: number, msgs: any[]): void {
  if (level <= log_level) {
    var msg = msgs.join(' ');
    // Check for formatting.
    if (msg.indexOf('{') !== -1) {
      msg = formatMessage(msg);
    }
    if (level == 1) {
      console.error(msg);
    } else {
      console.log(msg);
    }
  }
}

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

