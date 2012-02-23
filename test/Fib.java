// compute fibonacci sequence
public class Fib {
  static long fib(long n) {
    if (n < 2) return 1;
    return fib(n-1) + fib(n-2);
  }
  public static void main(String[] args) {
    int n = Integer.parseInt(args[0]);
    System.out.println("fib("+n+") = "+fib(n));
  }
}
