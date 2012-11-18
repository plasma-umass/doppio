// compute fibonacci sequence
package classes.demo;
public class Fib {
  public static void main(String[] args) {
    int n;
    if (args.length > 0)
      n = Integer.parseInt(args[0]);
    else
      n = 20;
    int a = 1;
    int b = 1;
    for (int i = 0; i < n - 2; i++) {
      int tmp = b;
      b += a;
      a = tmp;
    }
    System.out.println("fib(" + n + ") = " + b);
  }
}
