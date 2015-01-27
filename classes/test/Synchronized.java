package classes.test;

class Synchronized {

  static int state = 0;
  static final Foo foo = new Foo();

  static class Foo {
    synchronized void bar() {
      System.out.println("Starting bar");
      state = 1;
      try {
        Thread.sleep(100);  // sleep doesn't give up the lock on foo
      }
      catch (InterruptedException e) {
        System.out.println("bar interrupted");
      }
      System.out.println("bar completed");
    }

    synchronized void baz() {
      System.out.println("Running baz");
    }
  }

  static class BarRunner implements Runnable {
    public void run() {
      foo.bar();
    }
  }

  static class BazRunner implements Runnable {
    public void run() {
      System.out.println("About to run baz");
      state = 2;
      foo.baz();
    }
  }

  public static void main(String[] args) {
    synchronized(args) {
      System.out.println("You can use an array as a monitor!");
    }
    Thread a = new Thread(new BarRunner());
    Thread b = new Thread(new BazRunner());
    a.start();
    while (state != 1) Thread.yield();
    b.start();
    // if synchronization is implemented correctly, b will only run after a has
    // been interrupted, despite the yield().
    while (state != 2) Thread.yield();
    a.interrupt();
  }

}
