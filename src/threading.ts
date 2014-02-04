/// <amd-dependency path="../vendor/underscore/underscore" />
"use strict";
var underscore = require('../vendor/underscore/underscore');
import util = require('./util');
// type-only deps
import runtime = require('./runtime');
import ClassData = require('./ClassData');
import ClassLoader = require('./ClassLoader');
import java_object = require('./java_object');
import methods = require('./methods');
import fs = require('fs');

export class JavaThreadObject extends java_object.JavaObject {
  public $meta_stack: CallStack;
  public $isAlive: boolean;
  public wakeup_time: number;
  public $park_count: number;
  public $park_timeout: number;
  // XXX: Used if it's a 'fake' Thread object. I'm so sorry. We need to have a
  // special subclass for that thread.
  public fake: boolean;
  constructor(rs: runtime.RuntimeState, cls: ClassData.ReferenceClassData, obj?: any) {
    // First thread to bootstrap us into the JVM.
    // We can't cast cls to ReferenceClassData because it fails to validate.
    // Instead, we cast to any, which can be assigned to variables of any type.
    if (cls == null) {
      cls = <any> {
        get_type: (() => 'Ljava/lang/Thread;'),
        loader: rs.get_bs_cl(),
        get_default_fields: (() => null)  // XXX: Hack for now.
      };
      this.fake = true;
    } else {
      this.fake = false;
    }
    super(rs, cls, obj);
    this.$isAlive = true;
    this.wakeup_time = null;
    this.$park_count = 0;
    this.$park_timeout = Infinity;
    this.$meta_stack = new CallStack();
  }

  public clone(rs: runtime.RuntimeState): JavaThreadObject {
    return new JavaThreadObject(rs, this.cls, underscore.clone(this.fields));
  }

  public name(rs: runtime.RuntimeState): string {
    return util.chars2js_str(this.get_field(rs, 'Ljava/lang/Thread;name'));
  }

  public dump_state(rs: runtime.RuntimeState): void {
    var filename = "/tmp/core-" + this.name(rs) + ".json";
    var data = this.$meta_stack.dump_state();
    fs.writeFile(filename, data, 'utf8', function (err) {
      if (err) {
        // XXX: should handle this correctly.
        console.error(err);
      } else {
        process.stdout.write("Wrote core dump to " + filename + "\n");
      }
    });
  }
}

export interface StackFrameSnapshot {
  name: string;
  pc: number;
  native: boolean;
  loader: ClassLoader.ClassLoader;
  stack: any[];
  locals: any[];
}

export class CallStack {
  public _cs: StackFrame[]

  constructor(initial_stack?: any[]) {
    this._cs = [StackFrame.native_frame('$bootstrap')];
    if (initial_stack != null) {
      this._cs[0].stack = initial_stack;
    }
  }

  public dump_state(): string {
    var visited: {[name: string]: boolean} = {};
    var snapshots = this._cs.map((frame: StackFrame) => frame.snap(visited));
    return JSON.stringify(snapshots.map((ss) => ss.serialize()));
  }

  public length(): number {
    return this._cs.length;
  }

  public push(sf: StackFrame): number {
    return this._cs.push(sf);
  }

  public pop(): StackFrame {
    return this._cs.pop();
  }

  public pop_n(n: number): void {
    this._cs.length -= n;
  }

  public curr_frame(): StackFrame {
    return util.last(this._cs);
  }

  public get_caller(frames_to_skip: number): StackFrame {
    return this._cs[this._cs.length - 1 - frames_to_skip];
  }
}

export class StackFrame {
  public method: methods.Method;
  public locals: any[];
  public stack: any[];
  public pc: number;
  public runner: () => any;
  private native: boolean;
  public name: string;

  // XXX: Super kludge: DO NOT USE. Used by the ClassLoader on native frames.
  // We should... remove this...
  public cdata: ClassData.ClassData;

  // Used by Native Frames
  public error: (p:any)=>any

  constructor(method: methods.Method, locals: any[], stack: any[]) {
    this.method = method;
    this.locals = locals;
    this.stack = stack;
    this.pc = 0;
    this.runner = null;
    this.native = false;
    this.name = this.method.full_signature();
  }

  public snap(visited: {[name:string]:boolean}): { serialize: () => StackFrameSnapshot } {
    var _this = this;
    var rv : StackFrameSnapshot = {
      name: this.name,
      pc: this.pc,
      native: this.native,
      loader: null,
      stack: null,
      locals: null
    };
    function serializer(obj: any): any {
      if (obj != null && typeof obj.serialize === "function") {
        return obj.serialize(visited);
      }
      return obj;
    }
    function s(): StackFrameSnapshot {
      if (_this.method.cls != null) {
        rv.loader = _this.method.cls.loader.serialize(visited);
      }
      rv.stack = _this.stack.map(serializer);
      rv.locals = _this.locals.map(serializer);
      return rv;
    }
    return { serialize: s };
  }

  // Creates a "native stack frame". Handler is called with no arguments for
  // normal execution, error_handler is called with the uncaught exception.
  // If error_handler is not specified, then the exception will propagate through
  // normally.
  // Used for <clinit> and ClassLoader shenanigans. A native frame handles
  // bridging the gap between those Java methods and the methods that ended up
  // triggering them in the first place.
  public static native_frame(name: string, handler?: ()=>any, error_handler?:(p:any)=>any): StackFrame {
    // XXX: Super kludge!
    // Fake method in the stack frame.
    var sf = new StackFrame(<methods.Method>{
      full_signature: (() => name)
    }, [], []);
    sf.runner = handler;
    sf.name = name;
    if (error_handler != null) {
      sf.error = error_handler;
    }
    sf.native = true;
    return sf;
  }
}
