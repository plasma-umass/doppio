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
    runOps(Float.POSITIVE_INFINITY, 1);

    test_flops();
    System.out.println(Float.intBitsToFloat(12345));
    System.out.println(Float.intBitsToFloat(0));
    System.out.println(Float.intBitsToFloat(Integer.MAX_VALUE));
    //Removed: Maps to -0; there is no -0 in JavaScript. Works with typed
    //arrays, though.
    //System.out.println(Float.intBitsToFloat(Integer.MIN_VALUE));

    // Testing float <-> int conversions
    // NaN is not in here; browsers use different standard NaN values that may
    // disagree with Java (e.g. Opera is different)
    float[] ftilVals = {Float.MAX_VALUE,Float.MIN_VALUE,Float.NEGATIVE_INFINITY,Float.POSITIVE_INFINITY,0f,1f,-432112341.4f,5f};
    for (float f : ftilVals) floatToIntTest(f);
    int[] intVals = {0,-1,-7674718,2139095040,2139095041,-8388608,-8388607};
    for (int i : intVals) intToFloatTest(i);

    /** NaN Math! **/

    // Constant NaN (in the constant pool) and a dynamically generated NaN
    float infty = getMaxValue()*getMaxValue();
    float nans[] = {Float.NaN, infty / infty};
    for (float nan : nans) {
      runOps(1, nan);
      runOps(-1, nan);
      runOps(0, nan);
      runOps(1.0021213f, nan);
      runOps(Float.MAX_VALUE, nan);
      runOps(Float.MIN_VALUE, nan);
      runOps(Float.NEGATIVE_INFINITY, nan);
      runOps(Float.POSITIVE_INFINITY, nan);
      runOps(nan, nan);
      runOps(Float.intBitsToFloat(-1), nan);
    }

    System.out.println("Comparing two Float NaNs with different values:");
    System.out.println("\tNaN(-1) == Float.NaN: " + (Float.intBitsToFloat(-1) == Float.NaN));
    System.out.println("\tNaN(-1) < Float.NaN: " + (Float.intBitsToFloat(-1) < Float.NaN));
    System.out.println("\tNaN(-1) > Float.NaN: " + (Float.intBitsToFloat(-1) > Float.NaN));
    System.out.println("\tFloat.compare(NaN(-1),Float.NaN): " + Float.compare(Float.intBitsToFloat(-1), Float.NaN));

    // (+/-)Infinity/(+/-)infinity should be NaN. But if we don't treat infinity
    // correctly, we will incorrectly get 1 here. :)
    float infinities[] = {Float.NEGATIVE_INFINITY, Float.POSITIVE_INFINITY};
    for (float infty1 : infinities) {
      for (float infty2 : infinities) {
        float infdiv = infty1/infty2;
        System.out.println(infty1 + "/" + infty2 + "=" + infdiv);
      }
      System.out.println("0*" + infty1 + "=" + (0*infty1));
    }
    System.out.println("infty+-infty=" + (Float.POSITIVE_INFINITY + Float.NEGATIVE_INFINITY));
  }

  static void floatToIntTest(float a) {
    System.out.println("Float->int: " + a + "->" + Float.floatToRawIntBits(a));
  }

  static float getZero() { return 0f; }
  static float getMaxValue() { return Float.MAX_VALUE; }

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
    c = b - a;
    System.out.println(b + " - " + a + " = " + c);
    c = a / b;
    System.out.println(a + " / " + b + " = " + c);
    c = b / a;
    System.out.println(b + " / " + a + " = " + c);
    c = a % b;
    System.out.println(a + " % " + b + " = " + c);
    c = b % a;
    System.out.println(b + " % " + a + " = " + c);
    c = a * b;
    System.out.println(a + " * " + b + " = " + c);
  }

}
