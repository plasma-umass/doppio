// tests static methods
public class Method {
  static int foo(double x, long y) {
    return (int)x + (int)y;
  }
  public static void main(String[] args) {
    foo(3.14,500L);
  }
}
