// concatenate strings
package classes.test;
public class ConcatStrings {
  public static void main(String[] args) {
    String a = "hello";
    String b = "world";
    String c = a + " " + b;
    String d = "" + 7 + 5.43 + -2L + 3.14f + "\n";
    System.out.println(a);
    System.out.println(b);
    System.out.println(c);
    System.out.println(d);
  }
}
