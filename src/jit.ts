"use strict";

import enums = require('./enums');
import opcodes = require('./opcodes');
import {Method} from './methods';
import ConstantPool = require('./ConstantPool');


export interface JitInfo {
  pops: number,                 // If negative, then it is treated a request rather than a demand
  pushes: number,
  hasBranch: boolean,
  emit: (pops: string[], pushes: string[], suffix: string, onSuccess: string, code: Buffer, pc: number, onErrorPushes: string[], method: Method) => string
}

function makeOnError(onErrorPushes: string[]) {
  return onErrorPushes.length > 0 ? `f.opStack.pushAll(${onErrorPushes.join(',')});` : '';
}

const escapeStringRegEx = /\\/g;

export const opJitInfo: JitInfo[] = function() {

// Intentionally indented higher: emitted code is shorter.

const table:JitInfo[] = [];
const OpCode = enums.OpCode;


return table;
}();

