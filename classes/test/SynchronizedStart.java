package classes.test;

/*
 This test replicates a bug encountered when running the
 Eclipse Java Compiler, when calling the constructor for
 org.eclipse.jdt.internal.compiler.ProcessTaskManager
 */
public class SynchronizedStart implements Runnable {
  public SynchronizedStart() {
    synchronized (this) {
      System.out.println("1: inside ctor synchronized block");
      new Thread(this, "runner").start();
      System.out.println("2: leaving ctor synchronized block");
    }
  }
  public void run() {
    synchronized (this) {
      System.out.println("3: inside run synchronized block");
    }
    System.out.println("4: outside run synchronized block");
  }
  public static void main(String[] args) {
    new SynchronizedStart();
  }
}
