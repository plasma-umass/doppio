// use every strict math function
package classes.test;
import java.util.Arrays;
import java.lang.StrictMath;

public class StrictMathTest {
  private static void results(String name, int[] results) {
    System.out.print(name + ": ");
    System.out.println(Arrays.toString(results));
  }

  private static void results(String name, long[] results) {
    System.out.print(name + ": ");
    System.out.println(Arrays.toString(results));
  }

  private static void results(String name, float[] results) {
    System.out.print(name + ": ");
    System.out.println(Arrays.toString(results));
  }

  private static void results(String name, double[] results) {
    System.out.print(name + ": ");
    boolean first = true;
    String result = "";
    for (double d : results) {
      if (first)
        first = false;
      else
        result += " ";
      // paper over precision issues in Chrome, see #181
      result += String.format("%.13g", d);
    }
    System.out.println(result);
  }

  public static void main(String[] args) {
    double[] d_vals = { 2.12345,
                        -3.256,
                        0,3,4,
                        Double.MAX_VALUE,
                        Double.MIN_VALUE,
                        Double.MIN_NORMAL,
                        Double.MAX_EXPONENT,
                        Double.MIN_EXPONENT,
                        //Double.NaN,
                        Double.POSITIVE_INFINITY,
                        Double.NEGATIVE_INFINITY
                      };
    float[] f_vals =  { 2,
                        -5,
                        0,
                        Float.MAX_VALUE,
                        Float.MIN_VALUE,
                        Float.MIN_NORMAL,
                        Float.MAX_EXPONENT,
                        Float.MIN_EXPONENT,
                        //Float.NaN,
                        Float.POSITIVE_INFINITY,
                        Float.NEGATIVE_INFINITY
                      };

    int[] i_vals = { 245, -20, 0, Integer.MAX_VALUE, Integer.MIN_VALUE };
    long[] l_vals = { 12345678, -1235, 0, Long.MAX_VALUE, Long.MIN_VALUE };

    double[] d_results = new double[d_vals.length];
    double[] d_results_2d = new double[d_vals.length*d_vals.length];
    int[] i_results = new int[i_vals.length];
    int[] i_results_2d = new int[i_vals.length*i_vals.length];
    float[] f_results = new float[f_vals.length];
    float[] f_results_2d = new float[f_vals.length*f_vals.length];
    long[] l_results = new long[l_vals.length];
    long[] l_results_2d = new long[l_vals.length*l_vals.length];

    // Loop iterators
    int i, j;

    // static int  abs(int a)
    for (i=0; i < i_vals.length; i++) {
      i_results[i] = StrictMath.abs(i_vals[i]);
    }
    results("int abs(int a)", i_results);

    // static double abs(double a)
    for (i=0; i < d_vals.length; i++) {
      d_results[i] = StrictMath.abs(d_vals[i]);
    }
    results("double abs(double a)", d_results);

    // static float abs(float a)
    for (i=0; i < f_vals.length; i++) {
      f_results[i] = StrictMath.abs(f_vals[i]);
    }
    results("float abs(float a)", f_results);

    // static long abs(long a)
    for (i=0; i < l_vals.length; i++) {
      l_results[i] = StrictMath.abs(l_vals[i]);
    }
    results("long abs(long a)", l_results);

    // static double acos(double a)
    // Returns the arc cosine of a value; the returned angle is in the range 0.0 through pi.
    for (i=0; i < d_vals.length; i++) {
        d_results[i] = StrictMath.acos(d_vals[i]);
    }
    results("double acos(double a)", d_results);

    // static double asin(double a)
    // Returns the arc sine of a value; the returned angle is in the range -pi/2 through pi/2.
    for (i=0; i < d_vals.length; i++) {
        d_results[i] = StrictMath.asin(d_vals[i]);
    }
    results("double asin(double a)", d_results);

    // static double atan(double a)
    // Returns the arc tangent of a value; the returned angle is in the range -pi/2 through pi/2.
    for (i=0; i < d_vals.length; i++) {
        d_results[i] = StrictMath.atan(d_vals[i]);
    }
    results("double atan(double a)", d_results);

    // static double atan2(double y, double x)
    // Returns the angle theta from the conversion of rectangular coordinates (x, y) to polar coordinates (r, theta).
    for (i=0; i < d_vals.length; i++) {
      for (j = 0; j < d_vals.length; j++) {
        d_results_2d[i] = StrictMath.atan2(d_vals[i], d_vals[j]);
      }
    }
    results("double atan2(double a, double b)", d_results_2d);

    // static double cbrt(double a)
    // Returns the cube root of a double value.
    for (i=0; i < d_vals.length; i++) {
        d_results[i] = StrictMath.cbrt(d_vals[i]);
    }
    results("double cbrt(double a)", d_results);

    // static double ceil(double a)
    // Returns the smallest (closest to negative infinity) double value that is greater than or equal to the argument and is equal to a mathematical integer.
    for (i=0; i < d_vals.length; i++) {
      d_results[i] = StrictMath.ceil(d_vals[i]);
    }
    results("double ceil(double a)", d_results);

    // static double cos(double a)
    // Returns the trigonometric cosine of an angle.
    for (i=0; i < d_vals.length; i++) {
        // Some browsers don't return consistent values for this operation
        // (e.g. Firefox on Travis-CI)
        if (d_vals[i] == Double.MAX_VALUE) {
            continue;
        }
        d_results[i] = StrictMath.cos(d_vals[i]);
    }
    results("double cos(double a)", d_results);

    // static double cosh(double x)
    // Returns the hyperbolic cosine of a double value.
    for (i=0; i < d_vals.length; i++) {
        d_results[i] = StrictMath.cosh(d_vals[i]);
    }
    results("double cosh(double a)", d_results);

    // static double exp(double a)
    // Returns Euler's number e raised to the power of a double value.
    for (i=0; i < d_vals.length; i++) {
      d_results[i] = StrictMath.exp(d_vals[i]);
    }
    results("double exp(double a)", d_results);

    // static double expm1(double x)
    // Returns ex -1.
    for (i=0; i < d_vals.length; i++) {
        d_results[i] = StrictMath.expm1(d_vals[i]);
    }
    results("double expm1(double a)", d_results);

    // static double floor(double a)
    // Returns the largest (closest to positive infinity) double value that is less than or equal to the argument and is equal to a mathematical integer.
    for (i=0; i < d_vals.length; i++) {
      d_results[i] = StrictMath.floor(d_vals[i]);
    }
    results("double floor(double a)", d_results);

    // static double IEEEremainder(double f1, double f2)
    // Computes the remainder operation on two arguments as prescribed by the IEEE 754 standard.
    for (i=0; i < d_vals.length; i++) {
      for (j=0; j < d_vals.length; j++) {
        d_results_2d[i] = StrictMath.IEEEremainder(d_vals[i], d_vals[j]);
      }
    }
    results("double IEEEremainder(double a, double b)", d_results_2d);

    // static double log(double a)
    // Returns the natural logarithm (base e) of a double value.
    for (i=0; i < d_vals.length; i++) {
      d_results[i] = StrictMath.log(d_vals[i]);
    }
    results("double log(double a)", d_results);

    // static double log10(double a)
    // Returns the base 10 logarithm of a double value.
    for (i=0; i < d_vals.length; i++) {
      d_results[i] = StrictMath.log10(d_vals[i]);
    }
    results("double log10(double a)", d_results);

    // static double log1p(double x)
    // Returns the natural logarithm of the sum of the argument and 1.

    // static double max(double a, double b)
    // Returns the greater of two double values.
    for (i=0; i < d_vals.length; i++) {
      for (j = 0; j < d_vals.length; j++) {
        d_results_2d[i] = StrictMath.max(d_vals[i], d_vals[j]);
      }
    }
    results("double max(double a, double b)", d_results_2d);

    // static float  max(float a, float b)
    // Returns the greater of two float values.
    for (i=0; i < f_vals.length; i++) {
      for (j = 0; j < f_vals.length; j++) {
        f_results_2d[i] = StrictMath.max(f_vals[i], f_vals[j]);
      }
    }
    results("float max(float a, float b)", f_results_2d);

    // static int  max(int a, int b)
    // Returns the greater of two int values.
    for (i=0; i < i_vals.length; i++) {
      for (j = 0; j < i_vals.length; j++) {
        i_results_2d[i] = StrictMath.max(i_vals[i], i_vals[j]);
      }
    }
    results("int max(int a, int b)", i_results_2d);

    // static long max(long a, long b)
    // Returns the greater of two long values.
    for (i=0; i < l_vals.length; i++) {
      for (j = 0; j < l_vals.length; j++) {
        l_results_2d[i] = StrictMath.max(l_vals[i], l_vals[j]);
      }
    }
    results("long max(long a, long b)", l_results_2d);

    // static double min(double a, double b)
    // Returns the smaller of two double values.
    for (i=0; i < d_vals.length; i++) {
      for (j = 0; j < d_vals.length; j++) {
        d_results_2d[i] = StrictMath.min(d_vals[i], d_vals[j]);
      }
    }
    results("double min(double a, double b)", d_results_2d);

    // static float  min(float a, float b)
    // Returns the smaller of two float values.
    for (i=0; i < f_vals.length; i++) {
      for (j = 0; j < f_vals.length; j++) {
        f_results_2d[i] = StrictMath.min(f_vals[i], f_vals[j]);
      }
    }
    results("float min(float a, float b)", f_results_2d);

    // static int  min(int a, int b)
    // Returns the smaller of two int values.
    for (i=0; i < i_vals.length; i++) {
      for (j = 0; j < i_vals.length; j++) {
        i_results_2d[i] = StrictMath.min(i_vals[i], i_vals[j]);
      }
    }
    results("int min(int a, int b)", i_results_2d);

    // static long min(long a, long b)
    // Returns the smaller of two long values.
    for (i=0; i < l_vals.length; i++) {
      for (j = 0; j < l_vals.length; j++) {
        l_results_2d[i] = StrictMath.min(l_vals[i], l_vals[j]);
      }
    }
    results("long min(long a, long b)", l_results_2d);

    // static double pow(double a, double b)
    // Returns the value of the first argument raised to the power of the second argument.
    for (i=0; i < d_vals.length; i++) {
      for (j=0; j < d_vals.length; j++) {
        d_results[i] = StrictMath.pow(d_vals[i], d_vals[j]);
      }
    }
    results("double pow(double a, double b)", d_results_2d);

    // static double hypot(double a, double b)
    // Returns the value of the first argument raised to the power of 2 + second argument raised to the power of .
    for (i=0; i < d_vals.length; i++) {
      for (j=0; j < d_vals.length; j++) {
        d_results[i] = StrictMath.hypot(d_vals[i], d_vals[j]);
      }
    }
    results("double hypot(double a, double b)", d_results_2d);

    // static double random()
    // Returns a double value with a positive sign, greater than or equal to 0.0 and less than 1.0.
    for (i = 0; i < 10; i++) {
      double rand = StrictMath.random();
      if (rand < 0 || rand >= 1) {
        System.out.println("StrictMath.random(): Return value outside of [0,1): " + rand);
      }
    }

    // static double rint(double a)
    // Returns the double value that is closest in value to the argument and is equal to a mathematical integer.
    for (i=0; i < d_vals.length; i++) {
      d_results[i] = StrictMath.rint(d_vals[i]);
    }
    results("double rint(double a)", d_results);

    // static long round(double a)
    // Returns the closest long to the argument.
    long[] l_for_d_results = new long[d_results.length];
    for (i=0; i < d_vals.length; i++) {
      l_for_d_results[i] = StrictMath.round(d_vals[i]);
    }
    results("long round(double a)", l_for_d_results);

    // static int  round(float a)
    // Returns the closest int to the argument.
    int[] i_for_f_results = new int[f_results.length];
    for (i=0; i < f_vals.length; i++) {
      i_for_f_results[i] = StrictMath.round(f_vals[i]);
    }
    results("int round(float a)", i_for_f_results);

    // static double sin(double a)
    // Returns the trigonometric sine of an angle.
    for (i=0; i < d_vals.length; i++) {
        // Some browsers don't return consistent values for this operation
        // (e.g. Firefox on Travis-CI)
        if (d_vals[i] == Double.MAX_VALUE) {
            continue;
        }
        d_results[i] = StrictMath.sin(d_vals[i]);
    }
    results("double sin(double a)", d_results);

    // static double sinh(double x)
    // Returns the hyperbolic sine of a double value.
    for (i=0; i < d_vals.length; i++) {
        if( d_vals[i] == Double.MIN_VALUE || d_vals[i] == Double.MIN_NORMAL){
            continue;
        }
        d_results[i] = StrictMath.sinh(d_vals[i]);
    }
    results("double sinh(double a)", d_results);

    // static double sqrt(double a)
    // Returns the correctly rounded positive square root of a double value.
    for (i=0; i < d_vals.length; i++) {
      d_results[i] = StrictMath.sqrt(d_vals[i]);
    }
    results("double sqrt(double a)", d_results);

    // static double tan(double a)
    // Returns the trigonometric tangent of an angle.
    for (i=0; i < d_vals.length; i++) {
        // Some browsers don't return consistent values for this operation
        // (e.g. Firefox on Travis-CI)
        if (d_vals[i] == Double.MAX_VALUE) {
            continue;
        }
        d_results[i] = StrictMath.tan(d_vals[i]);
    }
    results("double tan(double a)", d_results);

    // static double tanh(double x)
    // Returns the hyperbolic tangent of a double value.
  }
}
