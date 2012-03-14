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

    test_dops();
  }

  static double test_dops(){
        // force javac to use dload <n>, dreturn, etc.
        double a = 0f;
        double b = 2f;
        double c = Double.MAX_VALUE;
        double d = 5f;
        double e = -432112341.4f;
        double f = Double.MIN_VALUE;
        a = 5463f;
        double[] foo = {a,b,c,d,e,f};
        return foo[3];
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
