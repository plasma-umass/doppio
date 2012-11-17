package classes.test;

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

    runOps(5, 4);
    runOps(-5, 4);
    runOps(5, -4);
    runOps(Float.MAX_VALUE, Float.MAX_VALUE);
    runOps(Float.MAX_VALUE, 1E-30f);
    runOps(1E-30f, Float.MAX_VALUE);
    runOps(1E-30f, 1E-30f);

    test_flops();
  }

    static float test_flops(){
        // force javac to use fload <n>, freturn, etc.
        float a = 0f;
        float b = 2f;
        float c = Float.MAX_VALUE;
        float d = 5f;
        float e = -432112341.4f;
        float f = Float.MIN_VALUE;
        a = 5463f;
        float[] foo = {a,b,c,d,e,f};
        return foo[3];
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
