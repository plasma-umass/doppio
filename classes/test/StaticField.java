// test static field init
package classes.test;
public class StaticField {
  static int foo = 6;
  static String name = "bar";
  static Object baz = new Object();

  public static void main(String[] args) {
    int a = StaticField.foo;
    Object c = StaticField.baz;
    System.out.println(StaticField.name);
    System.out.println(StaticField.class.getName());
  }
}
