"use strict";
/// <amd-dependency path="./gLong" />
import gLong = require('./gLong');
/// <amd-dependency path="./util" />
import util = require('./util');
/// <amd-dependency path="./logging" />
import logging = require('./logging');
/// <amd-dependency path="./exceptions" />
import exceptions = require('./exceptions');
/// <amd-dependency path="./java_object" />
import java_object = require('./java_object');
/// <amd-dependency path="./jvm" />
import JVM = require('./jvm');
import methods = require('./methods');
import ClassData = require('./ClassData');
/// <amd-dependency path="./ClassLoader" />
import ClassLoader = require('./ClassLoader');

declare var node: any, UNSAFE : boolean;
declare var setImmediate: (cb: (p:any)=>any)=>void
var vtrace = logging.vtrace;
var trace = logging.trace;
var debug = logging.debug;
var error = logging.error;
var YieldIOException = exceptions.YieldIOException;
var ReturnException = exceptions.ReturnException;
var JavaException = exceptions.JavaException;
var JavaObject = java_object.JavaObject;
var JavaArray = java_object.JavaArray;
var JavaThreadObject = java_object.JavaThreadObject;
var thread_name = java_object.thread_name;
var process = typeof node !== "undefined" ? node.process : global.process;

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

  public snap(): { serialize: () => StackFrameSnapshot[]} {
    var visited = {};
    var snapshots = this._cs.map((frame) => frame.snap(visited));
    return { serialize: (() => snapshots.map((ss) => ss.serialize())) };
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

  public static native_frame(name: string, handler?: ()=>any, error_handler?:(p:any)=>any): StackFrame {
    // XXX: Super kludge!
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

var run_count = 0;
export class RuntimeState {
  public print: (p:string) => any;
  private _async_input: (cb: (string) => any) => any;
  private bcl: ClassLoader.BootstrapClassLoader;
  private input_buffer: number[];
  private startup_time: gLong;
  public run_stamp: number;
  private mem_start_addrs: number[];
  public mem_blocks: any;
  public high_oref: number;
  private string_pool: util.SafeMap;
  public lock_refs: {[lock_id:number]: java_object.JavaThreadObject};
  public lock_counts: {[lock_id:number]: number};
  public waiting_threads: {[lock_id:number]: java_object.JavaThreadObject[]};
  private thread_pool: java_object.JavaThreadObject[];
  public curr_thread: java_object.JavaThreadObject;
  private max_m_count: number;
  public unusual_termination: boolean;
  public stashed_done_cb: (p:any) => any;
  public should_return: boolean;
  public system_initialized: boolean;

  constructor(print: (p:string) => any, _async_input: (cb: (p:string) => any) => any, bcl: ClassLoader.BootstrapClassLoader) {
    this.print = print;
    this._async_input = _async_input;
    this.bcl = bcl;
    this.input_buffer = [];
    this.bcl.reset();
    this.startup_time = gLong.fromNumber((new Date()).getTime());
    this.run_stamp = ++run_count;
    this.mem_start_addrs = [1];
    this.mem_blocks = {};
    this.high_oref = 1;
    this.string_pool = new util.SafeMap;
    this.lock_refs = {};
    this.lock_counts = {};
    this.waiting_threads = {};
    this.thread_pool = [];
    this.should_return = false;

    var ct = new JavaThreadObject(this, null);
    this.curr_thread = ct;
    this.max_m_count = 100000;
  }

  public get_bs_cl(): ClassLoader.BootstrapClassLoader {
    return this.bcl;
  }

  public get_bs_class(type: string, handle_null?: boolean): ClassData.ClassData {
    if (handle_null == null) {
      handle_null = false;
    }
    return this.bcl.get_initialized_class(type, handle_null);
  }

  public get_class(type: string, handle_null?: boolean): ClassData.ClassData {
    if (handle_null == null) {
      handle_null = false;
    }
    return this.curr_frame().method.cls.loader.get_initialized_class(type, handle_null);
  }

  public get_cl(): ClassLoader.ClassLoader {
    return this.curr_frame().method.cls.loader;
  }

  // XXX: These four methods avoid circular dependencies.
  public construct_cl(jclo: java_object.JavaClassLoaderObject): ClassLoader.ClassLoader {
    return new ClassLoader.CustomClassLoader(this.get_bs_cl(), jclo);
  }
  public construct_callstack(): CallStack {
    return new CallStack();
  }
  public construct_stackframe(method: methods.Method, locals: any[], stack: any[]): StackFrame {
    return new StackFrame(method, locals, stack);
  }
  public construct_nativeframe(name: string, handler?: ()=>any, error_handler?:(p:any)=>any): StackFrame {
    return StackFrame.native_frame(name, handler, error_handler);
  }

  public preinitialize_core_classes(resume_cb: () => any, except_cb: (cb: () => any) => any): void {
    var core_classes = [
      'Ljava/lang/Class;', 'Ljava/lang/ClassLoader;', 'Ljava/lang/String;',
      'Ljava/lang/Error;', 'Ljava/lang/StackTraceElement;',
      'Ljava/io/ExpiringCache;', 'Ljava/io/FileDescriptor;',
      'Ljava/io/FileNotFoundException;', 'Ljava/io/IOException;',
      'Ljava/io/Serializable;', 'Ljava/io/UnixFileSystem;',
      'Ljava/lang/ArithmeticException;',
      'Ljava/lang/ArrayIndexOutOfBoundsException;',
      'Ljava/lang/ArrayStoreException;', 'Ljava/lang/ClassCastException;',
      'Ljava/lang/ClassNotFoundException;', 'Ljava/lang/NoClassDefFoundError;',
      'Ljava/lang/Cloneable;', 'Ljava/lang/ExceptionInInitializerError;',
      'Ljava/lang/IllegalMonitorStateException;',
      'Ljava/lang/InterruptedException;',
      'Ljava/lang/NegativeArraySizeException;', 'Ljava/lang/NoSuchFieldError;',
      'Ljava/lang/NoSuchMethodError;', 'Ljava/lang/NullPointerException;',
      'Ljava/lang/reflect/Constructor;', 'Ljava/lang/reflect/Field;',
      'Ljava/lang/reflect/Method;', 'Ljava/lang/System;', 'Ljava/lang/Thread;',
      'Ljava/lang/ThreadGroup;', 'Ljava/lang/Throwable;',
      'Ljava/lang/UnsatisfiedLinkError;', 'Ljava/nio/ByteOrder;',
      'Lsun/misc/VM;', 'Lsun/reflect/ConstantPool;', 'Ljava/lang/Byte;',
      'Ljava/lang/Character;', 'Ljava/lang/Double;', 'Ljava/lang/Float;',
      'Ljava/lang/Integer;', 'Ljava/lang/Long;', 'Ljava/lang/Short;',
      'Ljava/lang/Boolean;', '[Lsun/management/MemoryManagerImpl;',
      '[Lsun/management/MemoryPoolImpl;'
    ];
    var i = -1;
    var _this = this;
    function init_next_core_class(): void {
      trace("init_next_core_class");
      i++;
      if (i < core_classes.length) {
        trace("Initializing " + core_classes[i]);
        _this.bcl.initialize_class(_this, core_classes[i], init_next_core_class, except_cb);
      } else {
        trace("Preinitialization complete.");
        resume_cb();
      }
    };
    init_next_core_class();
  }

  public init_threads(): void {
    var _this = this;
    var my_sf = this.curr_frame();
    var thread_group_cls = <ClassData.ReferenceClassData> this.get_bs_class('Ljava/lang/ThreadGroup;');
    var thread_cls = <ClassData.ReferenceClassData> this.get_bs_class('Ljava/lang/Thread;');
    var group = new JavaObject(this, thread_group_cls);
    this.push(group);
    thread_group_cls.method_lookup(this, '<init>()V').setup_stack(this);
    my_sf.runner = function () {
      var ct : java_object.JavaThreadObject = null;
      my_sf.runner = function () {
        my_sf.runner = null;
        ct.$meta_stack = _this.meta_stack();
        _this.curr_thread = ct;
        _this.curr_thread.$isAlive = true;
        _this.thread_pool.push(_this.curr_thread);
        thread_cls.static_fields['threadInitNumber'] = 1;
        debug("### finished thread init ###");
      };
      ct = new JavaThreadObject(_this, (<ClassData.ReferenceClassData> _this.get_bs_class('Ljava/lang/Thread;')), {
        'Ljava/lang/Thread;name': _this.init_carr('main'),
        'Ljava/lang/Thread;priority': 1,
        'Ljava/lang/Thread;group': group,
        'Ljava/lang/Thread;threadLocals': null,
        'Ljava/lang/Thread;blockerLock': new JavaObject(_this,
          <ClassData.ReferenceClassData>_this.get_bs_class('Ljava/lang/Object;'))
      });
    };
  }

  public meta_stack(): CallStack {
    return this.curr_thread.$meta_stack;
  }

  public java_throw(cls: ClassData.ReferenceClassData, msg: string): void {
    var _this = this;
    var v = new JavaObject(this, cls);
    this.push_array([v, v, this.init_string(msg)]);
    var my_sf = this.curr_frame();
    cls.method_lookup(this, '<init>(Ljava/lang/String;)V').setup_stack(this);
    my_sf.runner = function () {
      if (my_sf.method.has_bytecode) {
        my_sf.runner = () => my_sf.method.run_bytecode(_this);
      } else {
        my_sf.runner = null;
      }
      throw new JavaException(<java_object.JavaObject>_this.pop());
    };
    throw ReturnException;
  }

  public init_system_class(): void {
    var _this = this;
    var my_sf = this.curr_frame();
    this.get_bs_class('Ljava/lang/System;').get_method('initializeSystemClass()V').setup_stack(this);
    my_sf.runner = function () {
      my_sf.runner = null;
      _this.system_initialized = true;
      debug("### finished system class initialization ###");
    };
  }

  public init_args(initial_args: any[]): void {
    var _this = this;
    var str_arr_cls = <ClassData.ArrayClassData> this.get_bs_class('[Ljava/lang/String;');
    var args = new JavaArray(this, str_arr_cls, initial_args.map((a) => _this.init_string(a)));
    this.curr_thread.$meta_stack = new CallStack([args]);
    debug("### finished runtime state initialization ###");
  }

  public dump_state(snapshot?: { serialize: () => StackFrameSnapshot[]; }, suffix?: string): void {
    if (snapshot == null) {
      snapshot = this.meta_stack().snap();
    }
    suffix = suffix != null ? "-" + suffix : '';
    var fs;
    if (typeof node !== "undefined" && node !== null && node.fs != null) {
      fs = node.fs;
    } else {
      fs = require('fs');
    }
    var filename = "./core-" + thread_name(this, this.curr_thread) + suffix + ".json";
    // 4th parameter to writeFileSync ensures this is not stored in localStorage in the browser
    fs.writeFileSync(filename, JSON.stringify(snapshot.serialize()), 'utf8', true);
  }

  public choose_next_thread(blacklist: java_object.JavaThreadObject[], cb: (jto: java_object.JavaThreadObject)=>void): void {
    var _this = this;
    if (blacklist == null) {
      blacklist = [];
      for (var key in this.waiting_threads) {
        blacklist.push.apply(blacklist, this.waiting_threads[key]);
      }
    }
    var wakeup_time = this.curr_thread.wakeup_time;
    if (wakeup_time == null) {
      wakeup_time = Infinity;
    }
    var current_time = (new Date).getTime();
    var eligible_threads = this.thread_pool.filter((t) => t !== this.curr_thread && t.$isAlive);
    for (var i = 0; i < eligible_threads.length; i++) {
      var t = eligible_threads[i];
      if (this.parked(t)) {
        if (t.$park_timeout > current_time) {
          continue;
        }
        this.unpark(t);
      }
      if (blacklist.indexOf(t) >= 0) {
        continue;
      }
      if (t.wakeup_time > current_time) {
        if (t.wakeup_time < wakeup_time) {
          wakeup_time = t.wakeup_time;
        }
        continue;
      }
      debug("TE(choose_next_thread): choosing thread " + thread_name(this, t));
      return cb(t);
    }
    if ((Infinity > wakeup_time && wakeup_time > current_time)) {
      debug("TE(choose_next_thread): waiting until " + wakeup_time + " and trying again");
      setTimeout((() => _this.choose_next_thread(null, cb)), wakeup_time - current_time);
    } else {
      debug("TE(choose_next_thread): no thread found, sticking with curr_thread");
      cb(this.curr_thread);
    }
  }

  public wait(monitor: java_object.JavaObject, yieldee?: java_object.JavaThreadObject): void {
    debug("TE(wait): waiting " + (thread_name(this, this.curr_thread)) + " on lock " + monitor.ref);
    if (this.waiting_threads[monitor.ref] != null) {
      this.waiting_threads[monitor.ref].push(this.curr_thread);
    } else {
      this.waiting_threads[monitor.ref] = [this.curr_thread];
    }
    if (yieldee != null) {
      return this.yield(yieldee);
    }
    var _this = this;
    this.choose_next_thread(this.waiting_threads[monitor.ref], (nt) => _this.yield(nt));
  }

  public yield(yieldee: java_object.JavaThreadObject): void {
    var _this = this;
    debug("TE(yield): yielding " + (thread_name(this, this.curr_thread)) + " to " + (thread_name(this, yieldee)));
    var old_thread_sf = this.curr_frame();
    this.curr_thread = yieldee;
    var new_thread_sf = this.curr_frame();
    new_thread_sf.runner = (() => _this.meta_stack().pop());
    old_thread_sf.runner = (() => _this.meta_stack().pop());
  }

  public park(thread: java_object.JavaThreadObject, timeout: number): void {
    var _this = this;
    thread.$park_count++;
    thread.$park_timeout = timeout;
    debug("TE(park): parking " + (thread_name(this, thread)) + " (count: " + thread.$park_count + ", timeout: " + thread.$park_timeout + ")");
    if (this.parked(thread)) {
      this.choose_next_thread(null, (nt) => _this.yield(nt));
    }
  }

  public unpark(thread: java_object.JavaThreadObject): void {
    debug("TE(unpark): unparking " + (thread_name(this, thread)));
    thread.$park_count--;
    thread.$park_timeout = Infinity;
    if (!this.parked(thread)) {
      this.yield(thread);
    }
  }

  public parked(thread: java_object.JavaThreadObject): boolean {
    return thread.$park_count > 0;
  }

  public curr_frame(): StackFrame {
    return this.meta_stack().curr_frame();
  }

  public cl(idx: number): any {
    return this.curr_frame().locals[idx];
  }

  public put_cl(idx: number, val: any): void {
    this.curr_frame().locals[idx] = val;
  }

  public put_cl2(idx: number, val: any): void {
    this.put_cl(idx, val);
    (typeof UNSAFE !== "undefined" && UNSAFE !== null) || this.put_cl(idx + 1, null);
  }

  public push(arg: any): number {
    return this.curr_frame().stack.push(arg);
  }

  public push2(arg1: any, arg2: any): number {
    return this.curr_frame().stack.push(arg1, arg2);
  }

  public push_array(args: any[]): void {
    var cs = this.curr_frame().stack;
    Array.prototype.push.apply(cs, args);
  }

  public pop(): any {
    return this.curr_frame().stack.pop();
  }

  public pop2(): any {
    this.pop();
    return this.pop();
  }

  public peek(depth?: number): any {
    if (depth == null) {
      depth = 0;
    }
    var s = this.curr_frame().stack;
    return s[s.length - 1 - depth];
  }

  public curr_pc(): number {
    return this.curr_frame().pc;
  }

  public goto_pc(pc: number): number {
    return this.curr_frame().pc = pc;
  }

  public inc_pc(n: number): number {
    return this.curr_frame().pc += n;
  }

  public check_null<T>(obj: T): T {
    if (obj == null) {
      var err_cls = <ClassData.ReferenceClassData> this.get_bs_class('Ljava/lang/NullPointerException;');
      this.java_throw(err_cls, '');
    }
    return obj;
  }

  public heap_newarray(type: string, len: number): java_object.JavaArray {
    if (len < 0) {
      var err_cls = <ClassData.ReferenceClassData> this.get_bs_class('Ljava/lang/NegativeArraySizeException;');
      this.java_throw(err_cls, "Tried to init [" + type + " array with length " + len);
    }
    var arr_cls = <ClassData.ArrayClassData> this.get_class("[" + type);
    if (type === 'J') {
      return new JavaArray(this, arr_cls, util.arrayset<gLong>(len, gLong.ZERO));
    } else if (type[0] === 'L' || type[0] === '[') {
      return new JavaArray(this, arr_cls, util.arrayset<any>(len, null));
    } else {
      return new JavaArray(this, arr_cls, util.arrayset<number>(len, 0));
    }
  }

  // The innermost component class is already initialized.
  public heap_multinewarray(type: string, counts: number[]): java_object.JavaArray {
    var _this = this;
    var dim = counts.length;
    var init_arr = function(curr_dim: number, type: string): java_object.JavaArray {
      var len = counts[curr_dim];
      if (len < 0) {
        var err_cls = <ClassData.ReferenceClassData> _this.get_bs_class('Ljava/lang/NegativeArraySizeException;');
        _this.java_throw(err_cls, "Tried to init dimension " + curr_dim + " of a " + dim + " dimensional " + type + " array with length " + len);
      }
      // Gives the JS engine a size hint.
      var array = new Array(len);
      if (curr_dim + 1 === dim) {
        var default_val = util.initial_value(type);
        for (var i = 0; i < len; i++) {
          array[i] = default_val;
        }
      } else {
        var next_dim = curr_dim + 1;
        var comp_type = type.slice(1);
        for (var i = 0; i < len; i++) {
          array[i] = init_arr(next_dim, comp_type);
        }
      }
      var arr_cls = <ClassData.ArrayClassData> _this.get_bs_class(type);
      return new JavaArray(_this, arr_cls, array);
    };
    return init_arr(0, type);
  }

  public init_string(str: string, intern?: boolean): java_object.JavaObject {
    if (intern == null) {
      intern = false;
    }
    var s = this.string_pool.get(str);
    if (intern && s != null) {
      return s;
    }
    var carr = this.init_carr(str);
    var str_cls = <ClassData.ReferenceClassData> this.get_bs_class('Ljava/lang/String;');
    var jvm_str = new JavaObject(this, str_cls, {
      'Ljava/lang/String;value': carr,
      'Ljava/lang/String;count': str.length
    });
    if (intern) {
      this.string_pool.set(str, jvm_str);
    }
    return jvm_str;
  }

  public init_carr(str: string): java_object.JavaArray {
    var carr = new Array(str.length);
    for (var i  = 0; i < str.length; i++) {
      carr[i] = str.charCodeAt(i);
    }
    var arr_cls = <ClassData.ArrayClassData> this.get_bs_class('[C');
    return new JavaArray(this, arr_cls, carr);
  }

  public block_addr(l_address: gLong): number {
    var address = l_address.toNumber();
    if (typeof DataView !== "undefined" && DataView !== null) {
      var block_addr_ = this.mem_start_addrs[0];
      for (var i = 1; i < this.mem_start_addrs.length; i++) {
        var addr = this.mem_start_addrs[i];
        if (address < addr) {
          return block_addr_;
        }
        block_addr_ = addr;
      }
      if (typeof UNSAFE !== "undefined" && UNSAFE !== null) {
        throw new Error("Invalid memory access at " + address);
      }
    } else {
      if (this.mem_blocks[address] != null) {
        return address;
      }
    }
  }

  public handle_toplevel_exception(e: any, no_threads: boolean, done_cb: (p:boolean)=>void): void {
    var _this = this;
    this.unusual_termination = true;
    if (e.toplevel_catch_handler != null) {
      this.run_until_finished(() => e.toplevel_catch_handler(_this), no_threads, done_cb);
    } else {
      error("\nInternal JVM Error:", e);
      if ((e != null ? e.stack : void 0) != null) {
        error(e.stack);
      }
      done_cb(false);
    }
  }

  public async_op<T>(cb: (resume_cb: (arg1?:T, arg2?:any, isBytecode?:boolean, advancePc?:boolean)=>void, except_cb: (e_fcn: ()=>void, discardStackFrame?:boolean)=>void)=>void): void {
    throw new YieldIOException(cb);
  }

  public call_bytecode(cls: ClassData.ReferenceClassData, method: methods.Method,
      args: any[], success_cb: any, except_cb: any) {
    var _this = this;
    var good_cb = function(ret1: any, ret2: any) {
      return _this.async_op(function(good) {
        return good(ret1, ret2);
      });
    };
    var bad_cb = function(e_fn: ()=>void) {
      return _this.async_op(function(good, bad) {
        return bad(e_fn);
      });
    };
    return this.async_op(function() {
      var is_constructor = false;
      if (method.name.charAt(0) === '<' && method.name.charAt(1) === 'i') {
        var v = new JavaObject(_this, cls);
        args.unshift(v, v);
        is_constructor = true;
      }
      var nf = StackFrame.native_frame("$bytecode_call", (function() {
        if (method.return_type !== 'V' || is_constructor) {
          if (method.return_type === 'J' || method.return_type === 'D') {
            _this.pop();
          }
          var rv = _this.pop();
        }
        _this.meta_stack().pop();
        return success_cb(rv, good_cb, bad_cb);
      }), (function(e) {
        _this.meta_stack().pop();
        return except_cb((function() {
          throw e;
        }), good_cb, bad_cb);
      }));
      _this.meta_stack().push(nf);
      _this.push_array(args);
      method.setup_stack(_this);
      return _this.run_until_finished((function() {}), false, _this.stashed_done_cb);
    });
  }

  public run_until_finished(setup_fn: ()=>void, no_threads: boolean, done_cb: (boolean)=>void): void {
    var _this = this;
    var stack : CallStack;
    function nop() {}

    setImmediate((function () {
      _this.stashed_done_cb = done_cb;
      try {
        setup_fn();
        var start_time = (new Date()).getTime();
        var m_count = _this.max_m_count;
        var sf = _this.curr_frame();
        while ((sf.runner != null) && m_count > 0) {
          sf.runner();
          m_count--;
          sf = _this.curr_frame();
        }
        if ((sf.runner != null) && m_count === 0) {
          var duration = (new Date()).getTime() - start_time;
          if (duration > 2000 || duration < 1000) {
            var ms_per_m = duration / _this.max_m_count;
            _this.max_m_count = (1000 / ms_per_m) | 0;
          }
          return _this.run_until_finished(nop, no_threads, done_cb);
        }
        if (no_threads || _this.thread_pool.length <= 1) {
          return done_cb(true);
        }
        debug("TE(toplevel): finished thread " + (thread_name(_this, _this.curr_thread)));
        _this.curr_thread.$isAlive = false;
        _this.thread_pool.splice(_this.thread_pool.indexOf(_this.curr_thread), 1);
        return _this.choose_next_thread(null, function (next_thread) {
          _this.curr_thread = next_thread;
          _this.run_until_finished(nop, no_threads, done_cb);
        });
      } catch (_error) {
        var e = _error;
        if (e === ReturnException) {
          _this.run_until_finished(nop, no_threads, done_cb);
        } else if (e instanceof YieldIOException) {
          var success_fn = function(ret1: any, ret2: any, bytecode?:boolean, advance_pc?:boolean) {
            if (advance_pc == null) {
              advance_pc = true;
            }
            if (bytecode) {
              _this.meta_stack().push(StackFrame.native_frame("async_op"));
            }
            _this.curr_frame().runner = function () {
              _this.meta_stack().pop();
              if (bytecode && advance_pc) {
                _this.curr_frame().pc += 1 + _this.curr_frame().method.code.opcodes[_this.curr_frame().pc].byte_count;
              }
              if (ret1 !== void 0) {
                if (typeof ret1 === 'boolean') {
                  ret1 += 0;
                }
                _this.push(ret1);
              }
              if (ret2 !== void 0) {
                return _this.push(ret2);
              }
            };
            return _this.run_until_finished(nop, no_threads, done_cb);
          };
          var failure_fn = function(e_cb) {
            _this.meta_stack().push(StackFrame.native_frame("async_op"));
            _this.curr_frame().runner = function () {
              _this.meta_stack().pop();
              e_cb();
            };
            return _this.run_until_finished(nop, no_threads, done_cb);
          };
          e.condition(success_fn, failure_fn);
        } else {
          stack = _this.meta_stack();
          if ((e.method_catch_handler != null) && stack.length() > 1) {
            var frames_to_pop = 0;
            while (!e.method_catch_handler(_this, stack.get_caller(frames_to_pop), frames_to_pop === 0)) {
              if (stack.length() === ++frames_to_pop) {
                if (JVM.dump_state) {
                  _this.dump_state();
                }
                stack.pop_n(stack.length() - 1);
                _this.handle_toplevel_exception(e, no_threads, done_cb);
                return;
              }
            }
            stack.pop_n(frames_to_pop);
            _this.run_until_finished(nop, no_threads, done_cb);
          } else {
            if (JVM.dump_state) {
              _this.dump_state();
            }
            stack.pop_n(Math.max(stack.length() - 1, 0));
            _this.handle_toplevel_exception(e, no_threads, done_cb);
          }
        }
      }
    }));
  }

  public async_input(n_bytes: number, resume: (string)=>void): void {
    if (this.input_buffer.length > 0) {
      var data = this.input_buffer.slice(0, n_bytes);
      this.input_buffer = this.input_buffer.slice(n_bytes);
      resume(data);
      return;
    }
    var _this = this;
    this._async_input(function (data) {
      if (data.length > n_bytes) {
        _this.input_buffer = data.slice(n_bytes);
      }
      resume(data.slice(0, n_bytes));
    });
  }
}
