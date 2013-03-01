package classes.test;

class ConcurrentClinit {

  static Object obj = new Object();
  static int state = 0;

  static class Foo {
    static {
      System.out.println("Initializing Foo with thread " +
          Thread.currentThread().getName());
      state = 1;
      try {
        Thread.sleep(100);
      }
      catch (InterruptedException e) {
        System.out.println("Interrupted");
      }
      System.out.println("Finished initializing Foo with thread " +
          Thread.currentThread().getName());
    }
  }

  static class Bar {
    static {
      System.out.println("Initializing Bar with thread " +
          Thread.currentThread().getName());
      state = 2;
      new Foo();
      System.out.println("Finished initializing Bar with thread " +
          Thread.currentThread().getName());
    }
  }

  public static void main(String[] args) throws InterruptedException {
    Thread a = new Thread(new Runnable() {
      public void run() {
        new Foo();
      }
    });
    a.start();
    while (state != 1) Thread.yield();
    Thread b = new Thread(new Runnable() {
      public void run() {
        new Bar();
      }
    });
    b.start();
    while (state != 2) Thread.yield();
    a.interrupt();
  }

}
