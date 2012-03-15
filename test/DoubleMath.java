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

    for (double d : test_dops()) {
      System.out.println(d);
    }

    System.out.println(returnDouble());
  }

  static double[] test_dops(){
    // force javac to use dload <n>, etc.
    double a = 0f;
    double b = 2f;
    double c = Double.MAX_VALUE;
    double d = 5f;
    double e = -432112341.4f;
    double f = Double.MIN_VALUE;
    a = 5463f;
    double[] foo = {a,b,c,d,e,f,0,0};
    // dcmpl, dcmpg
    if (a < b)
      foo[6] = 6f;
    if (c > d)
      foo[7] = 6f;
    return foo;
  }

  static double returnDouble() {
    // force usage of dreturn
    return Math.PI;
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
