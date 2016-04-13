"use strict";

import enums = require('./enums');
import opcodes = require('./opcodes');

export interface JitInfo {
  pops: number,                 // If negative, then it is treated a request rather than a demand
  pushes: number,
  hasBranch: boolean,
  emit: (pops: string[], pushes: string[], suffix: string, onSuccess: string, code: Buffer, pc: number, onErrorPushes: string[]) => string
}

function makeOnError(onErrorPushes: string[]) {
  return onErrorPushes.length > 0 ? `frame.opStack.pushAll(${onErrorPushes.join(',')})` : '';
}

export const opJitInfo: JitInfo[] = function() {

// Intentionally indented higher: emitted code is shorter.

/*
function indent(n: number, str: string): string {
  return str;
  let indentStr = "";
  for (let i = 0; i < n; i++) {
    indentStr += "  ";
  }
  return str.replace(/^(.)/gm, indentStr + "$1");
}
*/

const table:JitInfo[] = [];
const OpCode = enums.OpCode;

table[OpCode.ACONST_NULL] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.ICONST_M1] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = -1;
frame.pc++;
${onSuccess}`;
}};

const load0_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = frame.locals[0];
frame.pc++;
${onSuccess}`;
}};

const load1_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = frame.locals[1];
frame.pc++;
${onSuccess}`;
}};

const load2_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = frame.locals[2];
frame.pc++;
${onSuccess}`;
}};

const load3_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = frame.locals[3];
frame.pc++;
${onSuccess}`;
}};

table[OpCode.ALOAD_0] = load0_32;
table[OpCode.ILOAD_0] = load0_32;
table[OpCode.FLOAD_0] = load0_32;

table[OpCode.ALOAD_1] = load1_32;
table[OpCode.ILOAD_1] = load1_32;
table[OpCode.FLOAD_1] = load1_32;

table[OpCode.ALOAD_2] = load2_32;
table[OpCode.ILOAD_2] = load2_32;
table[OpCode.FLOAD_2] = load2_32;

table[OpCode.ALOAD_3] = load3_32;
table[OpCode.ILOAD_3] = load3_32;
table[OpCode.FLOAD_3] = load3_32;

const load0_64: JitInfo = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = frame.locals[0];
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

const load1_64: JitInfo = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = frame.locals[1];
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

const load2_64: JitInfo = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = frame.locals[2];
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

const load3_64: JitInfo = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = frame.locals[3];
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.LLOAD_0] = load0_64;
table[OpCode.DLOAD_0] = load0_64;

table[OpCode.LLOAD_1] = load1_64;
table[OpCode.DLOAD_1] = load1_64;

table[OpCode.LLOAD_2] = load2_64;
table[OpCode.DLOAD_2] = load2_64;

table[OpCode.LLOAD_3] = load3_64;
table[OpCode.DLOAD_3] = load3_64;

const store0_32: JitInfo = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.locals[0] = ${pops[0]};
frame.pc++;
${onSuccess}`;
}}

const store1_32: JitInfo = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.locals[1] = ${pops[0]};
frame.pc++;
${onSuccess}`;
}}

const store2_32: JitInfo = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.locals[2] = ${pops[0]};
frame.pc++;
${onSuccess}`;
}}

const store3_32: JitInfo = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.locals[3] = ${pops[0]};
frame.pc++;
${onSuccess}`;
}}

table[OpCode.ASTORE_0] = store0_32;
table[OpCode.ISTORE_0] = store0_32;
table[OpCode.FSTORE_0] = store0_32;

table[OpCode.ASTORE_1] = store1_32;
table[OpCode.ISTORE_1] = store1_32;
table[OpCode.FSTORE_1] = store1_32;

table[OpCode.ASTORE_2] = store2_32;
table[OpCode.ISTORE_2] = store2_32;
table[OpCode.FSTORE_2] = store2_32;

table[OpCode.ASTORE_3] = store3_32;
table[OpCode.ISTORE_3] = store3_32;
table[OpCode.FSTORE_3] = store3_32;

const store_64: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readUInt8(pc + 1);
  return `
frame.locals[${offset + 1}] = ${pops[0]};
frame.locals[${offset}] = ${pops[1]};
frame.pc += 2;
${onSuccess}`;
}}

const store0_64: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.locals[1] = ${pops[0]};
frame.locals[0] = ${pops[1]};
frame.pc++;
${onSuccess}`;
}}

const store1_64: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.locals[2] = ${pops[0]};
frame.locals[1] = ${pops[1]};
frame.pc++;
${onSuccess}`;
}}

const store2_64: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.locals[3] = ${pops[0]};
frame.locals[2] = ${pops[1]};
frame.pc++;
${onSuccess}`;
}}

const store3_64: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.locals[4] = ${pops[0]};
frame.locals[3] = ${pops[1]};
frame.pc++;
${onSuccess}`;
}}

table[OpCode.LSTORE] = store_64;
table[OpCode.DSTORE] = store_64;

table[OpCode.LSTORE_0] = store0_64;
table[OpCode.DSTORE_0] = store0_64;

table[OpCode.LSTORE_1] = store1_64;
table[OpCode.DSTORE_1] = store1_64;

table[OpCode.LSTORE_2] = store2_64;
table[OpCode.DSTORE_2] = store2_64;

table[OpCode.LSTORE_3] = store3_64;
table[OpCode.DSTORE_3] = store3_64;

const const0_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = 0;
frame.pc++;
${onSuccess}`;
}}
const const1_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = 1;
frame.pc++;
${onSuccess}`;
}}
const const2_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = 2;
frame.pc++;
${onSuccess}`;
}}


table[OpCode.ICONST_0] = const0_32;
table[OpCode.ICONST_1] = const1_32;
table[OpCode.ICONST_2] = const2_32;

table[OpCode.FCONST_0] = const0_32;
table[OpCode.FCONST_1] = const1_32;
table[OpCode.FCONST_2] = const2_32;

table[OpCode.ICONST_3] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = 3;
frame.pc++;
${onSuccess}`;
}}

table[OpCode.ICONST_4] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = 4;
frame.pc++;
${onSuccess}`;
}}

table[OpCode.ICONST_5] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = 5;
frame.pc++;
${onSuccess}`;
}}

table[OpCode.LCONST_0] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = util.gLong.ZERO;
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}}

table[OpCode.LCONST_1] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = util.gLong.ONE;
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}}

table[OpCode.DCONST_0] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = 0;
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}}

table[OpCode.DCONST_1] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = 1;
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}}

const aload32: JitInfo = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes);
  return `
var idx${suffix} = ${pops[0]},
  obj${suffix} = ${pops[1]};
if (!util.isNull(thread, frame, obj${suffix})) {
  var len${suffix} = obj${suffix}.array.length;
  if (idx${suffix} < 0 || idx${suffix} >= len${suffix}) {
    ${onError}
    util.throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', "" + idx${suffix} + " not in length " + len${suffix} + " array of type " + obj${suffix}.getClass().getInternalName());
  } else {
    var ${pushes[0]} = obj${suffix}.array[idx${suffix}];
    frame.pc++;
    ${onSuccess}
  }
}`;
}}


table[OpCode.IALOAD] = aload32;
table[OpCode.FALOAD] = aload32;
table[OpCode.AALOAD] = aload32;
table[OpCode.BALOAD] = aload32;
table[OpCode.CALOAD] = aload32;
table[OpCode.SALOAD] = aload32;

const aload64: JitInfo = {hasBranch: false, pops: 2, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes);
  return `
var idx${suffix} = ${pops[0]},
  obj${suffix} = ${pops[1]};
if (!util.isNull(thread, frame, obj${suffix})) {
  var len${suffix} = obj${suffix}.array.length;
  if (idx${suffix} < 0 || idx${suffix} >= len${suffix}) {
    ${onError}
    util.throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', "" + idx${suffix} + " not in length " + len${suffix} + " array of type " + obj${suffix}.getClass().getInternalName());
  } else {
    var ${pushes[0]} = obj${suffix}.array[idx${suffix}];
    var ${pushes[1]} = null;
    frame.pc++;
    ${onSuccess}
  }
}`;
}}


table[OpCode.DALOAD] = aload64;
table[OpCode.LALOAD] = aload64;

const astore32: JitInfo = {hasBranch: false, pops: 3, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes);
  return `
var val${suffix} = ${pops[0]},
  idx${suffix} = ${pops[1]},
  obj${suffix} = ${pops[2]};
if (!util.isNull(thread, frame, obj${suffix})) {
  var len${suffix} = obj${suffix}.array.length;
  if (idx${suffix} < 0 || idx${suffix} >= len${suffix}) {
    ${onError}
    util.throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', "" + idx${suffix} + " not in length " + len${suffix} + " array of type " + obj${suffix}.getClass().getInternalName());
  } else {
    obj${suffix}.array[idx${suffix}] = val${suffix};
    frame.pc++;
    ${onSuccess}
  }
}`;
}}


table[OpCode.IASTORE] = astore32;
table[OpCode.FASTORE] = astore32;
table[OpCode.AASTORE] = astore32;
table[OpCode.BASTORE] = astore32;
table[OpCode.CASTORE] = astore32;
table[OpCode.SASTORE] = astore32;

const astore64: JitInfo = {hasBranch: false, pops: 4, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes);
  return `
var val${suffix} = ${pops[1]},
  idx${suffix} = ${pops[2]},
  obj${suffix} = ${pops[3]};
if (!util.isNull(thread, frame, obj${suffix})) {
  var len${suffix} = obj${suffix}.array.length;
  if (idx${suffix} < 0 || idx${suffix} >= len${suffix}) {
    ${onError}
    util.throwException(thread, frame, 'Ljava/lang/ArrayIndexOutOfBoundsException;', "" + idx${suffix} + " not in length " + len${suffix} + " array of type " + obj${suffix}.getClass().getInternalName());
  } else {
    obj${suffix}.array[idx${suffix}] = val${suffix};
    frame.pc++;
    ${onSuccess}
  }
}`;
}}


table[OpCode.DASTORE] = astore64;
table[OpCode.LASTORE] = astore64;

// TODO: get the constant at JIT time ?
table[OpCode.LDC] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const index = code.readUInt8(pc + 1);
  const onError = makeOnError(onErrorPushes);
  return `
var constant${suffix} = frame.method.cls.constantPool.get(${index});
if (constant${suffix}.isResolved()) {
  var ${pushes[0]} = constant${suffix}.getConstant(thread);
  frame.pc += 2;
  ${onSuccess}
} else {
  ${onError}
  util.resolveCPItem(thread, frame, constant${suffix});
}`;
}};

// TODO: get the constant at JIT time ?
table[OpCode.LDC_W] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const index = code.readUInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes);
  return `
var constant${suffix} = frame.method.cls.constantPool.get(${index});
if (constant${suffix}.isResolved()) {
  var ${pushes[0]} = constant${suffix}.getConstant(thread);
  frame.pc += 3;
  ${onSuccess}
} else {
  ${onError}
  util.resolveCPItem(thread, frame, constant${suffix});
}`;
}};

// TODO: get the constant at JIT time ?
table[OpCode.LDC2_W] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `
var constant${suffix} = frame.method.cls.constantPool.get(${index});
var ${pushes[0]} = constant${suffix}.value;
var ${pushes[1]} = null;
frame.pc += 3;
${onSuccess}`;
}};

// TODO: get the field info at JIT time ?
table[OpCode.GETSTATIC_FAST32] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `
var fieldInfo${suffix} = frame.method.cls.constantPool.get(${index});
var ${pushes[0]} = fieldInfo${suffix}.fieldOwnerConstructor[fieldInfo${suffix}.fullFieldName];
frame.pc += 3;
${onSuccess}`;
}};

// TODO: get the field info at JIT time ?
table[OpCode.GETSTATIC_FAST64] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `
var fieldInfo${suffix} = frame.method.cls.constantPool.get(${index});
var ${pushes[0]} = fieldInfo${suffix}.fieldOwnerConstructor[fieldInfo${suffix}.fullFieldName];
var ${pushes[1]} = null;
frame.pc += 3;
${onSuccess}`;
}};

// TODO: get the field info at JIT time ?
table[OpCode.GETFIELD_FAST32] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `
var fieldInfo${suffix} = frame.method.cls.constantPool.get(${index}),
    obj${suffix} = ${pops[0]};
if (!util.isNull(thread, frame, obj${suffix})) {
  var ${pushes[0]} = obj${suffix}[fieldInfo${suffix}.fullFieldName];
  frame.pc += 3;
  ${onSuccess}
}`;
}};

// TODO: get the field info at JIT time ?
table[OpCode.GETFIELD_FAST64] = {hasBranch: false, pops: 1, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `
var fieldInfo${suffix} = frame.method.cls.constantPool.get(${index}),
    obj${suffix} = ${pops[0]};
if (!util.isNull(thread, frame, obj${suffix})) {
  var ${pushes[0]} = obj${suffix}[fieldInfo${suffix}.fullFieldName];
  var ${pushes[1]} = null;
  frame.pc += 3;
  ${onSuccess}
}`;
}};

// TODO: get the field info at JIT time ?
table[OpCode.PUTFIELD_FAST32] = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `
var fieldInfo${suffix} = frame.method.cls.constantPool.get(${index}),
    obj${suffix} = ${pops[1]};
if (!util.isNull(thread, frame, obj${suffix})) {
  obj${suffix}[fieldInfo${suffix}.fullFieldName] = ${pops[0]};
  frame.pc += 3;
  ${onSuccess}
}`;
}};

// TODO: get the field info at JIT time ?
table[OpCode.PUTFIELD_FAST64] = {hasBranch: false, pops: 3, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `
var fieldInfo${suffix} = frame.method.cls.constantPool.get(${index}),
    obj${suffix} = ${pops[2]};
if (!util.isNull(thread, frame, obj${suffix})) {
  obj${suffix}[fieldInfo${suffix}.fullFieldName] = ${pops[1]};
  frame.pc += 3;
  ${onSuccess}
}`;
}};

// TODO: get the constant at JIT time ?
table[OpCode.INSTANCEOF_FAST] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `
var cls${suffix} = frame.method.cls.constantPool.get(${index}).cls,
  o${suffix} = ${pops[0]};
var ${pushes[0]} = o${suffix} !== null ? (o${suffix}.getClass().isCastable(cls${suffix}) ? 1 : 0) : 0;
frame.pc += 3;
${onSuccess}`;
}};

table[OpCode.ARRAYLENGTH] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var  obj${suffix} = ${pops[0]};
if (!util.isNull(thread, frame, obj${suffix})) {
  var ${pushes[0]} = obj${suffix}.array.length;
  frame.pc++;
  ${onSuccess}
}`;
}};

const load32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt8(pc + 1);
  return `
var ${pushes[0]} = frame.locals[${index}];
frame.pc += 2;
${onSuccess}`;
}}

table[OpCode.ILOAD] = load32;
table[OpCode.ALOAD] = load32;
table[OpCode.FLOAD] = load32;

const load64: JitInfo = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt8(pc + 1);
  return `
var ${pushes[0]} = frame.locals[${index}];
var ${pushes[1]} = null;
frame.pc += 2;
${onSuccess}`;
}}

table[OpCode.LLOAD] = load64;
table[OpCode.DLOAD] = load64;

const store32: JitInfo = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt8(pc + 1);
  return `
frame.locals[${index}] = ${pops[0]};
frame.pc += 2;
${onSuccess}`;
}}

table[OpCode.ISTORE] = store32;
table[OpCode.ASTORE] = store32;
table[OpCode.FSTORE] = store32;

table[OpCode.BIPUSH] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const value = code.readInt8(pc + 1);
  return `
var ${pushes[0]} = ${value};
frame.pc += 2;
${onSuccess}`;
}};

table[OpCode.SIPUSH] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const value = code.readInt16BE(pc + 1);
  return `
var ${pushes[0]} = ${value};
frame.pc += 3;
${onSuccess}`;
}};

table[OpCode.IINC] = {hasBranch: false, pops: 0, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const idx = code.readUInt8(pc + 1);
  const val = code.readInt8(pc + 2);
  return `
frame.locals[${idx}] = (frame.locals[${idx}] + ${val}) | 0;
frame.pc += 3;
${onSuccess}`;
}};

// This is marked as hasBranch: true to stop further opcode inclusion during JITC. The name of "hasBranch" ought to be changed.
table[OpCode.ATHROW] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  return `
thread.throwException(${pops[0]});
frame.returnToThreadLoop = true;
${onSuccess}`;
}};

table[OpCode.GOTO] = {hasBranch: true, pops: 0, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
frame.pc += ${offset};
${onSuccess}`;
}};

const cmpeq: JitInfo = {hasBranch: true, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[0]} === ${pops[1]}) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IF_ICMPEQ] = cmpeq;
table[OpCode.IF_ACMPEQ] = cmpeq;

const cmpne: JitInfo = {hasBranch: true, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[0]} !== ${pops[1]}) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IF_ICMPNE] = cmpne;
table[OpCode.IF_ACMPNE] = cmpne;

table[OpCode.IF_ICMPGE] = {hasBranch: true, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[1]} >= ${pops[0]}) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IF_ICMPGT] = {hasBranch: true, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[1]} > ${pops[0]}) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IF_ICMPLE] = {hasBranch: true, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[1]} <= ${pops[0]}) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IF_ICMPLT] = {hasBranch: true, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[1]} < ${pops[0]}) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IFNULL] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[0]} === null) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IFNONNULL] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[0]} != null) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IFEQ] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[0]} === 0) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IFNE] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[0]} !== 0) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IFGT] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[0]} > 0) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IFLT] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[0]} < 0) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IFGE] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[0]} >= 0) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.IFLE] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `
if(${pops[0]} <= 0) {
  frame.pc += ${offset};
} else {
  frame.pc += 3;
}
${onSuccess}`;
}};

table[OpCode.LCMP] = {hasBranch: true, pops: 4, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[3]}.compare(${pops[1]});
frame.pc++;
${onSuccess}`;
}};

table[OpCode.FCMPL] = {hasBranch: true, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[0]} === ${pops[1]} ? 0 : (${pops[1]} > ${pops[0]} ? 1 : -1);
frame.pc++;
${onSuccess}`;
}};

table[OpCode.DCMPL] = {hasBranch: true, pops: 4, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[3]} === ${pops[1]} ? 0 : (${pops[3]} > ${pops[1]} ? 1 : -1);
frame.pc++;
${onSuccess}`;
}};

table[OpCode.FCMPG] = {hasBranch: true, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[0]} === ${pops[1]} ? 0 : (${pops[1]} < ${pops[0]} ? -1 : 1);
frame.pc++;
${onSuccess}`;
}};

table[OpCode.DCMPG] = {hasBranch: true, pops: 4, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[3]} === ${pops[1]} ? 0 : (${pops[3]} < ${pops[1]} ? -1 : 1);
frame.pc++;
${onSuccess}`;
}};

table[OpCode.RETURN] = {hasBranch: true, pops: 0, pushes: 0, emit: (pops, pushes, suffix) => {
  // TODO: check flags at JIT time
  // TODO: on error pushes
  return `
frame.returnToThreadLoop = true;
if (frame.method.accessFlags.isSynchronized()) {
  // monitorexit
  if (!frame.method.methodLock(thread, frame).exit(thread)) {
    // monitorexit threw an exception.
    return;
  }
}
thread.asyncReturn();
`;
}};

const return32: JitInfo = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix) => {
  // TODO: check flags at JIT time
  // TODO: on error pushes
  return `
frame.returnToThreadLoop = true;
if (frame.method.accessFlags.isSynchronized()) {
  // monitorexit
  if (!frame.method.methodLock(thread, frame).exit(thread)) {
    // monitorexit threw an exception.
    return;
  }
}
thread.asyncReturn(${pops[0]});
`;
}};
table[OpCode.IRETURN] = return32;
table[OpCode.FRETURN] = return32;
table[OpCode.ARETURN] = return32;

const return64: JitInfo = {hasBranch: true, pops: 2, pushes: 0, emit: (pops, pushes, suffix) => {
  // TODO: check flags at JIT time
  return `
frame.returnToThreadLoop = true;
if (frame.method.accessFlags.isSynchronized()) {
  // monitorexit
  if (!frame.method.methodLock(thread, frame).exit(thread)) {
    // monitorexit threw an exception.
    return;
  }
}
thread.asyncReturn(${pops[1]}, null);
`;
}};
table[OpCode.LRETURN] = return64;
table[OpCode.DRETURN] = return64;

table[OpCode.IXOR] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[0]} ^ ${pops[1]};
frame.pc++;
${onSuccess}`;
}};

table[OpCode.IOR] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[0]} | ${pops[1]};
frame.pc++;
${onSuccess}`;
}};

table[OpCode.LOR] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[3]}.or(${pops[1]});
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.IAND] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[0]} & ${pops[1]};
frame.pc++;
${onSuccess}`;
}};

table[OpCode.LAND] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[3]}.and(${pops[1]});
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.IADD] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = (${pops[0]} + ${pops[1]}) | 0;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.LADD] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[1]}.add(${pops[3]});
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.DADD] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[1]} + ${pops[3]};
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.IMUL] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = Math.imul(${pops[0]},  ${pops[1]});
frame.pc++;
${onSuccess}`;
}};

table[OpCode.FMUL] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = util.wrapFloat(${pops[0]} * ${pops[1]});
frame.pc++;
${onSuccess}`;
}};

table[OpCode.LMUL] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[3]}.multiply(${pops[1]});
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.DMUL] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[3]} * ${pops[1]};
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.IDIV] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
if (${pops[0]} === 0) {
  util.throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
} else {
  var ${pushes[0]} = (${pops[1]} === util.Constants.INT_MIN && ${pops[0]} === -1) ? ${pops[1]} : ((${pops[1]} / ${pops[0]}) | 0);
  frame.pc++;
  ${onSuccess}
}`;
}};

table[OpCode.DDIV] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[3]} / ${pops[1]};
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.ISUB] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = (${pops[1]} - ${pops[0]}) | 0;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.LSUB] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[1]}.negate().add(${pops[3]});
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.DSUB] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[3]}-${pops[1]};
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.IREM] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
if (${pops[0]} === 0) {
  util.throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
} else {
  var ${pushes[0]} = ${pops[1]} % ${pops[0]};
  frame.pc++;
  ${onSuccess}
}`;
}};

table[OpCode.LREM] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
if (${pops[1]}.isZero()) {
  util.throwException(thread, frame, 'Ljava/lang/ArithmeticException;', '/ by zero');
} else {
  var ${pushes[0]} = ${pops[3]}.modulo(${pops[1]});
  var ${pushes[1]} = null;
  frame.pc++;
  ${onSuccess}
}`;
}};

table[OpCode.INEG] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = (-${pops[0]}) | 0;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.LNEG] = {hasBranch: false, pops: 2, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[1]}.negate();
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.ISHL] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[1]} << ${pops[0]};
frame.pc++;
${onSuccess}`;
}};

table[OpCode.LSHL] = {hasBranch: false, pops: 3, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[2]}.shiftLeft(util.gLong.fromInt(${pops[0]}));
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.ISHR] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[1]} >> ${pops[0]};
frame.pc++;
${onSuccess}`;
}};

table[OpCode.LSHR] = {hasBranch: false, pops: 3, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[2]}.shiftRight(util.gLong.fromInt(${pops[0]}));
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.IUSHR] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = (${pops[1]} >>> ${pops[0]}) | 0;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.LUSHR] = {hasBranch: false, pops: 3, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[2]}.shiftRightUnsigned(util.gLong.fromInt(${pops[0]}));
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.I2B] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = (${pops[0]} << 24) >> 24;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.I2S] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = (${pops[0]} << 16) >> 16;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.I2C] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[0]} & 0xFFFF;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.I2L] = {hasBranch: false, pops: 1, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = util.gLong.fromInt(${pops[0]});
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.I2F] = {hasBranch: false, pops: 0, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
// NOP; we represent ints as floats anyway.
// @todo What about quantities unexpressable as floats?
frame.pc++;
${onSuccess}`;
}};

table[OpCode.I2D] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.F2I] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
${pushes[0]} = util.float2int(${pops[0]});
frame.pc++;
${onSuccess}`;
}};

table[OpCode.F2D] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
${pushes[0]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.L2I] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[1]}.toInt();
frame.pc++;
${onSuccess}`;
}};

table[OpCode.L2D] = {hasBranch: false, pops: 2, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[1]}.toNumber();
var ${pushes[1]} = null;
frame.pc++;
${onSuccess}`;
}};

table[OpCode.D2I] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `
${pushes[0]} = util.float2int(${pops[1]});
frame.pc++;
${onSuccess}`;
}};

// TODO: update the DUPs when peeking is supported
table[OpCode.DUP] = {hasBranch: false, pops: 1, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[0]};
var ${pushes[1]} = ${pops[0]};
frame.pc++;
${onSuccess}`;
}};

table[OpCode.DUP2] = {hasBranch: false, pops: 2, pushes: 4, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[1]};
var ${pushes[1]} = ${pops[0]};
var ${pushes[2]} = ${pops[1]};
var ${pushes[3]} = ${pops[0]};
frame.pc++;
${onSuccess}`;
}};

table[OpCode.DUP_X1] = {hasBranch: false, pops: 2, pushes: 3, emit: (pops, pushes, suffix, onSuccess) => {
  return `
var ${pushes[0]} = ${pops[0]};
var ${pushes[1]} = ${pops[1]};
var ${pushes[2]} = ${pops[0]};
frame.pc++;
${onSuccess}`;
}};

table[OpCode.NEW_FAST] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `
var classRef${suffix} = frame.method.cls.constantPool.get(${index});
var ${pushes[0]} = (new classRef${suffix}.clsConstructor(thread));
frame.pc += 3;
${onSuccess}`;
}};

table[OpCode.NEWARRAY] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt8(pc + 1);
  const arrayType = "[" + opcodes.ArrayTypes[index];
  return `
var cls${suffix} = frame.getLoader().getInitializedClass(thread, '${arrayType}');
if (${pops[0]} >= 0) {
  ${pushes[0]} = new (cls${suffix}.getConstructor(thread))(thread, ${pops[0]});
  frame.pc += 2;
  ${onSuccess}
} else {
  throwException(thread, frame, 'Ljava/lang/NegativeArraySizeException;', 'Tried to init ${arrayType} array with length ' + ${pops[0]});
}`;
}};

table[OpCode.ANEWARRAY_FAST] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  const arrayType = "[" + opcodes.ArrayTypes[index];
  return `
var classRef${suffix} = frame.method.cls.constantPool.get(${index});
if (${pops[0]} >= 0) {
  ${pushes[0]} = new classRef${suffix}.arrayClassConstructor(thread, ${pops[0]});
  frame.pc += 3;
  ${onSuccess}
} else {
  throwException(thread, frame, 'Ljava/lang/NegativeArraySizeException;', 'Tried to init ' + classRef${suffix}.arrayClass.getInternalName() + ' array with length ' + ${pops[0]});
}`;
}};

table[OpCode.NOP] = {hasBranch: false, pops: 0, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.pc++;
${onSuccess}`;
}};

table[OpCode.POP] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.pc++;
${onSuccess}`;
}};

table[OpCode.POP2] = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `
frame.pc++;
${onSuccess}`;
}};

return table;
}();

