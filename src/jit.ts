"use strict";

import enums = require('./enums');
import opcodes = require('./opcodes');
import {Method} from './methods';
import ConstantPool = require('./ConstantPool');
import jit_info = require('./jit_info');
import threading = require('./threading');
import JitInfo = jit_info.JitInfo;
const dynamicOpJitInfo = jit_info.dynamicOpJitInfo;
const opJitInfo = jit_info.opJitInfo;
const opcodeSize = jit_info.opcodeSize;
const contextualOpcodeSize = jit_info.contextualOpcodeSize;

declare var RELEASE: boolean;

export default class JIT {
  constructor(private _printMethods: boolean) {}

  private _compileFunction(method: Method, blocks: {[pc: number]: string}): Function {
    // Create a single function.
    // method.runFcn(thread, this, code, this.pc);
    // t f c u o
    let output = 'while(!f.returnToThreadLoop){switch(f.pc) {';
    Object.keys(blocks).forEach((pc: string): void => {
      output += `case ${pc}:${blocks[<any> pc]};break;`;
    });
    // Trigger a re-JIT on executing non-JITTed opcodes.
    // Most of these will be JITable once run.
    output += `default:f.method.jitCheck(t,f);o[c.readUInt8(f.pc)](t, f, c);break;}}`;
    if (this._printMethods) {
      console.log(`Final method:\n${output}`);
    }
    // TODO: Re-JIT.
    return new Function("t", "f", "c", "u", "o", output);
  }

  /**
   * Compile the method into a single JavaScript function.
   */
  public jit(thread: threading.JVMThread, method: Method): void {
    if (!RELEASE && this._printMethods) {
      console.log(`JIT: Compiled ${method.fullSignature}`);
    }
    const code = method.getCodeAttribute().getCode();
    const compiledBlocks: {[startPC: number]: string} = {};
    let trace: BasicBlock = null;
    let this_ = this;

    function closeCurrentTrace() {
      if (trace !== null) {
        // console.log("Tracing method: " + _this.fullSignature);
        const compiledFunction = trace.close(this_._printMethods);
        if (compiledFunction) {
          compiledBlocks[trace.startPC] = compiledFunction;
        }
        trace = null;
      }
    }

    for (let i = 0; i < code.length;) {
      const op = code.readUInt8(i);
      // TODO: handle wide()
      if (!RELEASE && this._printMethods) {
        console.log(`${i}: ${threading.annotateOpcode(op, method, code, i)}`);
      }
      let jitInfo = opJitInfo[op];
      if (!jitInfo) {
        const factory = dynamicOpJitInfo[op];
        if (factory) {
          jitInfo = factory(method, code, i)
        }
      }

      if (jitInfo) {
        if (trace === null) {
          trace = new BasicBlock(i, code, method);
        }
        trace.addOp(i, jitInfo);
        if (jitInfo.hasBranch) {
          closeCurrentTrace();
        }
      } else {
        // Unhandled opcode.
        if (!RELEASE) {
          if (trace !== null) {
            statTraceCloser[op]++;
          }
        }
        if (trace) {
          trace.emitEndPC(i);
        }
        closeCurrentTrace();
      }
      const size = opcodeSize[op];
      if (size) {
        i += size;
      } else {
        i += contextualOpcodeSize[op](i, code);
      }
    }

    method.installJITFunction(this._compileFunction(method, compiledBlocks));
  }
}

class BlockInfo {
  pops: string[] = [];
  pushes: string[] = [];
  prefixEmit: string = "";
  onErrorPushes: string[];
  length: number;

  constructor(public pc: number, public jitInfo: JitInfo) {}
}

class BasicBlock {
  private infos: BlockInfo[] = [];
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
    this.infos.push(new BlockInfo(pc, jitInfo));
  }

  /**
   * Returns a string with code associated with this basic block.
   *
   * The code expects three in-scope variables:
   * f = frame, t = thread, u = util
   */
  public close(printCompilation: boolean): string {
    if (this.infos.length > 1) {
      const symbolicStack: string[] = [];
      const startPC = this.startPC;
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
            // Make symbol unique for entire JIT'd function.
            const symbol = `s${startPC}_${symbolCount++}`;
            info.prefixEmit += `var ${symbol} = f.opStack.pop();`;
            pops.push(symbol);
          }
        }

        info.onErrorPushes = symbolicStack.slice();

        const pushes = info.pushes;
        for (let j = 0; j < jitInfo.pushes; j++) {
          const symbol = `s${startPC}_${symbolCount++}`;
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

      if (!RELEASE && printCompilation) {
        console.log(`Emitted trace of ${this.infos.length} ops: ` + emitted);
      }
      return emitted;
    } else {
      if (!RELEASE && printCompilation) {
        console.log(`Trace was cancelled`);
      }
      return null;
    }
  }
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
      console.log(enums.OpCode[op], statTraceCloser[op]);
    }
  }
}
