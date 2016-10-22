import {JVMThread} from './threading';
import {ClassData} from './ClassData';

/**
 * A single class lock, used for load/initialization locks.
 */
export default class ClassLock {
  private queue: { thread: JVMThread; cb: (cdata: ClassData) => void; }[] = [];

  /**
   * Checks if the lock is taken. If so, it enqueues the callback. Otherwise,
   * it takes the lock and returns true.
   */
  public tryLock(thread: JVMThread, cb: (cdata: ClassData) => void): boolean {
    // We're the owner if the queue was previously empty.
    return this.queue.push({ thread: thread, cb: cb }) === 1;
  }

  /**
   * Releases the lock on the class, and passes the object to all enqueued
   * callbacks.
   */
  public unlock(cdata: ClassData): void {
    var i: number, num = this.queue.length;
    for (i = 0; i < num; i++) {
      this.queue[i].cb(cdata);
    }
    this.queue = [];
  }

  /**
   * Get the owner of this lock.
   */
  public getOwner(): JVMThread {
    if (this.queue.length > 0) {
      return this.queue[0].thread;
    }
    return null;
  }
}
