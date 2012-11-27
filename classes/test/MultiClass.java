// tests multiple classes in a file
package classes.test;
public class MultiClass {
  int a;
  public static void main(String[] args) {
      Foo f = new Foo();
  }
}
class Foo {
  int a;
  void run() {
    System.out.println(1.23);
  }
}
