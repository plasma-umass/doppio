// tests Object creation and methods
package classes.test;
public class OMethod {
  public OMethod(String a, double b) {
    int bar = foo(b);
    System.out.println(bar);
  }
  private int foo(double x) {
    return (int)x;
  }
  public static void main(String[] args) {
    OMethod quux = new OMethod("hello",-9.322);
  }
}
