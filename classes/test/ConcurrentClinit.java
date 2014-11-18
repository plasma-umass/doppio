package classes.test;

class ConcurrentClinit {
  static int state = 0;

  static class Foo {
    static {
      System.out.println("Initializing Foo with " + Thread.currentThread().getName());
      state = 1;
      try {
        Thread.sleep(500);
      }
      catch (InterruptedException e) {
        System.out.println("Interrupted");
      }
      System.out.println("Finished initializing Foo with " + Thread.currentThread().getName());
    }
    Foo() {
      System.out.println("Made a Foo");
    }
  }

  static class Bar {
    static {
      System.out.println("Initializing Bar with " + Thread.currentThread().getName());
      state = 2;
      new Foo();
      while (state != 3) Thread.yield();
      System.out.println("Finished initializing Bar with " + Thread.currentThread().getName());
    }
  }

  public static void main(String[] args) throws InterruptedException {
    Thread a = new Thread(new Runnable() {
      public void run() {
        new Foo();
        state = 3;
      }
    }, "Thread A");
    Thread b = new Thread(new Runnable() {
      public void run() {
        new Bar();
      }
    }, "Thread B");

    a.start();
    while (state != 1) Thread.yield();

    b.start();
    while (state != 2) Thread.yield();
    a.interrupt();
  }

}
