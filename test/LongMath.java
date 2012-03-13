package test;

public class LongMath {
  public static void main(String[] args) {
    long a = 1;
    long b = 0;
    long c;
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
    runOps(Long.MAX_VALUE, Long.MAX_VALUE);
    runOps(Long.MAX_VALUE, Long.MIN_VALUE);
    runOps(Long.MIN_VALUE, Long.MAX_VALUE);
    runOps(Long.MIN_VALUE, Long.MIN_VALUE);

    runSmallOps(5, 3);
    runSmallOps(-5, 3);
    runSmallOps(5, -3);
  }

  public static void runOps(long a, long b) {
    long c = a + b;
    System.out.println(a + " + " + b + " = " + c);
    c = a - b;
    System.out.println(a + " - " + b + " = " + c);
    c = a / b;
    System.out.println(a + " / " + b + " = " + c);
    c = a % b;
    System.out.println(a + " % " + b + " = " + c);
  }

  // our implementation has yet to support these operations on large integers.
  public static void runSmallOps(long a, long b) {
    long c = a * b;
    System.out.println(a + " * " + b + " = " + c);
    c = a << b;
    System.out.println(a + " << " + b + " = " + c);
    c = a >> b;
    System.out.println(a + " >> " + b + " = " + c);
    c = a | b;
    System.out.println(a + " | " + b + " = " + c);
    c = a ^ b;
    System.out.println(a + " ^ " + b + " = " + c);
  }
}
