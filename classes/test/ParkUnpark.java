package classes.test;

import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.LockSupport;
import java.util.concurrent.Semaphore;

public class ParkUnpark {
  static class TimeoutTest extends Thread {
    public void run() {
      System.out.print("Foo");
      LockSupport.parkUntil(System.currentTimeMillis() + 1000);
      System.out.println("bar");
    }
  }
  
  // Taken straight from the LockSupport documentation
  static class FIFOMutex {
    private final AtomicBoolean locked = new AtomicBoolean(false);
    private final Queue<Thread> waiters = new ConcurrentLinkedQueue<Thread>();

    public void lock() {
      boolean wasInterrupted = false;
      Thread current = Thread.currentThread();
      waiters.add(current);

      // Block while not first in queue or cannot acquire lock
      while (waiters.peek() != current || !locked.compareAndSet(false, true)) {
        LockSupport.park(this);
        if(Thread.interrupted()) {
          System.out.println("Interrupted");
          wasInterrupted = true;
        }
      }

      waiters.remove();
      if(wasInterrupted) current.interrupt();
    }
    
    public void unlock() {
      locked.set(false);
      LockSupport.unpark(waiters.peek());
    }
  }
  
  private static final FIFOMutex mut = new FIFOMutex();
  
  static class PrintThread extends Thread {
    private String msg;
    public PrintThread(String msg) {
      this.msg = msg;
    }
    public void run() {
      mut.lock();
      System.out.println(msg);
      mut.unlock();
    }
  }
  
  public static void main(String[] args) throws InterruptedException {
    TimeoutTest t = new TimeoutTest();
    t.start();
    while(t.isAlive()) Thread.yield();
    
    mut.lock();
    (new PrintThread("Message")).start();
    (new PrintThread("Message")).start();
    (new PrintThread("Message")).start();
    mut.unlock();
  }
}
