package classes.test;

public class DoubleMath {
  public static void main(String[] args) {
    System.out.println(Math.pow(4.0,2.0));
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
    runOps(Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY);
    runOps(Double.NEGATIVE_INFINITY, Double.NEGATIVE_INFINITY);
    runOps(Double.POSITIVE_INFINITY, Double.NEGATIVE_INFINITY);
    runOps(Double.NaN, Double.NaN);
    runOps(Double.NaN, Double.POSITIVE_INFINITY);
    runOps(Double.NaN, Double.NEGATIVE_INFINITY);
    runOps(0, Double.POSITIVE_INFINITY);
    runOps(0, Double.NEGATIVE_INFINITY);
    runOps(0, 0);

    for (double d : test_dops()) {
      System.out.println(d);
    }

    System.out.println(returnDouble());

    // Double <-> Long conversions
    double[] conversionNumbers = {Double.NEGATIVE_INFINITY, Double.POSITIVE_INFINITY, 0, Double.MAX_VALUE, Double.MIN_VALUE, -5, 4, Double.NaN};
    for (double conversionNumber : conversionNumbers)
      System.out.println(Double.longBitsToDouble(Double.doubleToRawLongBits(conversionNumber)));
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
    c = b - a;
    System.out.println(b + " - " + a + " = " + c);
    // Small hack: Prevent 0/-infinity which returns -0; -0 is not
    // distinguishable from 0 without typed arrays.
    if (a != 0 || b != Double.NEGATIVE_INFINITY) {
      c = a / b;
      System.out.println(a + " / " + b + " = " + c);
    }
    if (b != 0 || a != Double.NEGATIVE_INFINITY) {
      c = b / a;
      System.out.println(b + " / " + a + " = " + c);
    }
    c = a % b;
    System.out.println(a + " % " + b + " = " + c);
    c = b % a;
    System.out.println(b + " % " + a + " = " + c);
    c = a * b;
    System.out.println(a + " * " + b + " = " + c);
  }

}
