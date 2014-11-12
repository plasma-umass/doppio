/// <amd-dependency path="../vendor/underscore/underscore" />
"use strict";
var underscore = require('../vendor/underscore/underscore');
import gLong = require('./gLong');
import util = require('./util');
import ClassData = require('./ClassData');
import ClassLoader = require('./ClassLoader');
import enums = require('./enums');
import assert = require('./assert');
import threading = require('./threading');
import methods = require('./methods');
var ref: number = 0;

export class JavaArray {
  public cls: ClassData.ArrayClassData;
  public array: any[];
  public ref: number = ref++;

  constructor(cls: ClassData.ArrayClassData, obj: any[]) {
    this.cls = cls;
    this.array = obj;
  }

  public clone(): JavaArray {
    // note: we don't clone the type, because they're effectively immutable
    return new JavaArray(this.cls, underscore.clone(this.array));
  }

  public get_field_from_offset(thread: threading.JVMThread, offset: gLong): any {
    return this.array[offset.toInt()];
  }

  public set_field_from_offset(thread: threading.JVMThread, offset: gLong, value: any): void {
    this.array[offset.toInt()] = value;
  }

  public toString(): string {
    if (this.array.length <= 10) {
      return "<" + this.cls.get_type() + " [" + this.array + "] (*" + this.ref + ")>";
    }
    return "<" + this.cls.get_type() + " of length " + this.array.length + " (*" + this.ref + ")>";
  }

  public serialize(visited: any): any {
    if (visited[this.ref]) {
      return "<*" + this.ref + ">";
    }
    visited[this.ref] = true;
    function elem_serializer(f: any) {
      if (!f) return f;
      if (typeof f.serialize !== "function") return f;
      return f.serialize(visited);
    }
    return {
      'type': this.cls.get_type(),
      'ref': this.ref,
      'array': this.array.map(elem_serializer)
    };
  }
}

export class JavaObject {
  public cls: ClassData.ReferenceClassData;
  public fields: any;
  public ref: number = ref++;
  public $pos: number; // XXX: For file descriptors.
  public $ws: IWebsock; // XXX: For sockets.
  public $is_shutdown: boolean; // XXX: For sockets.
  private $monitor: Monitor;

  constructor(cls: ClassData.ReferenceClassData, obj: any = {}) {
    this.cls = cls;
    // Use default fields as a prototype.
    this.fields = Object.create(this.cls.get_default_fields());
    for (var field in obj) {
      if (obj.hasOwnProperty(field)) {
        this.fields[field] = obj[field];
      }
    }
  }

  public clone(): JavaObject {
    // note: we don't clone the type, because they're effectively immutable
    return new JavaObject(this.cls, underscore.clone(this.fields));
  }

  public set_field(thread: threading.JVMThread, name: string, val: any): boolean {
    if (this.fields[name] !== undefined) {
      this.fields[name] = val;
      return true;
    } else {
      thread.throwNewException('Ljava/lang/NoSuchFieldError;',
        'Cannot set field ' + name + ' on class ' + this.cls.get_type());
      return false;
    }
  }

  public get_field(thread: threading.JVMThread, name: string): any {
    if (this.fields[name] !== undefined) {
      return this.fields[name];
    }
    thread.throwNewException('Ljava/lang/NoSuchFieldError;',
      'Cannot get field ' + name + ' from class ' + this.cls.get_type());
  }

  public getMonitor(): Monitor {
    if (this.$monitor != null) {
      return this.$monitor;
    } else {
      return this.$monitor = new Monitor();
    }
  }

  public get_field_from_offset(thread: threading.JVMThread, offset: gLong): any {
    var f = this._get_field_from_offset(thread, this.cls, offset.toInt());
    if (f.field.access_flags['static']) {
      return f.cls_obj.static_get(thread, f.field.name);
    }
    return this.get_field(thread, f.cls + f.field.name);
  }

  private _get_field_from_offset(thread: threading.JVMThread, cls: ClassData.ReferenceClassData, offset: number): { field: methods.Field; cls: string; cls_obj: ClassData.ReferenceClassData }  {
    var classname = cls.get_type();
    while (cls != null) {
      var jco_ref = cls.get_class_object(thread).ref;
      var f = cls.get_fields()[offset - jco_ref];
      if (f != null) {
        return {
          field: f,
          cls: cls.get_type(),
          cls_obj: cls
        };
      }
      cls = <ClassData.ReferenceClassData> cls.get_super_class();
    }
    thread.throwNewException('Ljava/lang/NullPointerException;',
      "field " + offset + " doesn't exist in class " + classname);
  }

  public set_field_from_offset(thread: threading.JVMThread, offset: gLong, value: any): void {
    var f = this._get_field_from_offset(thread, this.cls, offset.toInt());
    if (f.field.access_flags['static']) {
      f.cls_obj.static_put(thread, f.field.name, value);
    } else {
      this.set_field(thread, f.cls + f.field.name, value);
    }
  }

  public toString(): string {
    if (this.cls.get_type() === 'Ljava/lang/String;')
      return "<" + this.cls.get_type() + " '" + (this.jvm2js_str()) + "' (*" + this.ref + ")>";
    return "<" + this.cls.get_type() + " (*" + this.ref + ")>";
  }

  public serialize(visited: any): any {
    if (this.ref in visited) {
      return "<*" + this.ref + ">";
    }
    visited[this.ref] = true;
    var fields = {};
    var _ref2 = this.fields;
    for (var k in this.fields) {
      var field = this.fields[k];
      if (field && field.serialize) {
        fields[k] = field.serialize(visited);
      } else {
        fields[k] = field;
      }
    }
    return {
      type: this.cls.get_type(),
      ref: this.ref,
      fields: fields
    };
  }

  // Convert a Java String object into an equivalent JS one.
  public jvm2js_str(): string {
    return util.chars2js_str(this.fields['Ljava/lang/String;value'], this.fields['Ljava/lang/String;offset'], this.fields['Ljava/lang/String;count']);
  }
}

export class JavaClassObject extends JavaObject {
  constructor(thread: threading.JVMThread, public $cls: ClassData.ClassData) {
    super(<ClassData.ReferenceClassData> thread.getBsCl().getResolvedClass('Ljava/lang/Class;'));
  }

  public toString() {
    return "<Class " + this.$cls.get_type() + " (*" + this.ref + ")>";
  }
}

// XXX: Temporarily moved from natives.

// Have a JavaClassLoaderObject and need its ClassLoader object? Use this method!
export function get_cl_from_jclo(thread: threading.JVMThread, jclo: ClassLoader.JavaClassLoaderObject): ClassLoader.ClassLoader {
  if ((jclo != null) && (jclo.$loader != null)) {
    return jclo.$loader;
  }
  return thread.getBsCl();
}

/**
 * "Fast" array copy; does not have to check every element for illegal
 * assignments. You can do tricks here (if possible) to copy chunks of the array
 * at a time rather than element-by-element.
 * This function *cannot* access any attribute other than 'array' on src due to
 * the special case when src == dest (see code for System.arraycopy below).
 * TODO: Potentially use ParallelArray if available.
 */
export function arraycopy_no_check(src: JavaArray, src_pos: number, dest: JavaArray, dest_pos: number, length: number): void {
  var j = dest_pos;
  var end = src_pos + length;
  for (var i = src_pos; i < end; i++) {
    dest.array[j++] = src.array[i];
  }
}

/**
 * "Slow" array copy; has to check every element for illegal assignments.
 * You cannot do any tricks here; you must copy element by element until you
 * have either copied everything, or encountered an element that cannot be
 * assigned (which causes an exception).
 * Guarantees: src and dest are two different reference types. They cannot be
 *             primitive arrays.
 */
export function arraycopy_check(thread: threading.JVMThread, src: JavaArray, src_pos: number, dest: JavaArray, dest_pos: number, length: number): void {
  var j = dest_pos;
  var end = src_pos + length;
  var dest_comp_cls = dest.cls.get_component_class();
  for (var i = src_pos; i < end; i++) {
    // Check if null or castable.
    if (src.array[i] === null || src.array[i].cls.is_castable(dest_comp_cls)) {
      dest.array[j] = src.array[i];
    } else {
      thread.throwNewException('Ljava/lang/ArrayStoreException;', 'Array element in src cannot be cast to dest array type.');
      return;
    }
    j++;
  }
}

/**
 * Partial typing for Websockify WebSockets.
 */
export interface IWebsock {
  rQlen(): number;
  rQshiftBytes(len: number): number[];
  on(eventName: string, cb: Function): void;
  open(uri: string): void;
  close(): void;
  send(data: number): void;
  send(data: number[]): void;
}

export function initString(cl: ClassLoader.ClassLoader, str: string): JavaObject {
  var carr = initCarr(cl, str);
  var str_cls = <ClassData.ReferenceClassData> cl.getInitializedClass(null, 'Ljava/lang/String;');
  return new JavaObject(str_cls, {
    'Ljava/lang/String;value': carr,
    'Ljava/lang/String;count': str.length
  });
}

export function initCarr(cl: ClassLoader.ClassLoader, str: string): JavaArray {
  var carr = new Array(str.length);
  for (var i = 0; i < str.length; i++) {
    carr[i] = str.charCodeAt(i);
  }
  var arr_cls = <ClassData.ArrayClassData> cl.getLoadedClass('[C');
  return new JavaArray(arr_cls, carr);
}

/**
 * Represents a JVM monitor.
 */
export class Monitor {
  /**
   * The owner of the monitor.
   */
  private owner: threading.JVMThread = null;
  /**
   * Number of times that the current owner has locked this monitor.
   */
  private count: number = 0;
  /**
   * JVM threads that are waiting for the current owner to relinquish the
   * monitor.
   */
  private blocked: {
    [threadRef: number]: {
      /**
       * The blocked thread.
       */
      thread: threading.JVMThread;
      /**
       * A callback that should be triggered once the thread becomes the
       * owner of the monitor.
       */
      cb: () => void;
      /**
       * The lock count to restore once the thread owns the lock.
       */
      count: number;
    }
  } = {};
  /**
   * Queue of JVM threads that are waiting for a JVM thread to notify them.
   */
  private waiting: {
    [threadRef: number]: {
      /**
       * The blocked thread.
       */
      thread: threading.JVMThread;
      /**
       * A callback that should be triggered once the thread owns the monitor.
       */
      cb: (fromTimer: boolean) => void;
      /**
       * The thread's lock count at the time it invoked Object.wait.
       */
      count: number;
      /**
       * True if the thread issued waiting with a timeout.
       */
      isTimed: boolean;
      /**
       * The timer ID for the timeout callback, if isTimed is true. Allows us
       * to revoke timeout timers before they execute.
       */
      timer?: number;
    }
  } = {};

  /**
   * Attempts to acquire the monitor.
   *
   * Thread transitions:
   * * RUNNABLE => BLOCKED [If fails to acquire lock]
   *
   * @param thread The thread that is trying to acquire the monitor.
   * @param cb If this method returns false, then this callback will be
   *   triggered once the thread becomes owner of the monitor. At that time,
   *   the thread will be in the RUNNABLE state.
   * @return True if successfull, false if not. If not successful, the thread
   *   becomes BLOCKED, and the input callback will be triggered once the
   *   thread owns the monitor and is RUNNABLE.
   */
  public enter(thread: threading.JVMThread, cb: () => void): boolean {
    if (this.owner === thread) {
      this.count++;
      return true;
    } else {
      return this.contendForLock(thread, 1, enums.ThreadStatus.BLOCKED, cb);
    }
  }

  /**
   * Generic version of Monitor.enter for contending for the lock.
   *
   * Thread transitions:
   * * RUNNABLE => UNINTERRUPTIBLY_BLOCKED [If fails to acquire lock]
   * * RUNNABLE => BLOCKED [If fails to acquire lock]
   *
   * @param thread The thread contending for the lock.
   * @param count The lock count to use once the thread owns the lock.
   * @param blockStatus The ThreadStatus to use should the thread need to
   *   contend for the lock (either BLOCKED or UNINTERRUPTIBLY_BLOCKED).
   * @param cb The callback to call once the thread becomes owner of the lock.
   * @return True if the thread immediately acquired the lock, false if the
   *   thread is now blocked on the lock.
   */
  private contendForLock(thread: threading.JVMThread, count: number, blockStatus: enums.ThreadStatus, cb: () => void): boolean {
    var owner = this.owner;
    assert(owner != thread, "Thread attempting to contend for lock it already owns!");
    if (owner === null) {
      assert(this.count === 0);
      this.owner = thread;
      this.count = count;
      return true;
    } else {
      /**
       * "If another thread already owns the monitor associated with objectref,
       *  the thread blocks until the monitor's entry count is zero, then tries
       *  again to gain ownership."
       * @from http://docs.oracle.com/javase/specs/jvms/se7/html/jvms-6.html#jvms-6.5.monitorenter
       */
      thread.setStatus(blockStatus, this);
      this.blocked[thread.ref] = { thread: thread, cb: cb, count: count };
      return false;
    }
  }

  /**
   * Exits the monitor. Handles notifying the waiting threads if the lock
   * becomes available.
   *
   * Thread transitions:
   * * *NONE* on the argument thread.
   * * A *BLOCKED* thread may be scheduled if the owner gives up the monitor.
   *
   * @param thread The thread that is exiting the monitor.
   * @return True if exit succeeded, false if an exception occurred.
   */
  public exit(thread: threading.JVMThread): boolean {
    var owner = this.owner;
    if (owner === thread) {
      if (--this.count === 0) {
        this.owner = null;
        this.appointNewOwner();
      }
    } else {
      /**
       * "If the thread that executes monitorexit is not the owner of the
       *  monitor associated with the instance referenced by objectref,
       *  monitorexit throws an IllegalMonitorStateException."
       * @from http://docs.oracle.com/javase/specs/jvms/se7/html/jvms-6.html#jvms-6.5.monitorexit
       */
      thread.throwNewException('Ljava/lang/IllegalMonitorStateException;', "Cannot exit a monitor that you do not own.");
    }
    return owner === thread;
  }

  /**
   * Chooses one of the blocked threads to become the monitor's owner.
   */
  private appointNewOwner() {
    var blockedThreadRefs = Object.keys(this.blocked);
    if (blockedThreadRefs.length > 0) {
      // Unblock a random thread.
      var unblockedRef = blockedThreadRefs[Math.floor(Math.random() * blockedThreadRefs.length)],
        // XXX: Typing hack. Key must be a number.
        unblocked = this.blocked[<number><any>unblockedRef];
      this.unblock(unblocked.thread, false);
    }
  }

  /**
   * "Causes the current thread to wait until another thread invokes the
   *  notify() method or the notifyAll() method for this object, or some other
   *  thread interrupts the current thread, or a certain amount of real time
   *  has elapsed.
   *
   *  This method causes the current thread (call it T) to place itself in the
   *  wait set for this object and then to relinquish any and all
   *  synchronization claims on this object."
   *
   * We coalesce all possible wait configurations into this one function.
   * @from http://docs.oracle.com/javase/7/docs/api/java/lang/Object.html#wait(long, int)
   * @param thread The thread that wants to wait on this monitor.
   * @param cb The callback triggered once the thread wakes up.
   * @param timeoutMs? An optional timeout that specifies how long the thread
   *   should wait, in milliseconds. If this value is 0, then we ignore it.
   * @param timeoutNs? An optional timeout that specifies how long the thread
   *   should wait, in nanosecond precision (currently ignored).
   * @todo Use high-precision timers in browsers that support it.
   * @return True if the wait succeeded, false if it triggered an exception.
   */
  public wait(thread: threading.JVMThread, cb: (fromTimer: boolean) => void, timeoutMs?: number, timeoutNs?: number): boolean {
    if (this.getOwner() === thread) {
      // INVARIANT: Thread shouldn't currently be blocked on a monitor.
      assert(thread.getStatus() !== enums.ThreadStatus.BLOCKED);
      this.waiting[thread.ref] = {
        thread: thread,
        cb: cb,
        count: this.count,
        isTimed: timeoutMs != null && timeoutMs !== 0
      };

      // Revoke ownership.
      this.owner = null;
      this.count = 0;

      if (timeoutMs != null && timeoutMs !== 0) {
        // Scheduler a timer that wakes up the thread.
        // XXX: Casting to 'number', since NodeJS typings specify a Timer.
        this.waiting[thread.ref].timer = <number><any> setTimeout(() => {
          this.unwait(thread, true);
        }, timeoutMs);
        thread.setStatus(enums.ThreadStatus.TIMED_WAITING, this);
      } else {
        thread.setStatus(enums.ThreadStatus.WAITING, this);
      }

      // Select a new owner.
      this.appointNewOwner();
      return true;
    } else {
      /**
       * "The current thread must own this object's monitor"
       */
      thread.throwNewException('Ljava/lang/IllegalMonitorStateException;', "Cannot wait on an object that you do not own.");
      return false;
    }
  }

  /**
   * Removes the specified thread from the waiting set, and makes it compete
   * for the monitor lock. Once it acquires the lock, we restore its lock
   * count prior to triggering the wait callback.
   *
   * If the thread is interrupted, the wait callback is *not* triggered.
   *
   * @param thread The thread to remove.
   * @param fromTimer Indicates if this function call was triggered from a
   *   timer event.
   * @param [interrupting] If true, then we are *interrupting* the wait. Do not
   *   trigger the wait callback.
   * @param [unwaitCb] If interrupting is true, then this callback is triggered
   *   once the thread reacquires the lock.
   */
  public unwait(thread: threading.JVMThread, fromTimer: boolean, interrupting: boolean = false, unwaitCb: () => void = null): void {
    // Step 1: Remove the thread from the waiting set.
    var waitEntry = this.waiting[thread.ref],
      // Interrupting a previously-waiting thread before it acquires a lock
      // makes no semantic sense, as the thread is currently suspended in a
      // synchronized block that requires ownership of the monitor.
      blockStatus = enums.ThreadStatus.UNINTERRUPTABLY_BLOCKED,
      blockCb = () => {
        // Thread is RUNNABLE before we trigger the callback.
        thread.setStatus(enums.ThreadStatus.RUNNABLE);
        if (interrupting) {
          unwaitCb();
        } else {
          waitEntry.cb(fromTimer);
        }
      };
    assert(waitEntry != null);
    delete this.waiting[thread.ref];
    // Step 2: Remove the timer if the timer did not trigger this event.
    if (thread.getStatus() === enums.ThreadStatus.TIMED_WAITING && !fromTimer) {
      var timerId = waitEntry.timer;
      assert(timerId != null);
      clearTimeout(timerId);
    }

    // Step 3: Acquire the monitor [ASYNC]
    if (this.contendForLock(thread, waitEntry.count, blockStatus, blockCb)) {
      // Success! Trigger the blockCb anyway. If 'contendForLock' returns false,
      // it will trigger blockCb once the thread acquires the lock.
      blockCb();
    }
  }

  /**
   * Removes the specified thread from being blocked on the monitor so it can
   * re-compete for ownership.
   * @param [interrupting] If true, we are interrupting the monitor block. The
   *   thread should not acquire the lock, and the block callback should not
   *   be triggered.
   */
  public unblock(thread: threading.JVMThread, interrupting: boolean = false): void {
    var blockEntry = this.blocked[thread.ref];
    // Cannot interrupt an uninterruptibly blocked thread.
    assert(interrupting ? thread.getStatus() === enums.ThreadStatus.BLOCKED : true);
    if (blockEntry != null) {
      delete this.blocked[thread.ref];
      thread.setStatus(enums.ThreadStatus.RUNNABLE);
      if (!interrupting) {
        // No one else can own the monitor.
        assert(this.owner == null && this.count === 0, "T" + thread.ref + ": We're not interrupting a block, but someone else owns the monitor?! Owned by " + (this.owner == null ? "[no one]" : "" + this.owner.ref) + " Count: " + this.count);
        // Assign this thread as the monitor owner.
        this.owner = thread;
        this.count = blockEntry.count;
        // Trigger the callback.
        blockEntry.cb();
      }
    }
  }

  /**
   * Notifies a single waiting thread.
   * @param thread The notifying thread. *MUST* be the owner.
   */
  public notify(thread: threading.JVMThread): void {
    if (this.owner === thread) {
      var waitingRefs = Object.keys(this.waiting);
      if (waitingRefs.length > 0) {
        // Notify a random thread.
        this.unwait(this.waiting[<number><any>waitingRefs[Math.floor(Math.random() * waitingRefs.length)]].thread, false);
      }
    } else {
      /**
       * "Throws IllegalMonitorStateException if the current thread is not the
       *  owner of this object's monitor."
       * @from http://docs.oracle.com/javase/7/docs/api/java/lang/Object.html#notify()
       */
      thread.throwNewException('Ljava/lang/IllegalMonitorStateException;', "Cannot notify on a monitor that you do not own.");
    }
  }

  /**
   * Notifies all waiting threads.
   * @param thread The notifying thread. *MUST* be the owner.
   */
  public notifyAll(thread: threading.JVMThread): void {
    if (this.owner === thread) {
      var waitingRefs = Object.keys(this.waiting), i: number;
      // Notify each thread.
      for (i = 0; i < waitingRefs.length; i++) {
        this.unwait(this.waiting[<number><any>waitingRefs[i]].thread, false);
      }
    } else {
      /**
       * "Throws IllegalMonitorStateException if the current thread is not the
       *  owner of this object's monitor."
       * @from http://docs.oracle.com/javase/7/docs/api/java/lang/Object.html#notifyAll()
       */
      thread.throwNewException('Ljava/lang/IllegalMonitorStateException;', "Cannot notifyAll on a monitor that you do not own.");
    }
  }

  /**
   * @return The owner of the monitor.
   */
  public getOwner(): threading.JVMThread {
    return this.owner;
  }

  public isWaiting(thread: threading.JVMThread): boolean {
    // Waiting, but *not* timed waiting.
    return this.waiting[thread.ref] != null && !this.waiting[thread.ref].isTimed;
  }

  public isTimedWaiting(thread: threading.JVMThread): boolean {
    // Timed waiting, *not* waiting.
    return this.waiting[thread.ref] != null && this.waiting[thread.ref].isTimed;
  }

  public isBlocked(thread: threading.JVMThread): boolean {
    // Blocked.
    return this.blocked[thread.ref] != null;
  }
}

export function heapNewArray(thread: threading.JVMThread, cls: ClassData.ArrayClassData, len: number): JavaArray {
  var type: string = cls.this_class.slice(1);
  if (len < 0) {
    thread.throwNewException('Ljava/lang/NegativeArraySizeException;', "Tried to init [" + type + " array with length " + len);
  } else {
    // Gives the JavaScript engine a size hint.
    if (type === 'J') {
      return new JavaArray(cls, util.arrayset<gLong>(len, gLong.ZERO));
    } else if (type[0] === 'L' || type[0] === '[') { // array of objects or other arrays
      return new JavaArray(cls, util.arrayset<any>(len, null));
    } else { // numeric array
      return new JavaArray(cls, util.arrayset<number>(len, 0));
    }
  }
}

export function heapMultiNewArray(thread: threading.JVMThread, loader: ClassLoader.ClassLoader, type: string, counts: number[]): JavaArray {
  var dim = counts.length;
  function init_arr(curr_dim: number, type: string): JavaArray {
    var len = counts[curr_dim];
    if (len < 0) {
      thread.throwNewException('Ljava/lang/NegativeArraySizeException;', "Tried to init dimension " + curr_dim + " of a " + dim + " dimensional " + type + " array with length " + len);
    } else {
      // Gives the JS engine a size hint.
      var array = new Array(len);
      if (curr_dim + 1 === dim) {
        var default_val = util.initialValue(type);
        for (var i = 0; i < len; i++) {
          array[i] = default_val;
        }
      } else {
        var next_dim = curr_dim + 1;
        var comp_type = type.slice(1);
        for (var i = 0; i < len; i++) {
          if ((array[i] = init_arr(next_dim, comp_type)) == null) {
            // Exception occurred.
            return undefined;
          }
        }
      }
      var arr_cls = <ClassData.ArrayClassData> loader.getInitializedClass(thread, type);
      return new JavaArray(arr_cls, array);
    }
  }
  return init_arr(0, type);
}
