import {ThreadStatus} from './enums';
import {JVMThread} from './threading';
import assert = require('./assert');

/**
 * Manages parked threads and their callbacks.
 */
class Parker {
  private _parkCounts: { [threadRef: number]: number } = {};
  private _parkCallbacks: { [threadRef: number]: () => void } = {};

  public park(thread: JVMThread, cb: () => void) {
    var ref = thread.getRef();
    assert(!this._parkCallbacks[ref] && thread.getStatus() !== ThreadStatus.PARKED, `Thread ${ref} is doubly parked? Should be impossible.`);
    this._parkCallbacks[ref] = cb;
    this._mutateParkCount(thread, 1);
    // It's possible the thread was instantly unparked due to a previously
    // unbalancing park.
    if (this.isParked(thread)) {
      thread.setStatus(ThreadStatus.PARKED);
    }
  }

  public unpark(thread: JVMThread): void {
    this._mutateParkCount(thread, -1);
  }

  public completelyUnpark(thread: JVMThread): void {
    var ref = thread.getRef(), count = this._parkCounts[ref];
    if (count) {
      this._mutateParkCount(thread, -count);
    }
  }

  private _mutateParkCount(thread: JVMThread, delta: number): void {
    var ref = thread.getRef(), cb: () => void;
    // Initialize park count.
    if (!this._parkCounts[ref]) {
      this._parkCounts[ref] = 0;
    }
    if (0 === (this._parkCounts[ref] += delta)) {
      assert(!!this._parkCallbacks[ref], `Balancing unpark for thread ${ref} with no callback? Should be impossible.`);
      cb = this._parkCallbacks[ref];

      // Cleanup.
      delete this._parkCounts[ref];
      delete this._parkCallbacks[ref];

      // Avoid situations where a terminated thread's timeout wakes up
      // and tries to revive its thread.
      if (thread.getStatus() === ThreadStatus.PARKED) {
        thread.setStatus(ThreadStatus.ASYNC_WAITING);
        cb();
      }
    }
  }

  public isParked(thread: JVMThread): boolean {
    return !!this._parkCounts[thread.getRef()];
  }
}

export = Parker;
