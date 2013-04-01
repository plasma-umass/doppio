package classes.test;
public class ThreadFromClinit {
  private static final AbusingStaticInitialization asi = new AbusingStaticInitialization();

  public static void main(String args[]) {
    // NOP
  }
}
class AbusingStaticInitialization implements Runnable {
  AbusingStaticInitialization() {
    new Thread(this).start();
  }
  public void run() {
    System.out.println("Hello! I am a thread. The JVM has launched me " +
                       "during static initialization (<clinit>).");
  }
}