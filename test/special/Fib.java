// compute fibonacci sequence
package test.special;
public class Fib {
  public static void main(String[] args) {
    int n;
    if (args.length > 0)
      n = Integer.parseInt(args[0]);
    else {
    	System.out.println("usage: java Fib <number>");
      return;
    }
    long a = 1;
    long b = 1;
    for (int i = 0; i < n - 2; i++) {
      long tmp = b;
      b += a;
      a = tmp;
    }
    System.out.println("fib(" + n + ") = " + b);
  }
}
