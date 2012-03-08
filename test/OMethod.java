// tests Object creation and methods
package test;
public class OMethod {
  public OMethod(String a, double b) {
    int bar = foo(b);
  }
  private int foo(double x) {
    return (int)x;
  }
  public static void main(String[] args) {
    OMethod quux = new OMethod("hello",-9.322);
  }
}
