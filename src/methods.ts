import {Flags, descriptor2typestr, forwardResult, initString, reescapeJVMName, getTypes} from './util';
import * as util from './util';
import ByteStream from './ByteStream';
import {IAttribute, makeAttributes, Signature, RuntimeVisibleAnnotations, Code, Exceptions} from './attributes';
import {ConstantPool, ConstUTF8, MethodReference, InterfaceMethodReference} from './ConstantPool';
import {ReferenceClassData, ArrayClassData, ClassData} from './ClassData';
import {JVMThread, annotateOpcode, BytecodeStackFrame} from './threading';
import assert from './assert';
import {ThreadStatus, OpcodeLayoutType, OpCode, OpcodeLayouts, MethodHandleReferenceKind} from './enums';
import Monitor from './Monitor';
import StringOutputStream from './StringOutputStream';
import * as JVMTypes from '../includes/JVMTypes';
import global from './global';
import {JitInfo, opJitInfo} from './jit';

declare var RELEASE: boolean;
if (typeof RELEASE === 'undefined') global.RELEASE = false;

var trapped_methods: { [clsName: string]: { [methodName: string]: Function } } = {
  'java/lang/ref/Reference': {
    // NOP, because we don't do our own GC and also this starts a thread?!?!?!
    '<clinit>()V': function (thread: JVMThread): void { }
  },
  'java/lang/System': {
    'loadLibrary(Ljava/lang/String;)V': function (thread: JVMThread, libName: JVMTypes.java_lang_String): void {
      // Some libraries test if native libraries are available,
      // and expect an exception if they are not.
      // List all of the native libraries we support.
      var lib = libName.toString();
      switch (lib) {
        case 'zip':
        case 'net':
        case 'nio':
        case 'awt':
        case 'fontmanager':
        case 'management':
          return;
        default:
          thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', `no ${lib} in java.library.path`);
          break;
      }
    }
  },
  'java/lang/Terminator': {
    'setup()V': function (thread: JVMThread): void {
      // XXX: We should probably fix this; we support threads now.
      // Historically: NOP'd because we didn't support threads.
    }
  },
  'java/nio/charset/Charset$3': {
    // this is trapped and NOP'ed for speed
    'run()Ljava/lang/Object;': function (thread: JVMThread, javaThis: JVMTypes.java_nio_charset_Charset$3): JVMTypes.java_lang_Object {
      return null;
    }
  },
  'sun/nio/fs/DefaultFileSystemProvider': {
    // OpenJDK doesn't know what the "Doppio" platform is. Tell it to use the Linux file system.
    'create()Ljava/nio/file/spi/FileSystemProvider;': function(thread: JVMThread): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      var dfsp: ReferenceClassData<JVMTypes.sun_nio_fs_DefaultFileSystemProvider> = <any> thread.getBsCl().getInitializedClass(thread, 'Lsun/nio/fs/DefaultFileSystemProvider;'),
       dfspCls: typeof JVMTypes.sun_nio_fs_DefaultFileSystemProvider = <any> dfsp.getConstructor(thread);
      dfspCls['createProvider(Ljava/lang/String;)Ljava/nio/file/spi/FileSystemProvider;'](thread, [thread.getJVM().internString('sun.nio.fs.LinuxFileSystemProvider')], forwardResult(thread));
    }
  }
};

function getTrappedMethod(clsName: string, methSig: string): Function {
  clsName = descriptor2typestr(clsName);
  if (trapped_methods.hasOwnProperty(clsName) && trapped_methods[clsName].hasOwnProperty(methSig)) {
    return trapped_methods[clsName][methSig];
  }
  return null;
}

/**
 * Shared functionality between Method and Field objects, as they are
 * represented similarly in class files.
 */
export class AbstractMethodField {
  /**
   * The declaring class of this method or field.
   */
  public cls: ReferenceClassData<JVMTypes.java_lang_Object>;
  /**
   * The method / field's index in its defining class's method/field array.
   */
  public slot: number;
  /**
   * The method / field's flags (e.g. static).
   */
  public accessFlags: Flags;
  /**
   * The name of the field, without the descriptor or owning class.
   */
  public name: string;
  /**
   * The method/field's type descriptor.
   * e.g.:
   * public String foo; => Ljava/lang/String;
   * public void foo(String bar); => (Ljava/lang/String;)V
   */
  public rawDescriptor: string;
  /**
   * Any attributes on this method or field.
   */
  public attrs: IAttribute[];

  /**
   * Constructs a field or method object from raw class data.
   */
  constructor(cls: ReferenceClassData<JVMTypes.java_lang_Object>, constantPool: ConstantPool, slot: number, byteStream: ByteStream) {
    this.cls = cls;
    this.slot = slot;
    this.accessFlags = new Flags(byteStream.getUint16());
    this.name = (<ConstUTF8> constantPool.get(byteStream.getUint16())).value;
    this.rawDescriptor = (<ConstUTF8> constantPool.get(byteStream.getUint16())).value;
    this.attrs = makeAttributes(byteStream, constantPool);
  }

  public getAttribute(name: string): IAttribute {
    for (var i = 0; i < this.attrs.length; i++) {
      var attr = this.attrs[i];
      if (attr.getName() === name) {
        return attr;
      }
    }
    return null;
  }

  public getAttributes(name: string): IAttribute[] {
    return this.attrs.filter((attr) => attr.getName() === name);
  }

  /**
   * Get the particular type of annotation as a JVM byte array. Returns null
   * if the annotation does not exist.
   */
  protected getAnnotationType(thread: JVMThread, name: string): JVMTypes.JVMArray<number> {
    var annotation = <{ rawBytes: Buffer }> <any> this.getAttribute(name);
    if (annotation === null) {
      return null;
    }
    var byteArrCons = (<ArrayClassData<number>> thread.getBsCl().getInitializedClass(thread, '[B')).getConstructor(thread),
      rv = new byteArrCons(thread, 0);

    // TODO: Convert to typed array.
    var i: number, len = annotation.rawBytes.length, arr = new Array(len);
    for (i = 0; i < len; i++) {
      arr[i] = annotation.rawBytes.readInt8(i);
    }
    rv.array = arr;
    return rv;
  }

  // To satiate TypeScript. Consider it an 'abstract' method.
  public parseDescriptor(raw_descriptor: string): void {
    throw new Error("Unimplemented error.");
  }
}

export class Field extends AbstractMethodField {
  /**
   * The field's full name, which includes the defining class
   * (e.g. java/lang/String/value).
   */
  public fullName: string;

  constructor(cls: ReferenceClassData<JVMTypes.java_lang_Object>, constantPool: ConstantPool, slot: number, byteStream: ByteStream) {
    super(cls, constantPool, slot, byteStream);
    this.fullName = `${descriptor2typestr(cls.getInternalName())}/${this.name}`;
  }

  /**
   * Calls cb with the reflectedField if it succeeds. Calls cb with null if it
   * fails.
   */
  public reflector(thread: JVMThread, cb: (reflectedField: JVMTypes.java_lang_reflect_Field) => void): void {
    var signatureAttr = <Signature> this.getAttribute("Signature"),
      jvm = thread.getJVM(),
      bsCl = thread.getBsCl();
    var createObj = (typeObj: JVMTypes.java_lang_Class): JVMTypes.java_lang_reflect_Field => {
      var fieldCls = <ReferenceClassData<JVMTypes.java_lang_reflect_Field>> bsCl.getInitializedClass(thread, 'Ljava/lang/reflect/Field;'),
        fieldObj = new (fieldCls.getConstructor(thread))(thread);

      fieldObj['java/lang/reflect/Field/clazz'] = this.cls.getClassObject(thread);
      fieldObj['java/lang/reflect/Field/name'] = jvm.internString(this.name);
      fieldObj['java/lang/reflect/Field/type'] = typeObj;
      fieldObj['java/lang/reflect/Field/modifiers'] = this.accessFlags.getRawByte();
      fieldObj['java/lang/reflect/Field/slot'] = this.slot;
      fieldObj['java/lang/reflect/Field/signature'] = signatureAttr !== null ? initString(bsCl, signatureAttr.sig) : null;
      fieldObj['java/lang/reflect/Field/annotations'] = this.getAnnotationType(thread, 'RuntimeVisibleAnnotations');

      return fieldObj;
    };
    // Our field's type may not be loaded, so we asynchronously load it here.
    // In the future, we can speed up reflection by having a synchronous_reflector
    // method that we can try first, and which may fail.
    this.cls.getLoader().resolveClass(thread, this.rawDescriptor, (cdata: ClassData) => {
      if (cdata != null) {
        cb(createObj(cdata.getClassObject(thread)));
      } else {
        cb(null);
      }
    });
  }

  private getDefaultFieldValue(): string {
    var desc = this.rawDescriptor;
    if (desc === 'J') return 'gLongZero';
    var c = desc[0];
    if (c === '[' || c === 'L') return 'null';
    return '0';
  }

  /**
   * Outputs a JavaScript field assignment for this field.
   */
  public outputJavaScriptField(jsConsName: string, outputStream: StringOutputStream): void {
    if (this.accessFlags.isStatic()) {
      outputStream.write(`${jsConsName}["${reescapeJVMName(this.fullName)}"] = cls._getInitialStaticFieldValue(thread, "${reescapeJVMName(this.name)}");\n`);
    } else {
      outputStream.write(`this["${reescapeJVMName(this.fullName)}"] = ${this.getDefaultFieldValue()};\n`);
    }
  }
}

const opcodeSize: number[] = function() {
  const table: number[] = [];

  table[OpcodeLayoutType.OPCODE_ONLY] = 1;
  table[OpcodeLayoutType.CONSTANT_POOL_UINT8] = 2;
  table[OpcodeLayoutType.CONSTANT_POOL] = 3;
  table[OpcodeLayoutType.CONSTANT_POOL_AND_UINT8_VALUE] = 4;
  table[OpcodeLayoutType.UINT8_VALUE] = 2;
  table[OpcodeLayoutType.UINT8_AND_INT8_VALUE] = 3;
  table[OpcodeLayoutType.INT8_VALUE] = 2;
  table[OpcodeLayoutType.INT16_VALUE] = 3;
  table[OpcodeLayoutType.INT32_VALUE] = 5;
  table[OpcodeLayoutType.ARRAY_TYPE] = 2;
  table[OpcodeLayoutType.WIDE] = 1;

  return table;
}();

class TraceInfo {
  pops: string[] = [];
  pushes: string[] = [];
  prefixEmit: string = "";
  onErrorPushes: string[];

  constructor(public pc: number, public jitInfo: JitInfo) {
  }
}

class Trace {
  private infos: TraceInfo[] = [];
  private endPc: number = -1;

  constructor(public startPC: number, private code: Buffer, private method: Method) {
  }

  /**
   * Emits a PC update statement at the end of the trace.
   */
  public emitEndPC(pc: number): void {
    this.endPc = pc;
  }

  public addOp(pc: number, jitInfo: JitInfo) {
    this.infos.push(new TraceInfo(pc, jitInfo));
  }

  public close(thread: JVMThread): Function {
    if (this.infos.length > 1) {
      const symbolicStack: string[] = [];
      let symbolCount = 0;
      // Ensure that the last statement sets the PC if the
      // last opcode doesn't.
      let emitted = this.endPc > -1 ? `f.pc=${this.endPc};` : "";
      for (let i = 0; i < this.infos.length; i++) {
        const info = this.infos[i];
        const jitInfo = info.jitInfo;

        const pops = info.pops;
        const normalizedPops = jitInfo.pops < 0 ? Math.min(-jitInfo.pops, symbolicStack.length) : jitInfo.pops;
        for (let j = 0; j < normalizedPops; j++) {
          if (symbolicStack.length > 0) {
            pops.push(symbolicStack.pop());
          } else {
            const symbol = "s" + symbolCount++;
            info.prefixEmit += `var ${symbol} = f.opStack.pop();`;
            pops.push(symbol);
          }
        }

        info.onErrorPushes = symbolicStack.slice();

        const pushes = info.pushes;
        for (let j = 0; j < jitInfo.pushes; j++) {
          const symbol = "s" + symbolCount++;
          symbolicStack.push(symbol);
          pushes.push(symbol);
        }

      }

      if (symbolicStack.length === 1) {
        emitted += `f.opStack.push(${symbolicStack[0]});`;
      } else if (symbolicStack.length > 1) {
        emitted += `f.opStack.pushAll(${symbolicStack.join(',')});`;
      }

      for (let i = this.infos.length-1; i >= 0; i--) {
        const info = this.infos[i];
        const jitInfo = info.jitInfo;
        emitted = info.prefixEmit + jitInfo.emit(info.pops, info.pushes, ""+i, emitted, this.code, info.pc, info.onErrorPushes, this.method);
      }

      if (!RELEASE && thread.getJVM().shouldPrintJITCompilation()) {
        console.log(`Emitted trace of ${this.infos.length} ops: ` + emitted);
      }
      // f = frame, t = thread, u = util
      return new Function("f", "t", "u", emitted);
    } else {
      if (!RELEASE && thread.getJVM().shouldPrintJITCompilation()) {
        console.log(`Trace was cancelled`);
      }
      return null;
    }
  }
}

export class Method extends AbstractMethodField {
  /**
   * The method's parameters, if any, in descriptor form.
   */
  public parameterTypes: string[];
  /**
   * The method's return type in descriptor form.
   */
  public returnType: string;
  /**
   * The method's signature, e.g. bar()V
   */
  public signature: string;
  /**
   * The method's signature, including defining class; e.g. java/lang/String/bar()V
   */
  public fullSignature: string;
  /**
   * The number of JVM words required to store the parameters (e.g. longs/doubles take up 2 words).
   * Does not include the "this" argument to non-static functions.
   */
  private parameterWords: number;
  /**
   * Code is either a function, or a CodeAttribute.
   * TODO: Differentiate between NativeMethod objects and BytecodeMethod objects.
   */
  private code: any;

  /**
   * number of basic block entries
   */
  private numBBEntries = 0;

  private compiledFunctions: Function[] = [];
  private failedCompile: boolean[] = [];

  constructor(cls: ReferenceClassData<JVMTypes.java_lang_Object>, constantPool: ConstantPool, slot: number, byteStream: ByteStream) {
    super(cls, constantPool, slot, byteStream);
    var parsedDescriptor = getTypes(this.rawDescriptor), i: number,
      p: string;
    this.signature = this.name + this.rawDescriptor;
    this.fullSignature = `${descriptor2typestr(this.cls.getInternalName())}/${this.signature}`;
    this.returnType = parsedDescriptor.pop();
    this.parameterTypes = parsedDescriptor;
    this.parameterWords = parsedDescriptor.length;

    // Double count doubles / longs.
    for (i = 0; i < this.parameterTypes.length; i++) {
      p = this.parameterTypes[i];
      if (p === 'D' || p === 'J') {
        this.parameterWords++;
      }
    }

    // Initialize 'code' property.
    var clsName = this.cls.getInternalName();
    if (getTrappedMethod(clsName, this.signature) !== null) {
      this.code = getTrappedMethod(clsName, this.signature);
      this.accessFlags.setNative(true);
    } else if (this.accessFlags.isNative()) {
      if (this.signature.indexOf('registerNatives()V', 0) < 0 && this.signature.indexOf('initIDs()V', 0) < 0) {
        // The first version of the native method attempts to fetch itself and
        // rewrite itself.
        var self = this;
        this.code = function(thread: JVMThread) {
          // Try to fetch the native method.
          var jvm = thread.getJVM(),
            c = jvm.getNative(clsName, self.signature);
          if (c == null) {
            thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', `Native method '${self.getFullSignature()}' not implemented.\nPlease fix or file a bug at https://github.com/plasma-umass/doppio/issues`);
          } else {
            self.code = c;
            return c.apply(self, arguments);
          }
        };
      } else {
        // Stub out initIDs and registerNatives.
        this.code = () => { };
      }
    } else if (!this.accessFlags.isAbstract()) {
      this.code = this.getAttribute('Code');
      const codeLength = this.code.code.length;

      // jit threshold. we countdown to zero from here.
      this.numBBEntries = codeLength > 3 ? 200 : 1000 * codeLength;
    }
  }

  public incrBBEntries() {
    // Optimisiation: we countdown to zero, instead of storing a positive limit in a separate variable
    this.numBBEntries--;
  }

  /**
   * Checks if the method is a default method.
   * A default method is a public non-abstract instance method, that
   * is, a non-static method with a body, declared in an interface
   * type.
   */
  public isDefault(): boolean {
    return (this.accessFlags.isPublic() && !this.accessFlags.isAbstract() && !this.accessFlags.isStatic() && this.cls.accessFlags.isInterface());
  }

  public getFullSignature(): string {
    return `${this.cls.getExternalName()}.${this.name}${this.rawDescriptor}`;
  }

  /**
   * Checks if this particular method should be hidden in stack frames.
   * Used by OpenJDK's lambda implementation to hide lambda boilerplate.
   */
  public isHidden(): boolean {
    var rva: RuntimeVisibleAnnotations = <any> this.getAttribute('RuntimeVisibleAnnotations');
    return rva !== null && rva.isHidden;
  }

  /**
   * Checks if this particular method has the CallerSensitive annotation.
   */
  public isCallerSensitive(): boolean {
    var rva: RuntimeVisibleAnnotations = <any> this.getAttribute('RuntimeVisibleAnnotations');
    return rva !== null && rva.isCallerSensitive;
  }

  /**
   * Get the number of machine words (32-bit words) required to store the
   * parameters to this function. Includes adding in a machine word for 'this'
   * for non-static functions.
   */
  public getParamWordSize(): number {
    return this.parameterWords;
  }

  public getCodeAttribute(): Code {
    assert(!this.accessFlags.isNative() && !this.accessFlags.isAbstract());
    return this.code;
  }

  public getOp(pc: number, codeBuffer: Buffer, thread: JVMThread): any {
    if (this.numBBEntries <= 0) {
      if (!this.failedCompile[pc]) {
        const cachedCompiledFunction = this.compiledFunctions[pc];
        if (!cachedCompiledFunction) {
          const compiledFunction = this.jitCompileFrom(pc, thread);
          if (compiledFunction) {
            return compiledFunction;
          } else {
            this.failedCompile[pc] = true;
          }
        } else {
          return cachedCompiledFunction;
        }
      }
    }
    return codeBuffer[pc];
  }

  private makeInvokeStaticJitInfo(code: Buffer, pc: number) : JitInfo {
    const index = code.readUInt16BE(pc + 1);
    const methodReference = <MethodReference | InterfaceMethodReference> this.cls.constantPool.get(index);
    const paramSize = methodReference.paramWordSize;

    return {hasBranch: true, pops: -paramSize, pushes: 0, emit: (pops, pushes, suffix, onSuccess) => {
      const argInitialiser = paramSize > pops.length ? `f.opStack.sliceAndDropFromTop(${paramSize - pops.length});` : `[${pops.reduce((a,b) => b + ',' + a, '')}];`;
      let argMaker = `var args${suffix}=` + argInitialiser;
      if ((paramSize > pops.length) && (pops.length > 0)) {
        argMaker += `args${suffix}.push(${pops.slice().reverse().join(',')});`;
      }
      return argMaker + `
var methodReference${suffix}=f.method.cls.constantPool.get(${index});
f.pc=${pc};
methodReference${suffix}.jsConstructor[methodReference${suffix}.fullSignature](t,args${suffix});
f.returnToThreadLoop=true;
${onSuccess}`;
    }};

  }

  private makeInvokeVirtualJitInfo(code: Buffer, pc: number) : JitInfo {
    const index = code.readUInt16BE(pc + 1);
    const methodReference = <MethodReference | InterfaceMethodReference> this.cls.constantPool.get(index);
    const paramSize = methodReference.paramWordSize;
    return {hasBranch: true, pops: -(paramSize + 1), pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
      const onError = makeOnError(onErrorPushes);
      const argInitialiser = paramSize > pops.length ? `f.opStack.sliceAndDropFromTop(${paramSize - pops.length});` : `[${pops.slice(0, paramSize).reduce((a,b) => b + ',' + a, '')}];`;
      let argMaker = `var args${suffix}=` + argInitialiser;
      if ((paramSize > pops.length) && (pops.length > 0)) {
        argMaker += `args${suffix}.push(${pops.slice().reverse().join(',')});`;
      }
      return argMaker + `var obj${suffix}=${(paramSize+1)===pops.length?pops[paramSize]:"f.opStack.pop()"};f.pc=${pc};
if(!u.isNull(t,f,obj${suffix})){obj${suffix}['${methodReference.signature}'](t,args${suffix});f.returnToThreadLoop=true;${onSuccess}}else{${onError}}`;
    }};

  }

  private makeInvokeNonVirtualJitInfo(code: Buffer, pc: number) : JitInfo {
    const index = code.readUInt16BE(pc + 1);
    const methodReference = <MethodReference | InterfaceMethodReference> this.cls.constantPool.get(index);
    const paramSize = methodReference.paramWordSize;
    return {hasBranch: true, pops: -(paramSize + 1), pushes: 0, emit: (pops, pushes, suffix, onSuccess, code, pc, onErrorPushes) => {
      const onError = makeOnError(onErrorPushes);
      const argInitialiser = paramSize > pops.length ? `f.opStack.sliceAndDropFromTop(${paramSize - pops.length});` : `[${pops.slice(0, paramSize).reduce((a,b) => b + ',' + a, '')}];`;
      let argMaker = `var args${suffix}=` + argInitialiser;
      if ((paramSize > pops.length) && (pops.length > 0)) {
        argMaker += `args${suffix}.push(${pops.slice().reverse().join(',')});`;
      }
      return argMaker + `var obj${suffix}=${(paramSize+1)===pops.length?pops[paramSize]:"f.opStack.pop()"};f.pc=${pc};
if(!u.isNull(t,f,obj${suffix})){obj${suffix}['${methodReference.fullSignature}'](t, args${suffix});f.returnToThreadLoop=true;${onSuccess}}else{${onError}}`;
    }};
  }

  private jitCompileFrom(startPC: number, thread: JVMThread) {
    if (!RELEASE && thread.getJVM().shouldPrintJITCompilation()) {
      console.log(`Planning to JIT: ${this.fullSignature} from ${startPC}`);
    }
    const code = this.getCodeAttribute().getCode();
    let trace: Trace = null;
    const self = this;
    let done = false;

    function closeCurrentTrace() {
      if (trace !== null) {
        // console.log("Tracing method: " + self.fullSignature);
        const compiledFunction = trace.close(thread);
        if (compiledFunction) {
          self.compiledFunctions[trace.startPC] = compiledFunction;
          if (!RELEASE && thread.getJVM().shouldDumpCompiledCode()) {
            thread.getJVM().dumpCompiledMethod(self.fullSignature, trace.startPC, compiledFunction.toString());
          }
        }
        trace = null;
      }
      done = true;
    }

    for (let i = startPC; i < code.length && !done;) {
      const op = code[i];
      // TODO: handle wide()
      if (!RELEASE && thread.getJVM().shouldPrintJITCompilation()) {
        console.log(`${i}: ${annotateOpcode(op, this, code, i)}`);
      }
      const jitInfo = opJitInfo[op];
      if (jitInfo) {
        if (trace === null) {
          trace = new Trace(i, code, self);
        }
        trace.addOp(i, jitInfo);
        if (jitInfo.hasBranch) {
          this.failedCompile[i] = true;
          closeCurrentTrace();
        }
      } else if (op === OpCode.INVOKESTATIC_FAST && trace !== null) {
        const invokeJitInfo: JitInfo = this.makeInvokeStaticJitInfo(code, i);
        trace.addOp(i, invokeJitInfo);

        this.failedCompile[i] = true;
        closeCurrentTrace();

      } else if (((op === OpCode.INVOKEVIRTUAL_FAST) || (op === OpCode.INVOKEINTERFACE_FAST)) && trace !== null) {
        const invokeJitInfo: JitInfo = this.makeInvokeVirtualJitInfo(code, i);
        trace.addOp(i, invokeJitInfo);

        this.failedCompile[i] = true;
        closeCurrentTrace();
      } else if ((op === OpCode.INVOKENONVIRTUAL_FAST) && trace !== null) {
        const invokeJitInfo: JitInfo = this.makeInvokeNonVirtualJitInfo(code, i);
        trace.addOp(i, invokeJitInfo);

        this.failedCompile[i] = true;
        closeCurrentTrace();
      } else {
        if (!RELEASE) {
          if (trace !== null) {
            statTraceCloser[op]++;
          }
        }
        this.failedCompile[i] = true;
        if (trace) {
          trace.emitEndPC(i);
        }
        closeCurrentTrace();
      }
      i += opcodeSize[OpcodeLayouts[op]];
    }

    return self.compiledFunctions[startPC];
  }

  public getNativeFunction(): Function {
    assert(this.accessFlags.isNative() && typeof (this.code) === 'function');
    return this.code;
  }

  /**
   * Resolves all of the classes referenced through this method. Required in
   * order to create its reflection object.
   */
  private _resolveReferencedClasses(thread: JVMThread, cb: (classes: {[ className: string ]: ClassData}) => void): void {
    // Start with the return type + parameter types + reflection object types.
    var toResolve: string[] = this.parameterTypes.concat(this.returnType),
      code: Code = this.code,
      exceptionAttribute = <Exceptions> this.getAttribute("Exceptions");
    // Exception handler types.
    if (!this.accessFlags.isNative() && !this.accessFlags.isAbstract() && code.exceptionHandlers.length > 0) {
      toResolve.push('Ljava/lang/Throwable;'); // Mimic native Java (in case <any> is the only handler).
      // Filter out the <any> handlers.
      toResolve = toResolve.concat(code.exceptionHandlers.filter((handler) => handler.catchType !== '<any>').map((handler) => handler.catchType));
    }
    // Resolve checked exception types.
    if (exceptionAttribute !== null) {
      toResolve = toResolve.concat(exceptionAttribute.exceptions);
    }

    this.cls.getLoader().resolveClasses(thread, toResolve, (classes: {[className: string]: ClassData}) => {
      // Use bootstrap classloader for reflection classes.
      thread.getBsCl().resolveClasses(thread, ['Ljava/lang/reflect/Method;', 'Ljava/lang/reflect/Constructor;'], (classes2: {[className: string]: ClassData}) => {
        if (classes === null || classes2 === null) {
          cb(null);
        } else {
          classes['Ljava/lang/reflect/Method;'] = classes2['Ljava/lang/reflect/Method;'];
          classes['Ljava/lang/reflect/Constructor;'] = classes2['Ljava/lang/reflect/Constructor;'];
          cb(classes);
        }
      });
    });
  }

  /**
   * Get a reflection object representing this method.
   */
  public reflector(thread: JVMThread, cb: (reflectedMethod: JVMTypes.java_lang_reflect_Executable) => void): void {
    var bsCl = thread.getBsCl(),
      // Grab the classes required to construct the needed arrays.
      clazzArray = (<ArrayClassData<JVMTypes.java_lang_Class>> bsCl.getInitializedClass(thread, '[Ljava/lang/Class;')).getConstructor(thread),
      jvm = thread.getJVM(),
      // Grab the needed
      signatureAttr = <Signature> this.getAttribute("Signature"),
      exceptionAttr = <Exceptions> this.getAttribute("Exceptions");

    // Retrieve all of the required class references.
    this._resolveReferencedClasses(thread, (classes: { [className: string ]: ClassData }) => {
      if (classes === null) {
        return cb(null);
      }

      // Construct the needed objects for the reflection object.
      var clazz = this.cls.getClassObject(thread),
        name = jvm.internString(this.name),
        parameterTypes = new clazzArray(thread, 0),
        returnType = classes[this.returnType].getClassObject(thread),
        exceptionTypes = new clazzArray(thread, 0),
        modifiers = this.accessFlags.getRawByte(),
        signature = signatureAttr !== null ? jvm.internString(signatureAttr.sig) : null;

      // Prepare the class arrays.
      parameterTypes.array = this.parameterTypes.map((ptype: string) => classes[ptype].getClassObject(thread));
      if (exceptionAttr !== null) {
        exceptionTypes.array = exceptionAttr.exceptions.map((eType: string) => classes[eType].getClassObject(thread));
      }

      if (this.name === '<init>') {
        // Constructor object.
        var consCons = (<ReferenceClassData<JVMTypes.java_lang_reflect_Constructor>> classes['Ljava/lang/reflect/Constructor;']).getConstructor(thread),
          consObj = new consCons(thread);
        consObj['java/lang/reflect/Constructor/clazz'] = clazz;
        consObj['java/lang/reflect/Constructor/parameterTypes'] = parameterTypes;
        consObj['java/lang/reflect/Constructor/exceptionTypes'] = exceptionTypes;
        consObj['java/lang/reflect/Constructor/modifiers'] = modifiers;
        consObj['java/lang/reflect/Constructor/slot'] = this.slot;
        consObj['java/lang/reflect/Constructor/signature'] = signature;
        consObj['java/lang/reflect/Constructor/annotations'] = this.getAnnotationType(thread, 'RuntimeVisibleAnnotations');
        consObj['java/lang/reflect/Constructor/parameterAnnotations'] = this.getAnnotationType(thread, 'RuntimeVisibleParameterAnnotations');
        cb(consObj);
      } else {
        // Method object.
        var methodCons = (<ReferenceClassData<JVMTypes.java_lang_reflect_Method>>  classes['Ljava/lang/reflect/Method;']).getConstructor(thread),
          methodObj = new methodCons(thread);
        methodObj['java/lang/reflect/Method/clazz'] = clazz;
        methodObj['java/lang/reflect/Method/name'] = name;
        methodObj['java/lang/reflect/Method/parameterTypes'] = parameterTypes;
        methodObj['java/lang/reflect/Method/returnType'] = returnType;
        methodObj['java/lang/reflect/Method/exceptionTypes'] = exceptionTypes;
        methodObj['java/lang/reflect/Method/modifiers'] = modifiers;
        methodObj['java/lang/reflect/Method/slot'] = this.slot;
        methodObj['java/lang/reflect/Method/signature'] = signature;
        methodObj['java/lang/reflect/Method/annotations'] = this.getAnnotationType(thread, 'RuntimeVisibleAnnotations');
        methodObj['java/lang/reflect/Method/annotationDefault'] = this.getAnnotationType(thread, 'AnnotationDefault');
        methodObj['java/lang/reflect/Method/parameterAnnotations'] = this.getAnnotationType(thread, 'RuntimeVisibleParameterAnnotations');
        cb(methodObj);
      }
    });
  }

  /**
   * Convert the arguments to this method into a form suitable for a native
   * implementation.
   *
   * The JVM uses two parameter slots for double and long values, since they
   * consist of two JVM machine words (32-bits). Doppio stores the entire value
   * in one slot, and stores a NULL in the second.
   *
   * This function strips out these NULLs so the arguments are in a more
   * consistent form. The return value is the arguments to this function without
   * these NULL values. It also adds the 'thread' object to the start of the
   * arguments array.
   */
  public convertArgs(thread: JVMThread, params: any[]): any[] {
    if (this.isSignaturePolymorphic()) {
      // These don't need any conversion, and have arbitrary arguments.
      // Just append the thread object.
      params.unshift(thread);
      return params;
    }
    var convertedArgs = [thread], argIdx = 0, i: number;
    if (!this.accessFlags.isStatic()) {
      convertedArgs.push(params[0]);
      argIdx = 1;
    }
    for (i = 0; i < this.parameterTypes.length; i++) {
      var p = this.parameterTypes[i];
      convertedArgs.push(params[argIdx]);
      argIdx += (p === 'J' || p === 'D') ? 2 : 1;
    }
    return convertedArgs;
  }

  /**
   * Lock this particular method.
   */
  public methodLock(thread: JVMThread, frame: BytecodeStackFrame): Monitor {
    if (this.accessFlags.isStatic()) {
      // Static methods lock the class.
      return this.cls.getClassObject(thread).getMonitor();
    } else {
      // Non-static methods lock the instance.
      return (<JVMTypes.java_lang_Object> frame.locals[0]).getMonitor();
    }
  }

  /**
   * Check if this is a signature polymorphic method.
   * From S2.9:
   * A method is signature polymorphic if and only if all of the following conditions hold :
   * * It is declared in the java.lang.invoke.MethodHandle class.
   * * It has a single formal parameter of type Object[].
   * * It has a return type of Object.
   * * It has the ACC_VARARGS and ACC_NATIVE flags set.
   */
  public isSignaturePolymorphic(): boolean {
    return this.cls.getInternalName() === 'Ljava/lang/invoke/MethodHandle;' &&
      this.accessFlags.isNative() && this.accessFlags.isVarArgs() &&
      this.rawDescriptor === '([Ljava/lang/Object;)Ljava/lang/Object;';
  }

  /**
   * Retrieve the MemberName/invokedynamic JavaScript "bridge method" that
   * encapsulates the logic required to call this particular method.
   */
  public getVMTargetBridgeMethod(thread: JVMThread, refKind: number): (thread: JVMThread, descriptor: string, args: any[], cb?: (e?: JVMTypes.java_lang_Throwable, rv?: any) => void) => void {
    // TODO: Could cache these in the Method object if desired.
    var outStream = new StringOutputStream(),
      virtualDispatch = !(refKind === MethodHandleReferenceKind.INVOKESTATIC || refKind === MethodHandleReferenceKind.INVOKESPECIAL);
    // Args: thread, cls, util
    if (this.accessFlags.isStatic()) {
      assert(!virtualDispatch, "Can't have static virtual dispatch.");
      outStream.write(`var jsCons = cls.getConstructor(thread);\n`);
    }
    outStream.write(`function bridgeMethod(thread, descriptor, args, cb) {\n`);
    if (!this.accessFlags.isStatic()) {
      outStream.write(`  var obj = args.shift();\n`);
      outStream.write(`  if (obj === null) { return thread.throwNewException('Ljava/lang/NullPointerException;', ''); }\n`);
      outStream.write(`  obj["${reescapeJVMName(virtualDispatch ? this.signature : this.fullSignature)}"](thread, `);
    } else {
      outStream.write(`  jsCons["${reescapeJVMName(this.fullSignature)}"](thread, `);
    }
    // TODO: Is it ever appropriate to box arguments for varargs functions? It appears not.
    outStream.write(`args`);
    outStream.write(`, cb);
  }
  return bridgeMethod;`);

    var evalText = outStream.flush();
    if (!RELEASE && thread !== null && thread.getJVM().shouldDumpCompiledCode()) {
      thread.getJVM().dumpBridgeMethod(this.fullSignature, evalText);
    }
    return new Function("thread", "cls", "util", evalText)(thread, this.cls, util);
  }

  /**
   * Generates JavaScript code for this particular method.
   * TODO: Move lock logic and such into this function! And other specialization.
   * TODO: Signature polymorphic functions...?
   */
  public outputJavaScriptFunction(jsConsName: string, outStream: StringOutputStream, nonVirtualOnly: boolean = false): void {
    var i: number;
    if (this.accessFlags.isStatic()) {
      outStream.write(`${jsConsName}["${reescapeJVMName(this.fullSignature)}"] = ${jsConsName}["${reescapeJVMName(this.signature)}"] = `);
    } else {
      if (!nonVirtualOnly) {
        outStream.write(`${jsConsName}.prototype["${reescapeJVMName(this.signature)}"] = `);
      }
      outStream.write(`${jsConsName}.prototype["${reescapeJVMName(this.fullSignature)}"] = `);
    }
    // cb check is boilerplate, required for natives calling into JVM land.
    outStream.write(`(function(method) {
  return function(thread, args, cb) {
    if (typeof cb === 'function') {
      thread.stack.push(new InternalStackFrame(cb));
    }
    thread.stack.push(new ${this.accessFlags.isNative() ? "NativeStackFrame" : "BytecodeStackFrame"}(method, `);
    if (!this.accessFlags.isStatic()) {
      // Non-static functions need to add the implicit 'this' variable to the
      // local variables.
      outStream.write(`[this`);
      // Give the JS engine hints about the size, type, and contents of the array
      // by making it a literal.
      for (i = 0; i < this.parameterWords; i++) {
        outStream.write(`, args[${i}]`);
      }
      outStream.write(`]`);
    } else {
      // Static function doesn't need to mutate the arguments.
      if (this.parameterWords > 0) {
        outStream.write(`args`);
      } else {
        outStream.write(`[]`);
      }
    }
    outStream.write(`));
    thread.setStatus(${ThreadStatus.RUNNABLE});
  };
})(cls.getSpecificMethod("${reescapeJVMName(this.cls.getInternalName())}", "${reescapeJVMName(this.signature)}"));\n`);
  }
}

function makeOnError(onErrorPushes: string[]) {
  return onErrorPushes.length > 0 ? `f.opStack.pushAll(${onErrorPushes.join(',')});` : '';
}

const statTraceCloser: number[] = new Array(256);

if (!RELEASE) {
  for (let i = 0; i < 256; i++) {
    statTraceCloser[i] = 0;
  }
}

export function dumpStats() {
  const range = new Array(256);
  for (let i = 0; i < 256; i++) {
    range[i] = i;
  }
  range.sort((x, y) => statTraceCloser[y] - statTraceCloser[x]);
  const top = range.slice(0, 24);
  console.log("Opcodes that closed a trace (number of times encountered):");
  for (let i = 0; i < top.length; i++) {
    const op = top[i];
    if (statTraceCloser[op] > 0) {
      console.log(OpCode[op], statTraceCloser[op]);
    }
  }
}
