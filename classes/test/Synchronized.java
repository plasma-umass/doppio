package classes.test;

class Synchronized {

  static int state = 0;

  static class Foo {
    synchronized void bar() {
      System.out.println("Starting bar");
      state = 1;
      try {
        Thread.sleep(100);
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
    Foo foo;
    public BarRunner(Foo foo) {
      this.foo = foo;
    }

    public void run() {
      foo.bar();
    }
  }

  static class BazRunner implements Runnable {
    Foo foo;
    public BazRunner(Foo foo) {
      this.foo = foo;
    }

    public void run() {
      foo.baz();
    }
  }

  public static void main(String[] args) {
    Foo foo = new Foo();
    Thread a = new Thread(new BarRunner(foo));
    Thread b = new Thread(new BazRunner(foo));
    a.start();
    while (state != 1) Thread.yield();
    b.start();
    // if synchronization is implemented correctly, b will only run after a has
    // been interrupted, despite the yield().
    Thread.yield();
    a.interrupt();
  }

}
