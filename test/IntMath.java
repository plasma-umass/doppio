package test;

public class IntMath {
  public static void main(String[] args) {
    int a = 1;
    int b = 0;
    int c;
    try {
      c = a / b;
    }
    catch (ArithmeticException e) {
      System.out.println("Caught ArithmeticException as expected: " + e.getMessage());
    }

    try {
      c = a % b;
    }
    catch (ArithmeticException e) {
      System.out.println("Caught ArithmeticException as expected: " + e.getMessage());
    }

    runOps(5, 3);
    runOps(-5, 3);
    runOps(5, -3);
  }

  public static void runOps(int a, int b) {
    int c = b / a;
    System.out.println(b + " / " + a + " = " + c);
    c = b % a;
    System.out.println(b + " % " + a + " = " + c);
  }
}
