package classes.test;

/*
 * Verify that calling wait() does not cause other threads to wake up without
 * receiving notify().
 */
class WaitTest {

  static Object obj = new Object();

  static class Foo implements Runnable {
    Thread thread;

    Foo() {
      thread = new Thread(this);
      thread.start();
    }

    public void run() {
      synchronized (obj) {
        try {
          //System.out.println("Waiting.");
          obj.wait();
        }
        catch (InterruptedException e) {
          System.out.println("Interrupted");
          if (Thread.currentThread().isInterrupted()) {
            System.out.println("And the interrupted flag is set!");
          }
          return;
        }
        System.out.println("Not interrupted");
      }
    }
  }

  public static void main(String[] args) throws InterruptedException {
    Foo a = new Foo();
    Foo b = new Foo();
    Foo c = new Foo();
    Foo d = new Foo();
    Foo e = new Foo();
    // Wait for a and b to be in the waiting state.
    while (a.thread.getState() != Thread.State.WAITING &&
      b.thread.getState() != Thread.State.WAITING &&
      c.thread.getState() != Thread.State.WAITING &&
      d.thread.getState() != Thread.State.WAITING &&
      e.thread.getState() != Thread.State.WAITING) {
      Thread.currentThread().sleep(50);
    }
    // Interrupt one
    System.out.println("Interrupting one thread.");
    a.thread.interrupt();
    
    // Wait for the thread to terminate.
    while (a.thread.getState() != Thread.State.TERMINATED) {
      Thread.currentThread().sleep(50);
    }
    
    synchronized(obj) {
      System.out.println("Notifying one thread.");
      // Notify one
      obj.notify();
      System.out.println("Notifying the rest of the threads.");
      // Notify the rest
      obj.notifyAll();
      System.out.println("Main thread relinquishing lock!");
    }
  }

}
