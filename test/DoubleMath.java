package test;

public class DoubleMath {
  public static void main(String[] args) {
    double a = 1.0;
    double b = 0.0;
    double c;
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

    runOps(5, 4);
    runOps(-5, 4);
    runOps(5, -4);
    runOps(Double.MAX_VALUE, Double.MAX_VALUE);
    runOps(Double.MAX_VALUE, Double.MIN_VALUE);
    runOps(Double.MIN_VALUE, Double.MAX_VALUE);
    runOps(Double.MIN_VALUE, Double.MIN_VALUE);
  }

  public static void runOps(double a, double b) {
    double c = a + b;
    System.out.println(a + " + " + b + " = " + c);
    c = a - b;
    System.out.println(a + " - " + b + " = " + c);
    c = a / b;
    System.out.println(a + " / " + b + " = " + c);
    c = a % b;
    System.out.println(a + " % " + b + " = " + c);
    c = a * b;
    System.out.println(a + " * " + b + " = " + c);
  }

}
