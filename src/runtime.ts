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
  public startup_time: gLong;
  public run_stamp: number;
  public mem_start_addrs: number[];
  public mem_blocks: any;
  public high_oref: number;
  public string_pool: util.SafeMap;
  // map from monitor -> thread object
  public lock_refs: {[lock_id:number]: threading.JavaThreadObject};
  // map from monitor -> count
  public lock_counts: {[lock_id:number]: number};
  // map from monitor -> list of waiting thread objects
  public waiting_threads: {[lock_id:number]: threading.JavaThreadObject[]};
  public thread_pool: threading.JavaThreadObject[];
  public curr_thread: threading.JavaThreadObject;
  private max_m_count: number;
  public unusual_termination: boolean;
  public stashed_done_cb: (p:any) => any;
  public should_return: boolean;
  public system_initialized: boolean;
  public jvm_state: JVM;
  private abort_cb: Function;
  private natives: { [clsName: string]: { [methSig: string]: Function } } = {};

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

  /**
   * XXX: Hack to evaluate native modules in an environment with
   * java_object and ClassData defined.
   */
  public evalNativeModule(mod: string): any {
    "use strict";
    // Terrible hack.
    mod = mod.replace(/require\((\'|\")..\/(.*)(\'|\")\);/g, 'require($1./$2$1);');
    return eval(mod);
  }

  /**
   * Register native methods with the virtual machine.
   */
  public registerNatives(newNatives: { [clsName: string]: { [methSig: string]: Function } }): void {
    var clsName: string, methSig: string;
    for (clsName in newNatives) {
      if (newNatives.hasOwnProperty(clsName)) {
        if (!this.natives.hasOwnProperty(clsName)) {
          this.natives[clsName] = {};
        }
        var clsMethods = newNatives[clsName];
        for (methSig in clsMethods) {
          if (clsMethods.hasOwnProperty(methSig)) {
            // Don't check if it exists already. This allows us to overwrite
            // native methods dynamically at runtime.
            this.natives[clsName][methSig] = clsMethods[methSig];
          }
        }
      }
    }
  }

  /**
   * Convenience function. Register a single native method with the virtual
   * machine. Can be used to update existing native methods based on runtime
   * information.
   */
  public registerNative(clsName: string, methSig: string, native: Function): void {
    this.registerNatives({ clsName: { methSig: native } });
  }

  /**
   * Retrieve the native method for the given method of the given class.
   * Returns null if none found.
   */
  public getNative(clsName: string, methSig: string): Function {
    if (this.natives.hasOwnProperty(clsName)) {
      var clsMethods = this.natives[clsName];
      if (clsMethods.hasOwnProperty(methSig)) {
        return clsMethods[methSig];
      }
    }
    return null;
  }

  public abort(cb: Function): void {
    this.abort_cb = cb;
  }
}
