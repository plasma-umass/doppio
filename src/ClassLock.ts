import threading = require('./threading');
import ClassData = require('./ClassData');

/**
 * A single class lock, used for load/initialization locks.
 */
class ClassLock {
  private queue: { thread: threading.JVMThread; cb: (cdata: ClassData.ClassData) => void; }[] = [];

  /**
   * Checks if the lock is taken. If so, it enqueues the callback. Otherwise,
   * it takes the lock and returns true.
   */
  public tryLock(thread: threading.JVMThread, cb: (cdata: ClassData.ClassData) => void): boolean {
    // We're the owner if the queue was previously empty.
    return this.queue.push({ thread: thread, cb: cb }) === 1;
  }

  /**
   * Releases the lock on the class, and passes the object to all enqueued
   * callbacks.
   */
  public unlock(cdata: ClassData.ClassData): void {
    var i: number, num = this.queue.length;
    for (i = 0; i < num; i++) {
      this.queue[i].cb(cdata);
    }
    this.queue = [];
  }

  /**
   * Get the owner of this lock.
   */
  public getOwner(): threading.JVMThread {
    if (this.queue.length > 0) {
      return this.queue[0].thread;
    }
    return null;
  }
}

export = ClassLock;
