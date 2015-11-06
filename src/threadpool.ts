import {ThreadStatus} from './enums';
import assert = require('./assert');

/**
 * Generic interface for a thread.
 */
export interface Thread {
  getStatus(): ThreadStatus;
  isDaemon(): boolean;
  getPriority(): number;
  setStatus(status: ThreadStatus): void;
  run(): void;
}

/**
 * Checks if the given thread status indicates that the thread is scheduleable.
 */
function isRunnable(status: ThreadStatus): boolean {
  return status === ThreadStatus.RUNNABLE;
}

/**
 * Implements a thread scheduling algorithm
 */
export interface Scheduler<T extends Thread> {
  /**
   * Schedule the given thread to run.
   */
  scheduleThread(thread: T): void;
  /**
   * Signal that the given thread's priority has changed.
   */
  priorityChange(thread: T): void;
  /**
   * Unschedule the given thread to run. It is removed from
   * the scheduler's queue.
   */
  unscheduleThread(thread: T): void;
  /**
   * Retrieve the currently running thread. Returns NULL if
   * no threads are running.
   */
  getRunningThread(): T;
  /**
   * Called when a thread's quantum is over.
   */
  quantumOver(thread: T): void;
}

/**
 * A Weighted Round Robin thread scheduler.
 */
class WeightedRoundRobinScheduler<T extends Thread> implements Scheduler<T> {
  // Number of quanta given to the current thread.
  private _count: number = 0;
  // The queue of threads.
  private _queue: T[] = [];
  // Read by runThread. Used as a lock.
  private _threadScheduled: boolean = false;

  public scheduleThread(thread: T): void {
    this._queue.push(thread);
    if (this._queue.length === 1) {
      // There aren't any threads running. Run this thread.
      this.runThread();
    }
  }

  /**
   * Run the thread at the head of the queue.
   */
  private runThread(): void {
    if (this._threadScheduled) {
      return;
    }
    this._threadScheduled = true;
    setImmediate(() => {
      let queue = this._queue;
      this._threadScheduled = false;
      if (queue.length > 0) {
        let thread = this._queue[0];
        assert(thread.getStatus() === ThreadStatus.RUNNABLE, `Attempted to run non-runnable thread.`);
        thread.run();
      }
    });
  }

  public unscheduleThread(thread: T): void {
    let queue = this._queue;
    let isRunningThread = queue[0] === thread;
    assert(queue.indexOf(thread) > -1, `Tried to unschedule thread that was not scheduled.`);
    // Remove thread from queue.
    if (isRunningThread) {
      queue.shift();
      this._count = 0;
      // Schedule the next thread.
      this.runThread();
    } else {
      queue.splice(queue.indexOf(thread), 1);
    }
  }

  public getRunningThread(): T {
    let queue = this._queue;
    if (queue.length > 0) {
      return queue[0];
    } else {
      return null;
    }
  }

  public priorityChange(thread: T): void {
    // Not important for the algorithm. We'll pick up the change
    // next time we schedule.
  }

  public quantumOver(thread: T): void {
    assert(this._queue[0] === thread, `A non-running thread has an expired quantum?`);
    this._count++;
    if (this._count >= thread.getPriority() || thread.getStatus() !== ThreadStatus.RUNNABLE) {
      // Move to back of queue, reset count.
      this._count = 0;
      this._queue.push(this._queue.shift());
    }
    // Schedule the next thread.
    this.runThread();
  }
}

/**
 * Represents a thread pool. Handles scheduling duties.
 */
export default class ThreadPool<T extends Thread> {
  private threads: T[] = [];
  private runningThread: T;
  private scheduler: Scheduler<T> = new WeightedRoundRobinScheduler<T>();
  /**
   * Called when the ThreadPool becomes empty. This is usually a sign that
   * execution has finished.
   */
  private emptyCallback: () => void;

  constructor(emptyCallback: () => void) {
    this.emptyCallback = emptyCallback;
  }

  /**
   * Retrieve all of the threads in the thread pool.
   */
  public getThreads(): T[] {
    // Return a copy of our internal array.
    return this.threads.slice(0);
  }

  /**
   * Checks if any remaining threads are non-daemonic and could be runnable.
   * If not, we can terminate execution.
   *
   * This check is invoked each time a thread terminates.
   */
  private anyNonDaemonicThreads(): boolean {
    for (let i = 0; i < this.threads.length; i++) {
      let t = this.threads[i];
      if (t.isDaemon()) {
        continue;
      }
      let status = t.getStatus();
      if (status !== ThreadStatus.NEW &&
          status !== ThreadStatus.TERMINATED) {
        return true;
      }
    }
    return false;
  }

  private threadTerminated(thread: T): void {
    var idx: number = this.threads.indexOf(thread);
    assert(idx >= 0);
    // Remove the specified thread from the threadpool.
    this.threads.splice(idx, 1);

    if (!this.anyNonDaemonicThreads()) {
      this.emptyCallback();
    }
  }

  /**
   * Called when a thread's status changes.
   */
  public statusChange(thread: T, oldStatus: ThreadStatus, newStatus: ThreadStatus): void {
    var wasRunnable  = isRunnable(oldStatus),
      nowRunnable = isRunnable(newStatus);

    if (oldStatus === ThreadStatus.NEW || oldStatus === ThreadStatus.TERMINATED) {
      if (this.threads.indexOf(thread) === -1) {
        this.threads.push(thread);
      }
    }

    // Inform scheduling algorithm if thread changes from runnable => unrunnable, or unrunnable => runnable.
    if (wasRunnable !== nowRunnable) {
      if (wasRunnable) {
        this.scheduler.unscheduleThread(thread);
      } else {
        this.scheduler.scheduleThread(thread);
      }
    }

    if (newStatus === ThreadStatus.TERMINATED) {
      this.threadTerminated(thread);
    }
  }

  /**
   * Called when a thread's priority changes.
   */
  public priorityChange(thread: T): void {
    this.scheduler.priorityChange(thread);
  }

  /**
   * Called when a thread's quantum is over.
   */
  public quantumOver(thread: T): void {
    this.scheduler.quantumOver(thread);
  }
}
