// test static field init
public class StaticField {
  static int foo = 6;
  static String bar = "bar";
  static Object baz = new Object();

  public static void main(String[] args) {
    int a = StaticField.foo;
    String b = StaticField.bar;
    Object c = StaticField.baz;
  }
}
