import {OpCode} from './enums';
import * as opcodes from './opcodes';
import {Method} from './methods';
import {FieldReference, ClassReference} from './ConstantPool';


export interface JitInfo {
  pops: number,                 // If negative, then it is treated a request rather than a demand
  pushes: number,
  hasBranch: boolean,
  emit: (pops: string[], pushes: string[], suffix: string, onSuccess: string, code: Buffer, pc: number, onErrorPushes: string[], method: Method) => string
}

function makeOnError(onErrorPushes: string[], pc: number) {
  return onErrorPushes.length > 0 ? `f.pc=${pc};f.opStack.pushAll(${onErrorPushes.join(',')});` : `f.pc=${pc};`;
}

const escapeStringRegEx = /\\/g;

export const opJitInfo: JitInfo[] = function() {

// Intentionally indented higher: emitted code is shorter.

const table:JitInfo[] = [];

table[OpCode.ACONST_NULL] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=null;${onSuccess}`;
}};

table[OpCode.ICONST_M1] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=-1;${onSuccess}`;
}};

const load0_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=f.locals[0];${onSuccess}`;
}};

const load1_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=f.locals[1];${onSuccess}`;
}};

const load2_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=f.locals[2];${onSuccess}`;
}};

const load3_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=f.locals[3];${onSuccess}`;
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
  return `var ${pushes[0]}=f.locals[0],${pushes[1]}=null;${onSuccess}`;
}};

const load1_64: JitInfo = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=f.locals[1],${pushes[1]}=null;${onSuccess}`;
}};

const load2_64: JitInfo = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=f.locals[2],${pushes[1]}=null;${onSuccess}`;
}};

const load3_64: JitInfo = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=f.locals[3],${pushes[1]}=null;${onSuccess}`;
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
  return `f.locals[0]=${pops[0]};${onSuccess}`;
}}

const store1_32: JitInfo = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `f.locals[1]=${pops[0]};${onSuccess}`;
}}

const store2_32: JitInfo = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `f.locals[2]=${pops[0]};${onSuccess}`;
}}

const store3_32: JitInfo = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `f.locals[3]=${pops[0]};${onSuccess}`;
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
  const offset = code[pc + 1];
  return `f.locals[${offset+1}]=${pops[0]};f.locals[${offset}]=${pops[1]};${onSuccess}`;
}}

const store0_64: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `f.locals[1]=${pops[0]};f.locals[0]=${pops[1]};${onSuccess}`;
}}

const store1_64: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `f.locals[2]=${pops[0]};f.locals[1]=${pops[1]};${onSuccess}`;
}}

const store2_64: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `f.locals[3]=${pops[0]};f.locals[2]=${pops[1]};${onSuccess}`;
}}

const store3_64: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `f.locals[4]=${pops[0]};f.locals[3]=${pops[1]};${onSuccess}`;
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
  return `var ${pushes[0]}=0;${onSuccess}`;
}}
const const1_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=1;${onSuccess}`;
}}
const const2_32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=2;${onSuccess}`;
}}


table[OpCode.ICONST_0] = const0_32;
table[OpCode.ICONST_1] = const1_32;
table[OpCode.ICONST_2] = const2_32;

table[OpCode.FCONST_0] = const0_32;
table[OpCode.FCONST_1] = const1_32;
table[OpCode.FCONST_2] = const2_32;

table[OpCode.ICONST_3] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=3;${onSuccess}`;
}}

table[OpCode.ICONST_4] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=4;${onSuccess}`;
}}

table[OpCode.ICONST_5] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=5;${onSuccess}`;
}}

table[OpCode.LCONST_0] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=u.gLong.ZERO,${pushes[1]}=null;${onSuccess}`;
}}

table[OpCode.LCONST_1] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=u.gLong.ONE,${pushes[1]}=null;${onSuccess}`;
}}

table[OpCode.DCONST_0] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=0,${pushes[1]}=null;${onSuccess}`;
}}

table[OpCode.DCONST_1] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=1,${pushes[1]}=null;${onSuccess}`;
}}

const aload32: JitInfo = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `
if(!u.isNull(t,f,${pops[1]})){
var len${suffix}=${pops[1]}.array.length;
if(${pops[0]}<0||${pops[0]}>=len${suffix}){
${onError}
u.throwException(t,f,'Ljava/lang/ArrayIndexOutOfBoundsException;',""+${pops[0]}+" not in length "+len${suffix}+" array of type "+${pops[1]}.getClass().getInternalName());
}else{var ${pushes[0]}=${pops[1]}.array[${pops[0]}];${onSuccess}}
}else{${onError}}`;
}}


table[OpCode.IALOAD] = aload32;
table[OpCode.FALOAD] = aload32;
table[OpCode.AALOAD] = aload32;
table[OpCode.BALOAD] = aload32;
table[OpCode.CALOAD] = aload32;
table[OpCode.SALOAD] = aload32;

const aload64: JitInfo = {hasBranch: false, pops: 2, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `
if(!u.isNull(t,f,${pops[1]})){
var len${suffix}=${pops[1]}.array.length;
if(${pops[0]}<0||${pops[0]}>=len${suffix}){
${onError}
u.throwException(t,f,'Ljava/lang/ArrayIndexOutOfBoundsException;',""+${pops[0]}+" not in length "+len${suffix}+" array of type "+${pops[1]}.getClass().getInternalName());
}else{var ${pushes[0]}=${pops[1]}.array[${pops[0]}],${pushes[1]}=null;${onSuccess}}
}else{${onError}}`;
}}


table[OpCode.DALOAD] = aload64;
table[OpCode.LALOAD] = aload64;

const astore32: JitInfo = {hasBranch: false, pops: 3, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `
if(!u.isNull(t,f,${pops[2]})){
var len${suffix}=${pops[2]}.array.length;
if(${pops[1]}<0||${pops[1]}>=len${suffix}){
${onError}
u.throwException(t,f,'Ljava/lang/ArrayIndexOutOfBoundsException;',""+${pops[1]}+" not in length "+len${suffix}+" array of type "+${pops[2]}.getClass().getInternalName());
}else{${pops[2]}.array[${pops[1]}]=${pops[0]};${onSuccess}}
}else{${onError}}`;
}}


table[OpCode.IASTORE] = astore32;
table[OpCode.FASTORE] = astore32;
table[OpCode.AASTORE] = astore32;
table[OpCode.BASTORE] = astore32;
table[OpCode.CASTORE] = astore32;
table[OpCode.SASTORE] = astore32;

const astore64: JitInfo = {hasBranch: false, pops: 4, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `
if(!u.isNull(t,f,${pops[3]})){
var len${suffix}=${pops[3]}.array.length;
if(${pops[2]}<0||${pops[2]}>=len${suffix}){
${onError}
u.throwException(t,f,'Ljava/lang/ArrayIndexOutOfBoundsException;',""+${pops[2]}+" not in length "+len${suffix}+" array of type "+${pops[3]}.getClass().getInternalName());
}else{${pops[3]}.array[${pops[2]}]=${pops[1]};${onSuccess}}
}else{${onError}}`;
}}


table[OpCode.DASTORE] = astore64;
table[OpCode.LASTORE] = astore64;

// TODO: get the constant at JIT time ?
table[OpCode.LDC] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const index = code[pc + 1];
  const onError = makeOnError(onErrorPushes, pc);
  return `
var cnst${suffix}=f.method.cls.constantPool.get(${index});
if(cnst${suffix}.isResolved()){var ${pushes[0]}=cnst${suffix}.getConstant(t);${onSuccess}
}else{${onError}u.resolveCPItem(t,f,cnst${suffix});}`;
}};

// TODO: get the constant at JIT time ?
table[OpCode.LDC_W] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const index = code.readUInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc);
  return `
var cnst${suffix}=f.method.cls.constantPool.get(${index});
if(cnst${suffix}.isResolved()){var ${pushes[0]}=cnst${suffix}.getConstant(t);${onSuccess}
}else{${onError}u.resolveCPItem(t,f,cnst${suffix});}`;
}};

// TODO: get the constant at JIT time ?
table[OpCode.LDC2_W] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `var ${pushes[0]}=f.method.cls.constantPool.get(${index}).value,${pushes[1]}=null;${onSuccess}`;
}};

// TODO: get the field info at JIT time ?
table[OpCode.GETSTATIC_FAST32] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `var fi${suffix}=f.method.cls.constantPool.get(${index}),${pushes[0]}=fi${suffix}.fieldOwnerConstructor[fi${suffix}.fullFieldName];${onSuccess}`;
}};

// TODO: get the field info at JIT time ?
table[OpCode.GETSTATIC_FAST64] = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `
var fi${suffix}=f.method.cls.constantPool.get(${index}),${pushes[0]}=fi${suffix}.fieldOwnerConstructor[fi${suffix}.fullFieldName],
${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.GETFIELD_FAST32] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes, method) => {
  const onError = makeOnError(onErrorPushes, pc);
  const index = code.readUInt16BE(pc + 1);
  const fieldInfo = <FieldReference> method.cls.constantPool.get(index);
  const name = fieldInfo.fullFieldName.replace(escapeStringRegEx, "\\\\")
  return `if(!u.isNull(t,f,${pops[0]})){var ${pushes[0]}=${pops[0]}['${name}'];${onSuccess}}else{${onError}}`;
}};

table[OpCode.GETFIELD_FAST64] = {hasBranch: false, pops: 1, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes, method) => {
  const onError = makeOnError(onErrorPushes, pc);
  const index = code.readUInt16BE(pc + 1);
  const fieldInfo = <FieldReference> method.cls.constantPool.get(index);
  const name = fieldInfo.fullFieldName.replace(escapeStringRegEx, "\\\\")
  return `if(!u.isNull(t,f,${pops[0]})){var ${pushes[0]}=${pops[0]}['${name}'],${pushes[1]}=null;${onSuccess}}else{${onError}}`;
}};

table[OpCode.PUTFIELD_FAST32] = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes, method) => {
  const onError = makeOnError(onErrorPushes, pc);
  const index = code.readUInt16BE(pc + 1);
  const fieldInfo = <FieldReference> method.cls.constantPool.get(index);
  const name = fieldInfo.fullFieldName.replace(escapeStringRegEx, "\\\\")
  return `if(!u.isNull(t,f,${pops[1]})){${pops[1]}['${name}']=${pops[0]};${onSuccess}}else{${onError}}`;
}};

table[OpCode.PUTFIELD_FAST64] = {hasBranch: false, pops: 3, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes, method) => {
  const onError = makeOnError(onErrorPushes, pc);
  const index = code.readUInt16BE(pc + 1);
  const fieldInfo = <FieldReference> method.cls.constantPool.get(index);
  const name = fieldInfo.fullFieldName.replace(escapeStringRegEx, "\\\\")
  return `if(!u.isNull(t,f,${pops[2]})){${pops[2]}['${name}']=${pops[1]};${onSuccess}}else{${onError}}`;
}};

// TODO: get the constant at JIT time ?
table[OpCode.INSTANCEOF_FAST] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `var cls${suffix}=f.method.cls.constantPool.get(${index}).cls,${pushes[0]}=${pops[0]}!==null?(${pops[0]}.getClass().isCastable(cls${suffix})?1:0):0;${onSuccess}`;
}};

table[OpCode.CHECKCAST_FAST] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes, method) => {
  const index = code.readUInt16BE(pc + 1);
  const classRef = <ClassReference> method.cls.constantPool.get(index),
    targetClass = classRef.cls.getExternalName();
  return `var cls${suffix}=f.method.cls.constantPool.get(${index}).cls;
if((${pops[0]}!=null)&&!${pops[0]}.getClass().isCastable(cls${suffix})){
u.throwException(t,f,'Ljava/lang/ClassCastException;',${pops[0]}.getClass().getExternalName()+' cannot be cast to ${targetClass}');
}else{var ${pushes[0]}=${pops[0]};${onSuccess}}`
}};

table[OpCode.ARRAYLENGTH] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `if(!u.isNull(t,f,${pops[0]})){var ${pushes[0]}=${pops[0]}.array.length;${onSuccess}}else{${onError}}`;
}};

const load32: JitInfo = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code[pc + 1];
  return `var ${pushes[0]}=f.locals[${index}];${onSuccess}`;
}}

table[OpCode.ILOAD] = load32;
table[OpCode.ALOAD] = load32;
table[OpCode.FLOAD] = load32;

const load64: JitInfo = {hasBranch: false, pops: 0, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code[pc + 1];
  return `var ${pushes[0]}=f.locals[${index}],${pushes[1]}=null;${onSuccess}`;
}}

table[OpCode.LLOAD] = load64;
table[OpCode.DLOAD] = load64;

const store32: JitInfo = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code[pc + 1];
  return `f.locals[${index}]=${pops[0]};${onSuccess}`;
}}

table[OpCode.ISTORE] = store32;
table[OpCode.ASTORE] = store32;
table[OpCode.FSTORE] = store32;

table[OpCode.BIPUSH] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const value = code.readInt8(pc + 1);
  return `var ${pushes[0]}=${value};${onSuccess}`;
}};

table[OpCode.SIPUSH] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const value = code.readInt16BE(pc + 1);
  return `var ${pushes[0]}=${value};${onSuccess}`;
}};

table[OpCode.IINC] = {hasBranch: false, pops: 0, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const idx = code[pc + 1];
  const val = code.readInt8(pc + 2);
  return `f.locals[${idx}]=(f.locals[${idx}]+${val})|0;${onSuccess}`;
}};

// This is marked as hasBranch: true to stop further opcode inclusion during JITC. The name of "hasBranch" ought to be changed.
table[OpCode.ATHROW] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `${onError}t.throwException(${pops[0]});f.returnToThreadLoop=true;`;
}};

table[OpCode.GOTO] = {hasBranch: true, pops: 0, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const offset = code.readInt16BE(pc + 1);
  return `f.pc=${pc + offset};${onSuccess}`;
}};

table[OpCode.TABLESWITCH] = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  // Ignore padding bytes. The +1 is to skip the opcode byte.
  const alignedPC = pc + ((4 - (pc + 1) % 4) % 4) + 1;
  const defaultOffset = code.readInt32BE(alignedPC),
    low = code.readInt32BE(alignedPC + 4),
    high = code.readInt32BE(alignedPC + 8);
  if ((high - low) < 8) {
    let emitted = `switch(${pops[0]}){`;
    for (let i = low; i <= high; i++) {
      const offset = code.readInt32BE(alignedPC + 12+((i-low)*4));
      emitted += `case ${i}:f.pc=${pc + offset};break;`;
    }
    emitted += `default:f.pc=${pc + defaultOffset}}${onSuccess}`
    return emitted;
  } else {
    return `if(${pops[0]}>=${low}&&${pops[0]}<=${high}){f.pc=${pc}+f.method.getCodeAttribute().getCode().readInt32BE(${alignedPC + 12}+((${pops[0]} - ${low})*4))}else{f.pc=${pc + defaultOffset}}${onSuccess}`;
  }
}};

const cmpeq: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[0]}===${pops[1]}){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IF_ICMPEQ] = cmpeq;
table[OpCode.IF_ACMPEQ] = cmpeq;

const cmpne: JitInfo = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[0]}!==${pops[1]}){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IF_ICMPNE] = cmpne;
table[OpCode.IF_ACMPNE] = cmpne;

table[OpCode.IF_ICMPGE] = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[1]}>=${pops[0]}){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IF_ICMPGT] = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[1]}>${pops[0]}){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IF_ICMPLE] = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[1]}<=${pops[0]}){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IF_ICMPLT] = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[1]}<${pops[0]}){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IFNULL] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[0]}==null){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IFNONNULL] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[0]}!=null){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IFEQ] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[0]}===0){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IFNE] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[0]}!==0){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IFGT] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[0]}>0){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IFLT] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[0]}<0){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IFGE] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[0]}>=0){${onError}}else{${onSuccess}}`;
}};

table[OpCode.IFLE] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const offset = code.readInt16BE(pc + 1);
  const onError = makeOnError(onErrorPushes, pc + offset);
  return `if(${pops[0]}<=0){${onError}}else{${onSuccess}}`;
}};

table[OpCode.LCMP] = {hasBranch: false, pops: 4, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[3]}.compare(${pops[1]});${onSuccess}`;
}};

table[OpCode.FCMPL] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[0]}===${pops[1]}?0:(${pops[1]}>${pops[0]}?1:-1);${onSuccess}`;
}};

table[OpCode.DCMPL] = {hasBranch: false, pops: 4, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[3]}===${pops[1]}?0:(${pops[3]}>${pops[1]}?1:-1);${onSuccess}`;
}};

table[OpCode.FCMPG] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[0]}===${pops[1]}?0:(${pops[1]}<${pops[0]}?-1:1);${onSuccess}`;
}};

table[OpCode.DCMPG] = {hasBranch: false, pops: 4, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[3]}===${pops[1]}?0:(${pops[3]}<${pops[1]}?-1:1);${onSuccess}`;
}};

table[OpCode.RETURN] = {hasBranch: true, pops: 0, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes, method) => {
  // TODO: on error pushes
  if (method.accessFlags.isSynchronized()) {
    return `f.pc=${pc};f.returnToThreadLoop=true;if(!f.method.methodLock(t,f).exit(t)){return}t.asyncReturn();`;
  } else {
    return `f.pc=${pc};f.returnToThreadLoop=true;t.asyncReturn();`;
  }
}};

const return32: JitInfo = {hasBranch: true, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes, method) => {
  // TODO: on error pushes
  if (method.accessFlags.isSynchronized()) {
    return `f.pc=${pc};f.returnToThreadLoop=true;if(!f.method.methodLock(t,f).exit(t)){return}t.asyncReturn(${pops[0]});`;
  } else {
    return `f.pc=${pc};f.returnToThreadLoop=true;t.asyncReturn(${pops[0]});`;
  }
}};
table[OpCode.IRETURN] = return32;
table[OpCode.FRETURN] = return32;
table[OpCode.ARETURN] = return32;

const return64: JitInfo = {hasBranch: true, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes, method) => {
  // TODO: on error pushes
  if (method.accessFlags.isSynchronized()) {
    return `f.pc=${pc};f.returnToThreadLoop=true;if(!f.method.methodLock(t,f).exit(t)){return}t.asyncReturn(${pops[1]},null);`;
  } else {
    return `f.pc=${pc};f.returnToThreadLoop=true;t.asyncReturn(${pops[1]},null);`;
  }
}};
table[OpCode.LRETURN] = return64;
table[OpCode.DRETURN] = return64;

table[OpCode.MONITOREXIT] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `if(${pops[0]}.getMonitor().exit(t)){${onSuccess}}else{${onError}f.returnToThreadLoop=true;}`;
}};

table[OpCode.IXOR] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[0]}^${pops[1]};${onSuccess}`;
}};

table[OpCode.LXOR] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]}.xor(${pops[3]}),${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.IOR] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[0]}|${pops[1]};${onSuccess}`;
}};

table[OpCode.LOR] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[3]}.or(${pops[1]}),${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.IAND] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[0]}&${pops[1]};${onSuccess}`;
}};

table[OpCode.LAND] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[3]}.and(${pops[1]}),${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.IADD] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=(${pops[0]}+${pops[1]})|0;${onSuccess}`;
}};

table[OpCode.LADD] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]}.add(${pops[3]}),${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.DADD] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]}+${pops[3]},${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.IMUL] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=Math.imul(${pops[0]}, ${pops[1]});${onSuccess}`;
}};

table[OpCode.FMUL] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=u.wrapFloat(${pops[0]}*${pops[1]});${onSuccess}`;
}};

table[OpCode.LMUL] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[3]}.multiply(${pops[1]}),${pushes[1]}= null;${onSuccess}`;
}};

table[OpCode.DMUL] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[3]}*${pops[1]},${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.IDIV] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `
if(${pops[0]}===0){${onError}u.throwException(t,f,'Ljava/lang/ArithmeticException;','/ by zero');
}else{var ${pushes[0]}=(${pops[1]}===u.Constants.INT_MIN&&${pops[0]}===-1)?${pops[1]}:((${pops[1]}/${pops[0]})|0);${onSuccess}}`;
}};

table[OpCode.LDIV] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `
if(${pops[1]}.isZero()){${onError}u.throwException(t,f,'Ljava/lang/ArithmeticException;','/ by zero');
}else{var ${pushes[0]}=${pops[3]}.div(${pops[1]}),${pushes[1]}=null;${onSuccess}}`;
}};

table[OpCode.DDIV] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[3]}/${pops[1]},${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.ISUB] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=(${pops[1]}-${pops[0]})|0;${onSuccess}`;
}};

table[OpCode.LSUB] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]}.negate().add(${pops[3]}),${pushes[1]}= null;${onSuccess}`;
}};

table[OpCode.DSUB] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[3]}-${pops[1]},${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.IREM] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `if(${pops[0]}===0){${onError}u.throwException(t,f,'Ljava/lang/ArithmeticException;','/ by zero');
}else{var ${pushes[0]}=${pops[1]}%${pops[0]};${onSuccess}}`;
}};

table[OpCode.LREM] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const onError = makeOnError(onErrorPushes, pc);
  return `if(${pops[1]}.isZero()){${onError}u.throwException(t,f,'Ljava/lang/ArithmeticException;','/ by zero');
}else{var ${pushes[0]}=${pops[3]}.modulo(${pops[1]}),${pushes[1]}=null;${onSuccess}}`;
}};

table[OpCode.DREM] = {hasBranch: false, pops: 4, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[3]}%${pops[1]},${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.INEG] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=(-${pops[0]})|0;${onSuccess}`;
}};

table[OpCode.LNEG] = {hasBranch: false, pops: 2, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]}.negate(),${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.ISHL] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]}<<${pops[0]};${onSuccess}`;
}};

table[OpCode.LSHL] = {hasBranch: false, pops: 3, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[2]}.shiftLeft(u.gLong.fromInt(${pops[0]})),${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.ISHR] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]}>>${pops[0]};${onSuccess}`;
}};

table[OpCode.LSHR] = {hasBranch: false, pops: 3, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[2]}.shiftRight(u.gLong.fromInt(${pops[0]})),${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.IUSHR] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=(${pops[1]}>>>${pops[0]})|0;${onSuccess}`;
}};

table[OpCode.LUSHR] = {hasBranch: false, pops: 3, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[2]}.shiftRightUnsigned(u.gLong.fromInt(${pops[0]})),${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.I2B] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=(${pops[0]}<<24)>>24;${onSuccess}`;
}};

table[OpCode.I2S] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=(${pops[0]}<<16)>>16;${onSuccess}`;
}};

table[OpCode.I2C] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[0]}&0xFFFF;${onSuccess}`;
}};

table[OpCode.I2L] = {hasBranch: false, pops: 1, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=u.gLong.fromInt(${pops[0]}),${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.I2F] = {hasBranch: false, pops: 0, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `${onSuccess}`;
}};

table[OpCode.I2D] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=null;${onSuccess}`;
}};

table[OpCode.F2I] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=u.float2int(${pops[0]});${onSuccess}`;
}};

table[OpCode.F2D] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=null;${onSuccess}`;
}};

table[OpCode.L2I] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]}.toInt();${onSuccess}`;
}};

table[OpCode.L2D] = {hasBranch: false, pops: 2, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]}.toNumber(),${pushes[1]}=null;${onSuccess}`;
}};

table[OpCode.D2I] = {hasBranch: false, pops: 2, pushes: 1, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=u.float2int(${pops[1]});${onSuccess}`;
}};

// TODO: update the DUPs when peeking is supported
table[OpCode.DUP] = {hasBranch: false, pops: 1, pushes: 2, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[0]},${pushes[1]}=${pops[0]};${onSuccess}`;
}};

table[OpCode.DUP2] = {hasBranch: false, pops: 2, pushes: 4, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]},${pushes[1]}=${pops[0]},${pushes[2]}=${pops[1]},${pushes[3]}=${pops[0]};${onSuccess}`;
}};

table[OpCode.DUP_X1] = {hasBranch: false, pops: 2, pushes: 3, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[0]},${pushes[1]}=${pops[1]},${pushes[2]}=${pops[0]};${onSuccess}`;
}};

table[OpCode.DUP_X2] = {hasBranch: false, pops: 3, pushes: 4, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[0]},${pushes[1]}=${pops[2]},${pushes[2]}=${pops[1]},${pushes[3]}=${pops[0]};${onSuccess}`;
}};

table[OpCode.DUP2_X1] = {hasBranch: false, pops: 3, pushes: 5, emit: (pops, pushes, suffix, onSuccess) => {
  return `var ${pushes[0]}=${pops[1]},${pushes[1]}=${pops[0]},${pushes[2]}=${pops[2]},${pushes[3]}=${pops[1]},${pushes[4]}=${pops[0]};${onSuccess}`;
}};

table[OpCode.NEW_FAST] = {hasBranch: false, pops: 0, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc) => {
  const index = code.readUInt16BE(pc + 1);
  return `var cr${suffix}=f.method.cls.constantPool.get(${index}),${pushes[0]}=(new cr${suffix}.clsConstructor(t));${onSuccess}`;
}};

table[OpCode.NEWARRAY] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const index = code[pc + 1];
  const arrayType = "[" + opcodes.ArrayTypes[index];
  const onError = makeOnError(onErrorPushes, pc);
  return `
var cls${suffix}=f.getLoader().getInitializedClass(t,'${arrayType}');
if(${pops[0]}>=0){var ${pushes[0]}=new (cls${suffix}.getConstructor(t))(t,${pops[0]});${onSuccess}
}else{${onError}u.throwException(t,f,'Ljava/lang/NegativeArraySizeException;','Tried to init ${arrayType} array with length '+${pops[0]});}`;
}};

table[OpCode.ANEWARRAY_FAST] = {hasBranch: false, pops: 1, pushes: 1, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
  const index = code.readUInt16BE(pc + 1);
  const arrayType = "[" + opcodes.ArrayTypes[index];
  const onError = makeOnError(onErrorPushes, pc);
  return `
var cr${suffix}=f.method.cls.constantPool.get(${index});
if(${pops[0]}>=0){var ${pushes[0]}=new cr${suffix}.arrayClassConstructor(t,${pops[0]});${onSuccess}
}else{${onError}u.throwException(t,f,'Ljava/lang/NegativeArraySizeException;','Tried to init '+cr${suffix}.arrayClass.getInternalName()+' array with length '+${pops[0]});}`;
}};

table[OpCode.NOP] = {hasBranch: false, pops: 0, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `${onSuccess}`;
}};

table[OpCode.POP] = {hasBranch: false, pops: 1, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `${onSuccess}`;
}};

table[OpCode.POP2] = {hasBranch: false, pops: 2, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
  return `${onSuccess}`;
}};

return table;
}();

