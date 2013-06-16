package classes.test;

import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.LockSupport;

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
  
  static class Thread1 extends Thread {
    private FIFOMutex mut;
    public Thread1(FIFOMutex mut) {
      this.mut = mut;
    }
    public void run() {
      mut.lock();
      System.out.println("1 Ran");
    }
  }
  
  static class Thread2 extends Thread {
    private FIFOMutex mut;
    public Thread2(FIFOMutex mut) {
      this.mut = mut;
    }
    public void run() {
      mut.lock();
      System.out.println("2 Ran");
    }
  }
  
  static class Thread3 extends Thread {
    private FIFOMutex mut;
    public Thread3(FIFOMutex mut) {
      this.mut = mut;
    }
    public void run() {
      mut.lock();
      System.out.println("3 Ran");
    }
  }
  
  public static void main(String[] args) {
    TimeoutTest t = new TimeoutTest();
    t.start();
    while(t.isAlive()) Thread.yield();
    
    FIFOMutex mut = new FIFOMutex();
    
    mut.lock();
    
    // 1 Ran
    Thread1 t1 = new Thread1(mut);
    t1.start();
    
    // 3 Ran
    Thread3 t3 = new Thread3(mut);
    t3.start();
    
    // 2 Ran
    Thread2 t2 = new Thread2(mut);
    t2.start();
    
    while(t1.isAlive() || t2.isAlive() || t3.isAlive()) mut.unlock();
  }
}
