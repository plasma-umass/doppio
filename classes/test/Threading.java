package classes.test;
import java.lang.Thread;
import java.util.concurrent.locks.*;

public class Threading extends Thread {
  private static Lock lock = new ReentrantLock();

  public Threading(String name) {
    super(name);
  }
  public void run() {
    while (!lock.tryLock()) {
      // Busy-wait for lock. Keeps us in RUNNABLE state for the test.
    }
    System.out.println("hello from "+Thread.currentThread().getName());
    lock.unlock();
  }
  public static void main(String[] args) throws java.lang.InterruptedException {
    System.out.println(Thread.currentThread().getState()); 
    Thread.currentThread().interrupt();
    System.out.println("main thread was interrupted: " + Thread.currentThread().interrupted());

    Threading t = new Threading("hello-thread");
    System.out.println(t.isAlive());
    System.out.println(t.holdsLock(t));  // should be false
    synchronized (t) {
      System.out.println(t.holdsLock(t));  // should be true
    }
    System.out.println(t.isInterrupted());  // should be false
	  System.out.println(t.getState()); // should be NEW.
    lock.lock();
    t.run();
    t.start();
    System.out.println(t.getState()); // should be RUNNABLE.
    lock.unlock();
    t.join();
	  System.out.println(t.getState()); // should be TERMINATED.
    System.out.println("joined in "+Thread.currentThread().getName());
    Q q = new Q();
    new Producer(q);
    new Consumer(q);
  }
}

// A correct implementation of a producer and consumer.
class Q {
  int n;
  boolean valueSet = false;
  synchronized int get() {
    if(!valueSet)
      try {
        wait();
      } catch(InterruptedException e) {
        System.out.println("InterruptedException caught");
      }
    System.out.println("Got: " + n);
    valueSet = false;
    notify();
    return n;
  }
  synchronized void put(int n) {
    if(valueSet)
      try {
        wait();
      } catch(InterruptedException e) {
        System.out.println("InterruptedException caught");
      }
    this.n = n;
    valueSet = true;
    System.out.println("Put: " + n);
    notify();
  }
}

class Producer implements Runnable {
  Q q;
  Producer(Q q) {
    this.q = q;
    new Thread(this, "Producer").start();
  }
  public void run() {
    for (int i=0; i<5; ++i) {
      q.put(i);
    }
  }
}

class Consumer implements Runnable {
  Q q;
  Consumer(Q q) {
    this.q = q;
    new Thread(this, "Consumer").start();
  }
  public void run() {
    while(true) {
      if (q.get() == 4) break;
    }
  }
}
