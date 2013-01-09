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
    System.out.println(Float.intBitsToFloat(12345));
    System.out.println(Float.intBitsToFloat(0));
    System.out.println(Float.intBitsToFloat(Integer.MAX_VALUE));
    System.out.println(Float.intBitsToFloat(Integer.MIN_VALUE));

    // Testing float <-> int conversions
    // TODO: Add Float.NaN once we fix that.
    float[] ftilVals = {Float.MAX_VALUE,Float.MIN_VALUE,Float.NaN,Float.NEGATIVE_INFINITY,Float.POSITIVE_INFINITY,0f,1f,-432112341.4f,5f};
    for (float f : ftilVals) floatToIntTest(f);
    int[] intVals = {0,-1,-7674718,2139095040,2139095041,-8388608,-8388607};
    for (int i : intVals) intToFloatTest(i);
    System.out.println("Int(-1) -> Float(NaN) -> Int: " + -1 + " -> " + Float.intBitsToFloat(-1) + " -> " + Float.floatToRawIntBits(Float.intBitsToFloat(-1)));
  }

  static void floatToIntTest(float a) {
    System.out.println("Float->int: " + a + "->" + Float.floatToRawIntBits(a));
  }

  static void intToFloatTest(int a) {
    System.out.println("Int->float: " + a + "->" + Float.intBitsToFloat(a));
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
