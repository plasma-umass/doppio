// tests static methods
package classes.test;
public class StaticMethod {
  static int foo(double x, long y) {
    return (int)x + (int)y;
  }
  public static void main(String[] args) {
    System.out.println(foo(3.14,500L));
  }
}
