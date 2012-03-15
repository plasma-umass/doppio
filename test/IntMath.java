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
    runOps(Integer.MAX_VALUE, Integer.MAX_VALUE);
    runOps(Integer.MAX_VALUE, Integer.MIN_VALUE);
    runOps(Integer.MIN_VALUE, Integer.MAX_VALUE);
    runOps(Integer.MIN_VALUE, Integer.MIN_VALUE);
  }

  public static void runOps(int a, int b) {
    int c = a + b;
    System.out.println(a + " + " + b + " = " + c);
    c = a - b;
    System.out.println(a + " - " + b + " = " + c);
    c = a * b;
    System.out.println(a + " * " + b + " = " + c);
    c = a / b;
    System.out.println(a + " / " + b + " = " + c);
    c = a % b;
    System.out.println(a + " % " + b + " = " + c);
    c = a << b;
    System.out.println(a + " << " + b + " = " + c);
    c = a >> b;
    System.out.println(a + " >> " + b + " = " + c);
  }
}
