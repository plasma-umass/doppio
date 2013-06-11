package classes.test;

public class Runtime {
  public static void main(String[] args) {
    java.lang.Runtime rt = java.lang.Runtime.getRuntime();

    long maxMemory = rt.maxMemory();

    System.out.println(maxMemory > 0L);
  }
}
