// compute greatest common divisor
package classes.test;
public class GCD {
  public static void main(String[] args) {
    int a = 144;
    int b = 84;

    while (b != 0) {
      int tmp = b;
      b = a % b;
      a = tmp;
    }

    System.out.println("The GCD of 114 and 84 is " + a);
  }
}
