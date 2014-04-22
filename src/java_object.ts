/// <amd-dependency path="../vendor/underscore/underscore" />
"use strict";
var underscore = require('../vendor/underscore/underscore');
import gLong = require('./gLong');
import util = require('./util');
import logging = require('./logging');
import runtime = require('./runtime');
import ClassData = require('./ClassData');
import ClassLoader = require('./ClassLoader');
import enums = require('./enums');
import assert = require('./assert');
var ClassState = enums.ClassState;

export class JavaArray {
  public cls: ClassData.ArrayClassData
  public array: any[]
  public ref: number

  constructor(rs: runtime.RuntimeState, cls: ClassData.ArrayClassData, obj: any[]) {
    this.cls = cls;
    this.ref = rs.high_oref++;
    this.array = obj;
  }

  public clone(rs: runtime.RuntimeState): JavaArray {
    // note: we don't clone the type, because they're effectively immutable
    return new JavaArray(rs, this.cls, underscore.clone(this.array));
  }

  public get_field_from_offset(rs: runtime.RuntimeState, offset: gLong): any {
    return this.array[offset.toInt()];
  }

  public set_field_from_offset(rs: runtime.RuntimeState, offset: gLong, value: any): void {
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
  public cls: ClassData.ReferenceClassData
  public fields : any
  public ref: number
  public $pos: number // XXX: For file descriptors.
  public $ws: IWebsock; // XXX: For sockets.
  public $is_shutdown: boolean; //XXX: For sockets.
  private $monitor: Monitor;

  constructor(rs: runtime.RuntimeState, cls: ClassData.ReferenceClassData, obj?: any) {
    this.cls = cls;
    if (obj == null) {
      obj = {};
    }
    this.ref = rs.high_oref++;
    // Use default fields as a prototype.
    this.fields = Object.create(this.cls.get_default_fields());
    for (var field in obj) {
      if (obj.hasOwnProperty(field)) {
        this.fields[field] = obj[field];
      }
    }
  }

  public clone(rs: runtime.RuntimeState): JavaObject {
    // note: we don't clone the type, because they're effectively immutable
    return new JavaObject(rs, this.cls, underscore.clone(this.fields));
  }

  public set_field(rs: runtime.RuntimeState, name: string, val: any): void {
    if (this.fields[name] !== undefined) {
      this.fields[name] = val;
    } else {
      rs.java_throw(<ClassData.ReferenceClassData>
          this.cls.loader.get_initialized_class('Ljava/lang/NoSuchFieldError;'),
          'Cannot set field ' + name + ' on class ' + this.cls.get_type());
    }
  }

  public get_field(rs: runtime.RuntimeState, name: string): any {
    if (this.fields[name] !== undefined) {
      return this.fields[name];
    }
    return rs.java_throw(<ClassData.ReferenceClassData>
        this.cls.loader.get_initialized_class('Ljava/lang/NoSuchFieldError;'),
        'Cannot get field ' + name + ' from class ' + this.cls.get_type());
  }

  public getMonitor(): Monitor {
    if (this.$monitor) {
      return this.$monitor;
    } else {
      return this.$monitor = new Monitor();
    }
  }

  public get_field_from_offset(rs: runtime.RuntimeState, offset: gLong): any {
    var f = this._get_field_from_offset(rs, this.cls, offset.toInt());
    if (f.field.access_flags['static']) {
      return f.cls_obj.static_get(rs, f.field.name);
    }
    return this.get_field(rs, f.cls + f.field.name);
  }

  private _get_field_from_offset(rs: runtime.RuntimeState, cls: any, offset: number): any {
    var classname = cls.get_type();
    while (cls != null) {
      var jco_ref = cls.get_class_object(rs).ref;
      var f = cls.get_fields()[offset - jco_ref];
      if (f != null) {
        return {
          field: f,
          cls: cls.get_type(),
          cls_obj: cls
        };
      }
      cls = cls.get_super_class();
    }
    return rs.java_throw(<ClassData.ReferenceClassData>
        this.cls.loader.get_initialized_class('Ljava/lang/NullPointerException;'), "field " + offset + " doesn't exist in class " + classname);
  }

  public set_field_from_offset(rs: runtime.RuntimeState, offset: gLong, value: any): void {
    var f = this._get_field_from_offset(rs, this.cls, offset.toInt());
    if (f.field.access_flags['static']) {
      f.cls_obj.static_put(rs, f.field.name, value);
    } else {
      this.set_field(rs, f.cls + f.field.name, value);
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
  constructor(rs: runtime.RuntimeState, public $cls: ClassData.ClassData) {
    super(rs, <ClassData.ReferenceClassData> rs.get_bs_cl().get_resolved_class('Ljava/lang/Class;'));
  }

  public toString() {
    return "<Class " + this.$cls.get_type() + " (*" + this.ref + ")>";
  }
}

// Each JavaClassLoaderObject is a unique ClassLoader.
export class JavaClassLoaderObject extends JavaObject {
  public $loader: any
  constructor(rs: runtime.RuntimeState, cls: any) {
    super(rs, cls);
    this.$loader = rs.construct_cl(this);
  }

  public serialize(visited: any): any {
    if (visited[this.ref]) {
      return "<*" + this.ref + ">";
    }
    visited[this.ref] = true;
    var fields = {};
    for (var k in this.fields) {
      var f = this.fields[k];
      if (!f || (typeof f.serialize !== "function"))
        fields[k] = f;
      else
        fields[k] = f.serialize(visited);
    }
    var loaded = {};
    for (var type in this.$loader.loaded_classes) {
      var vcls = this.$loader.loaded_classes[type];
      loaded[type + "(" + ClassState[vcls.get_state()] + ")"] = vcls.loader.serialize(visited);
    }
    return {
      type: this.cls.get_type(),
      ref: this.ref,
      fields: fields,
      loaded: loaded
    };
  }
}

// XXX: Temporarily moved from natives.

// Have a JavaClassLoaderObject and need its ClassLoader object? Use this method!
export function get_cl_from_jclo(rs: runtime.RuntimeState, jclo: JavaClassLoaderObject): ClassLoader.ClassLoader {
  if ((jclo != null) && (jclo.$loader != null)) {
    return jclo.$loader;
  }
  return rs.get_bs_cl();
}

// avoid code dup among native methods
export function native_define_class(rs: runtime.RuntimeState, name: JavaObject, bytes: JavaArray, offset: number, len: number, loader: ClassLoader.ClassLoader, resume_cb: (jco: JavaClassObject) => void, except_cb: (e_fn: () => void) => void): void {
  var buff = new Buffer(len);
  var b_array = bytes.array;
  // Convert to buffer
  for (var i = offset; i < offset + len; i++) {
    buff.writeUInt8((256 + b_array[i]) % 256, i);
  }
  loader.define_class(rs, util.int_classname(name.jvm2js_str()), buff, (function (cdata) {
    resume_cb(cdata.get_class_object(rs));
  }), except_cb);
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
  var end = src_pos + length
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
export function arraycopy_check(rs: runtime.RuntimeState, src: JavaArray, src_pos: number, dest: JavaArray, dest_pos: number, length: number): void {
  var j = dest_pos;
  var end = src_pos + length
  var dest_comp_cls = dest.cls.get_component_class();
  for (var i = src_pos; i < end; i++) {
    // Check if null or castable.
    if (src.array[i] === null || src.array[i].cls.is_castable(dest_comp_cls)) {
      dest.array[j] = src.array[i];
    } else {
      var exc_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/ArrayStoreException;');
      rs.java_throw(exc_cls, 'Array element in src cannot be cast to dest array type.');
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


/**
 * Represents a JVM monitor.
 */
export class Monitor {
  /**
   * The owner of the monitor.
   */
  private owner: JVMThread = null;
  /**
   * Number of times that the current owner has locked this monitor.
   */
  private count: number = 0;
  /**
   * Queue of JVM threads that are waiting for the current owner to relinquish
   * the monitor.
   */
  private blocked: JVMThread[] = [];
  /**
   * Queue of JVM threads that are waiting for a JVM thread to notify them.
   */
  private waiting: JVMThread[] = [];
  /**
   * Contains the timer ids returned from setTimeout for all of the
   * TIMED_WAITING threads.
   */
  private waitTimers: { [threadRef: number]: number } = {};

  /**
   * Attempts to acquire the monitor.
   * 
   * Thread transitions:
   * * RUNNABLE => RUNNABLE
   * * RUNNABLE => BLOCKED
   * 
   * @param thread The thread that is trying to acquire the monitor.
   * @return True if successfull, false if not.
   */
  public enter(thread: JVMThread): boolean {
    var owner = this.owner;
    if (owner === null || owner === thread) {
      assert(owner === null ? this.count === 0 : true);
      this.owner = thread;
      this.count++;
      return true;
    } else {
      /**
       * "If another thread already owns the monitor associated with objectref,
       *  the thread blocks until the monitor's entry count is zero, then tries
       *  again to gain ownership."
       * @from http://docs.oracle.com/javase/specs/jvms/se7/html/jvms-6.html#jvms-6.5.monitorenter
       */
      thread.setState(enums.ThreadState.BLOCKED);
      this.blocked.push(thread);
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
   */
  public exit(thread: JVMThread): void {
    var owner = this.owner;
    if (owner === thread) {
      if (--this.count === 0 && this.blocked.length > 0) {
        // Unblock the thread at the head of the queue.
        var unblocked = this.blocked.shift();
        unblocked.setState(enums.ThreadState.RUNNABLE);
      }
    } else {
      /**
       * "If the thread that executes monitorexit is not the owner of the
       *  monitor associated with the instance referenced by objectref,
       *  monitorexit throws an IllegalMonitorStateException."
       * @from http://docs.oracle.com/javase/specs/jvms/se7/html/jvms-6.html#jvms-6.5.monitorexit
       */
      thread.throwNewException(thread.getInitializedClass('Ljava/lang/IllegalMonitorStateException;'), "Cannot exit a monitor that you do not own.");
    }
  }

  /**
   * "Causes the current thread to wait until another thread invokes the
   *  notify() method or the notifyAll() method for this object, or some other
   *  thread interrupts the current thread, or a certain amount of real time
   *  has elapsed."
   * We coalesce all possible wait configurations into this one function.
   * @from http://docs.oracle.com/javase/7/docs/api/java/lang/Object.html#wait(long, int)
   * @param thread The thread that wants to wait on this monitor.
   * @param timeoutMs? An optional timeout that specifies how long the thread
   *   should wait, in milliseconds.
   * @param timeoutNs? An optional timeout that specifies how long the thread
   *   should wait, in nanosecond precision (currently ignored).
   * @todo Use high-precision timers in browsers that support it.
   */
  public wait(thread: JVMThread, timeoutMs?: number, timeoutNs?: number): void {
    // INVARIANT: Thread shouldn't currently be blocked on a monitor.
    assert(thread.getState() !== enums.ThreadState.BLOCKED);
    this.waiting.push(thread);
    if (timeoutMs != null) {
      // Scheduler a timer that wakes up the thread.
      this.waitTimers[thread.ref] = setTimeout(() => {
        this.unwait(thread, true);
      }, timeoutMs);
      thread.setState(enums.ThreadState.TIMED_WAITING);
    } else {
      thread.setState(enums.ThreadState.WAITING);
    }
  }

  /**
   * Removes the specified thread from the waiting set, and makes it RUNNABLE
   * again.
   * @param thread The thread to remove.
   * @param fromTimer Indicates if this function call was triggered from a
   *   timer event.
   */
  private unwait(thread: JVMThread, fromTimer: boolean): void {
    // Step 1: Remove the thread from the waiting set.
    var idx = this.waiting.indexOf(thread);
    this.waiting.splice(idx, 1);
    // Step 2: Remove the timer, if applicable.
    if (thread.getState() === enums.ThreadState.TIMED_WAITING) {
      var timerId = this.waitTimers[thread.ref];
      assert(timerId != null);
      if (!fromTimer) {
        // Cancel the timer if the timer did not trigger this event.
        clearTimeout(timerId);
      }
    }
    // Step 3: Make thread runnable again.
    thread.setState(enums.ThreadState.RUNNABLE);
  }

  /**
   * Notifies a single waiting thread.
   * @param thread The notifying thread. *MUST* be the owner.
   */
  public notify(thread: JVMThread): void {
    if (this.owner === thread) {
      var waiting = this.waiting;
      if (waiting.length > 0) {
        // Notify the thread at the top of the waiting queue.
        this.unwait(waiting[0], false);
      }
    } else {
      /**
       * "Throws IllegalMonitorStateException if the current thread is not the
       *  owner of this object's monitor."
       * @from http://docs.oracle.com/javase/7/docs/api/java/lang/Object.html#notify()
       */
      thread.throwNewException(thread.getInitializedClass('Ljava/lang/IllegalMonitorStateException;'), "Cannot notify on a monitor that you do not own.");
    }
  }

  /**
   * Notifies all waiting threads.
   * @param thread The notifying thread. *MUST* be the owner.
   */
  public notifyAll(thread: JVMThread): void {
    if (this.owner === thread) {
      var waiting = this.waiting;
      // 'unwait' mutates waiting to remove the no-longer-waiting thread.
      // It also handles canceling timers.
      while (waiting.length > 0) {
        this.unwait(waiting[0], false);
      }
    } else {
      /**
       * "Throws IllegalMonitorStateException if the current thread is not the
       *  owner of this object's monitor."
       * @from http://docs.oracle.com/javase/7/docs/api/java/lang/Object.html#notifyAll()
       */
      thread.throwNewException(thread.getInitializedClass('Ljava/lang/IllegalMonitorStateException;'), "Cannot notifyAll on a monitor that you do not own.");
    }
  }

  /**
   * @return The owner of the monitor.
   */
  public getOwner(): JVMThread {
    return this.owner;
  }
}
