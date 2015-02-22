package classes.test;

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

    extremeValues();  // Not just ints, but it's close enough.

    // Edge-case conversion that caused an issue before.
    System.out.println("Character.digit(48, 10): " + Character.digit((char) 48, 10));
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
    a++;
    b--;
    System.out.println("a++ = " + a + ", b-- = " + b);
  }

  public static void extremeValues() {
    byte a; int b; short c;
    System.out.println("Extreme bytes:");
    for (a = 127; a > 1; a++) System.out.println(a);
    for (a = -127; a < 0; a--) System.out.println(a);
    System.out.println("Extreme ints:");
    for (b = 2147483647; b > 1; b++) System.out.println(b);
    for (b = -2147483647; b < 0; b--) System.out.println(b);
    System.out.println("Extreme shorts:");
    for (c = 32767; c > 1; c++) System.out.println(c);
    for (c = -32767; c < 0; c--) System.out.println(c);
  }
}
