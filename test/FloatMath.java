package test;

public class FloatMath {
  public static void main(String[] args) {
    float a = 1f;
    float b = 0f;
    float c;
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
    runOps(Float.MAX_VALUE, Float.MAX_VALUE);
    runOps(Float.MAX_VALUE, Float.MIN_VALUE);
    runOps(Float.MIN_VALUE, Float.MAX_VALUE);
    runOps(Float.MIN_VALUE, Float.MIN_VALUE);

  }

  public static void runOps(float a, float b) {
    float c = a + b;
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
