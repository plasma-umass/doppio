// compute fibonacci sequence
public class IterativeFib {
  public static void main(String[] args) {
    int a = 1;
    int b = 1;
    for (int i = 0; i < 5; i++) {
      int tmp = b;
      b += a;
      a = tmp;
    }
    System.out.println("fib(7) = " + b);
  }
}
