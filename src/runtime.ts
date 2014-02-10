"use strict";
import gLong = require('./gLong');
import util = require('./util');
import logging = require('./logging');
import exceptions = require('./exceptions');
import java_object = require('./java_object');
import JVM = require('./jvm');
import methods = require('./methods');
import ClassData = require('./ClassData');
import ClassLoader = require('./ClassLoader');
import threading = require('./threading');

declare var UNSAFE : boolean;
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

var run_count = 0;
// Contains all the mutable state of the Java program.
export class RuntimeState {
  private startup_time: gLong;
  public run_stamp: number;
  private mem_start_addrs: number[];
  public mem_blocks: any;
  public high_oref: number;
  private string_pool: util.SafeMap;
  // map from monitor -> thread object
  public lock_refs: {[lock_id:number]: threading.JavaThreadObject};
  // map from monitor -> count
  public lock_counts: {[lock_id:number]: number};
  // map from monitor -> list of waiting thread objects
  public waiting_threads: {[lock_id:number]: threading.JavaThreadObject[]};
  private thread_pool: threading.JavaThreadObject[];
  public curr_thread: threading.JavaThreadObject;
  private max_m_count: number;
  public unusual_termination: boolean;
  public stashed_done_cb: (p:any) => any;
  public should_return: boolean;
  public system_initialized: boolean;
  public jvm_state: JVM;
  private abort_cb: Function;

  constructor(jvm_state: JVM) {
    this.jvm_state = jvm_state;
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

    var ct = new threading.JavaThreadObject(this, null);
    this.curr_thread = ct;
    this.max_m_count = 100000;
  }

  public get_bs_cl(): ClassLoader.BootstrapClassLoader {
    return this.jvm_state.bs_cl;
  }

  // Get an *initialized* class from the bootstrap classloader.
  public get_bs_class(type: string, handle_null?: boolean): ClassData.ClassData {
    if (handle_null == null) {
      handle_null = false;
    }
    return this.jvm_state.bs_cl.get_initialized_class(type, handle_null);
  }

  // Get an *initialized* class from the classloader of the current class.
  public get_class(type: string, handle_null?: boolean): ClassData.ClassData {
    if (handle_null == null) {
      handle_null = false;
    }
    return this.curr_frame().method.cls.loader.get_initialized_class(type, handle_null);
  }

  public get_cl(): ClassLoader.ClassLoader {
    return this.curr_frame().method.cls.loader;
  }

  // XXX: This method avoids a circular dependency between java_object and ClassLoader.
  public construct_cl(jclo: java_object.JavaClassLoaderObject): ClassLoader.ClassLoader {
    return new ClassLoader.CustomClassLoader(this.get_bs_cl(), jclo);
  }

  // XXX: We currently 'preinitialize' all of these to avoid an async call
  // in the middle of JVM execution. We should attempt to prune this down as
  // much as possible.
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
    var _this = this;
    util.async_foreach(core_classes, function(cls: string, next_item: ()=>void) {
        trace("Initializing " + cls);
        _this.jvm_state.bs_cl.initialize_class(_this, cls, next_item, except_cb);
      }, resume_cb);
  }

  public init_threads(): void {
    // initialize thread objects
    var _this = this;
    var my_sf = this.curr_frame();
    var thread_group_cls = <ClassData.ReferenceClassData> this.get_bs_class('Ljava/lang/ThreadGroup;');
    var thread_cls = <ClassData.ReferenceClassData> this.get_bs_class('Ljava/lang/Thread;');
    var group = new JavaObject(this, thread_group_cls);
    this.push(group);
    thread_group_cls.method_lookup(this, '<init>()V').setup_stack(this);
    my_sf.runner = function () {
      var ct : threading.JavaThreadObject = null;
      my_sf.runner = function () {
        my_sf.runner = null;
        ct.$meta_stack = _this.meta_stack();
        _this.curr_thread = ct;
        _this.curr_thread.$isAlive = true;
        _this.thread_pool.push(_this.curr_thread);
        // hack to make auto-named threads match native Java
        thread_cls.static_fields['threadInitNumber'] = 1;
        debug("### finished thread init ###");
      };
      ct = new threading.JavaThreadObject(_this, (<ClassData.ReferenceClassData> _this.get_bs_class('Ljava/lang/Thread;')), {
        'Ljava/lang/Thread;name': _this.init_carr('main'),
        'Ljava/lang/Thread;priority': 1,
        'Ljava/lang/Thread;group': group,
        'Ljava/lang/Thread;threadLocals': null,
        'Ljava/lang/Thread;blockerLock': new JavaObject(_this,
          <ClassData.ReferenceClassData>_this.get_bs_class('Ljava/lang/Object;'))
      });
    };
  }

  public meta_stack(): threading.CallStack {
    return this.curr_thread.$meta_stack;
  }

  // Simulate the throwing of a Java exception with message :msg. Not very DRY --
  // code here is essentially copied from the opcodes themselves -- but
  // constructing the opcodes manually is inelegant too.
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
    this.curr_thread.$meta_stack = new threading.CallStack([args]);
    debug("### finished runtime state initialization ###");
  }

  public choose_next_thread(blacklist: threading.JavaThreadObject[], cb: (jto: threading.JavaThreadObject)=>void): void {
    var self = this;
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
      debug("TE(choose_next_thread): choosing thread " + t.name(this));
      return cb(t);
    }
    if ((Infinity > wakeup_time && wakeup_time > current_time)) {
      debug("TE(choose_next_thread): waiting until " + wakeup_time + " and trying again");
      setTimeout((() => self.choose_next_thread(null, cb)), wakeup_time - current_time);
    } else {
      debug("TE(choose_next_thread): no thread found, sticking with curr_thread");
      cb(this.curr_thread);
    }
  }

  public wait(monitor: java_object.JavaObject, yieldee?: threading.JavaThreadObject): void {
    debug("TE(wait): waiting " + this.curr_thread.name(this) + " on lock " + monitor.ref);
    // add current thread to wait queue
    if (this.waiting_threads[monitor.ref] != null) {
      this.waiting_threads[monitor.ref].push(this.curr_thread);
    } else {
      this.waiting_threads[monitor.ref] = [this.curr_thread];
    }
    if (yieldee != null) {
      // yield execution to a non-waiting thread
      return this.yield(yieldee);
    }
    var _this = this;
    this.choose_next_thread(this.waiting_threads[monitor.ref], (nt) => _this.yield(nt));
  }

  public yield(yieldee: threading.JavaThreadObject): void {
    var _this = this;
    debug("TE(yield): yielding " + this.curr_thread.name(this) + " to " + yieldee.name(this));
    var old_thread_sf = this.curr_frame();
    this.curr_thread = yieldee;
    var new_thread_sf = this.curr_frame();
    new_thread_sf.runner = (() => _this.meta_stack().pop());
    old_thread_sf.runner = (() => _this.meta_stack().pop());
    // Note that we don't throw a ReturnException here, so callers need to
    // yield the JVM execution themselves.
  }

  public park(thread: threading.JavaThreadObject, timeout: number): void {
    var _this = this;
    thread.$park_count++;
    thread.$park_timeout = timeout;
    debug("TE(park): parking " + thread.name(this) + " (count: " + thread.$park_count + ", timeout: " + thread.$park_timeout + ")");
    if (this.parked(thread)) {
      // Only choose a new thread if this one will become blocked
      this.choose_next_thread(null, (nt) => _this.yield(nt));
    }
  }

  public unpark(thread: threading.JavaThreadObject): void {
    debug("TE(unpark): unparking " + thread.name(this));
    thread.$park_count--;
    thread.$park_timeout = Infinity;
    if (!this.parked(thread)) {
      // Yield to the unparked thread if it should be unblocked
      this.yield(thread);
    }
  }

  public parked(thread: threading.JavaThreadObject): boolean {
    return thread.$park_count > 0;
  }

  public abort(cb: Function): void {
    this.abort_cb = cb;
  }

  public curr_frame(): threading.StackFrame {
    return this.meta_stack().curr_frame();
  }

  public cl(idx: number): any {
    return this.curr_frame().locals[idx];
  }

  public put_cl(idx: number, val: any): void {
    this.curr_frame().locals[idx] = val;
  }

  // Category 2 values (longs, doubles) take two slots in Java. Since we only
  // need one slot to represent a double in JS, we pad it with a null.
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

  // For category 2 values.
  public pop2(): any {
    this.pop();
    return this.pop();
  }

  // for those cases where we want to avoid the pop/repush combo
  public peek(depth?: number): any {
    if (depth == null) {
      depth = 0;
    }
    var s = this.curr_frame().stack;
    return s[s.length - 1 - depth];
  }

  // Program counter manipulation.
  public curr_pc(): number {
    return this.curr_frame().pc;
  }

  public goto_pc(pc: number): number {
    return this.curr_frame().pc = pc;
  }

  public inc_pc(n: number): number {
    return this.curr_frame().pc += n;
  }

  // Heap manipulation.
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
    // Gives the JavaScript engine a size hint.
    if (type === 'J') {
      return new JavaArray(this, arr_cls, util.arrayset<gLong>(len, gLong.ZERO));
    } else if (type[0] === 'L' || type[0] === '[') { // array of objects or other arrays
      return new JavaArray(this, arr_cls, util.arrayset<any>(len, null));
    } else { // numeric array
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

  // heap object initialization
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

  // address of the block that this address is contained in
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
      // w/o typed arrays, we just address by 32bits.
      // We initialize memory to 0, so it should not be 0 or undefined.
      if (this.mem_blocks[address] != null) {
        return address;
      }
    }
  }

  public handle_toplevel_exception(e: any, no_threads: boolean, done_cb: (p:boolean)=>void): void {
    var _this = this;
    this.unusual_termination = true; // Used for exit codes in console frontend.
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

  // Pauses the JVM for an asynchronous operation. The callback, cb, will be
  // called with another callback that it is responsible for calling with any
  // return values when it is time to resume the JVM.
  public async_op<T>(cb: (resume_cb: (arg1?:T, arg2?:any, isBytecode?:boolean, advancePc?:boolean)=>void, except_cb: (e_fcn: ()=>void, discardStackFrame?:boolean)=>void)=>void): void {
    throw new YieldIOException(cb);
  }

  // Asynchronously calls the bytecode method with the given arguments and passes
  // the return result to the callback, or passes a function that throws an
  // exception to the other callback.
  // Please only call this from a native method.
  //
  // 'cls': An *initialized* ClassData object.
  // 'method': The method object.
  // 'args': Array of arguments to the method. If this is a method on an object,
  //         the first argument should be the object.
  //         NOTE: If one of these arguments is a double or a long, you
  //               *must* correctly include a second 'null'!
  // If this is a constructor, we will automatic
  public call_bytecode(cls: ClassData.ReferenceClassData, method: methods.Method,
      args: any[], success_cb: any, except_cb: any) {
    var _this = this;
    // This is all very complicated. When this method calls your
    // callback, we're in the main loop. We need to give you a
    // function that allows you to put your return value back onto
    // the stack. In order to do this, I async_op you one more time
    // so you can put your return value on the stack and resume again.
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
      // Is this a constructor? <init>
      var is_constructor = false;
      if (method.name.charAt(0) === '<' && method.name.charAt(1) === 'i') {
        var v = new JavaObject(_this, cls);
        args.unshift(v, v);
        is_constructor = true;
      }
      // Set up a native frame with the callbacks.
      var nf = threading.StackFrame.native_frame("$bytecode_call", (function() {
        // What kind of method is it? Do we pop 0, 1, or 2?
        if (method.return_type !== 'V' || is_constructor) {
          if (method.return_type === 'J' || method.return_type === 'D') {
            _this.pop(); // null
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
      // Add the arguments to the stack.
      _this.push_array(args);
      // Setup dat stack frame
      method.setup_stack(_this);
      // Push ourselves back into the execution loop
      // to call the method!
      return _this.run_until_finished((function() {}), false, _this.stashed_done_cb);
    });
  }

  public run_until_finished(setup_fn: ()=>void, no_threads: boolean, done_cb: (boolean)=>void): void {
    var _this = this;
    var stack : threading.CallStack;
    function nop() {}

    // Reset stack depth every time this is called. Prevents us from needing to
    // scatter this around the code everywhere to prevent filling the stack
    setImmediate((function () {
      // Check if the user has requested that the JVM abort.
      if (_this.abort_cb) {
        _this.abort_cb();
        return done_cb(false);
      }

      _this.stashed_done_cb = done_cb; // hack for the case where we error out of <clinit>
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
          // Check if the user has requested that the JVM abort.
          if (_this.abort_cb) {
            _this.abort_cb();
            return done_cb(false);
          }
          // Loop has stopped to give the browser some breathing room.
          var duration = (new Date()).getTime() - start_time;
          // We should yield once every 1-2 seconds or so.
          if (duration > 2000 || duration < 1000) {
            // Figure out what to adjust max_m_count by.
            var ms_per_m = duration / _this.max_m_count;
            _this.max_m_count = (1000 / ms_per_m) | 0;
          }
          // Call ourselves to yield and resume.
          return _this.run_until_finished(nop, no_threads, done_cb);
        }
        // we've finished this thread, no more runners
        // we're done if the only thread is "main"
        if (no_threads || _this.thread_pool.length <= 1) {
          return done_cb(true);
        }
        // remove the current (finished) thread
        debug("TE(toplevel): finished thread " + _this.curr_thread.name(_this));
        _this.curr_thread.$isAlive = false;
        _this.thread_pool.splice(_this.thread_pool.indexOf(_this.curr_thread), 1);
        return _this.choose_next_thread(null, function (next_thread) {
          _this.curr_thread = next_thread;
          _this.run_until_finished(nop, no_threads, done_cb);
        });
      } catch (_error) {
        var e = _error;
        // XXX: We should remove this and have a better mechanism for 'returning'.
        if (e === ReturnException) {
          _this.run_until_finished(nop, no_threads, done_cb);
        } else if (e instanceof YieldIOException) {
          // Set "bytecode" if this was triggered by a bytecode instruction (e.g.
          // class initialization). This causes the method to resume on the next
          // opcode once success_fn is called.
          var success_fn = function(ret1: any, ret2: any, bytecode?:boolean, advance_pc?:boolean) {
            if (advance_pc == null) {
              advance_pc = true;
            }
            if (bytecode) {
              _this.meta_stack().push(threading.StackFrame.native_frame("async_op"));
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
            _this.meta_stack().push(threading.StackFrame.native_frame("async_op"));
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
                _this.jvm_state.dump_state();
                stack.pop_n(stack.length() - 1);
                _this.handle_toplevel_exception(e, no_threads, done_cb);
                return;
              }
            }
            stack.pop_n(frames_to_pop);
            _this.run_until_finished(nop, no_threads, done_cb);
          } else {
            _this.jvm_state.dump_state();
            stack.pop_n(Math.max(stack.length() - 1, 0));
            _this.handle_toplevel_exception(e, no_threads, done_cb);
          }
        }
      }
    }));
  }

  /**
   * Provide buffering for the underlying input function, returning at most
   * n_bytes of data.
   * @todo Relocate. This doesn't need to be in RuntimeState anymore, and
   *       should be in 'natives'.
   */
  public async_input(n_bytes: number, resume: (NodeBuffer) => void): void {
    // Try to read n_bytes from stdin's buffer.
    var read = function(n_bytes: number): NodeBuffer {
        var bytes = process.stdin.read(n_bytes);
        if (bytes === null) {
          // We might have asked for too many bytes. Retrieve the entire stream
          // buffer.
          bytes = process.stdin.read();
        }
        // \0 => EOF.
        if (bytes !== null && bytes.length === 1 && bytes.readUInt8(0) === 0) {
          bytes = new Buffer(0);
        }
        return bytes;
      }, bytes: NodeBuffer = read(n_bytes);

    if (bytes === null) {
      // No input available. Wait for further input.
      process.stdin.once('readable', function(data: NodeBuffer) {
        var bytes = read(n_bytes);
        if (bytes === null) {
          bytes = new Buffer(0);
        }
        resume(bytes);
      });
    } else {
      // Reset stack depth and resume with the given data.
      setImmediate(function() { resume(bytes); });
    }
  }
}
