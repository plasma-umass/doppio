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
      synchronized(obj) {
        try {
          obj.wait();
        }
        catch (InterruptedException e) {
          System.out.println("Interrupted");
          return;
        }
        System.out.println("Not interrupted");
      }
    }
  }

  public static void main(String[] args) {
    Foo a = new Foo();
    Foo b = new Foo();
    try {
      Thread.currentThread().sleep(100);
    }
    catch (InterruptedException e) {}
    if (a.thread.isAlive()) a.thread.interrupt();
    if (b.thread.isAlive()) b.thread.interrupt();
  }

}
