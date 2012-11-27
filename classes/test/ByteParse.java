package classes.test;

/* check that we're reading in bytes / shorts correctly from the classfile */
class ByteParse {
  static boolean IsByte(int value) {
    return Byte.MIN_VALUE <= value && value <= Byte.MAX_VALUE;
  }
  static boolean IsShort(int value) {
    return Short.MIN_VALUE <= value && value <= Short.MAX_VALUE;
  }
  public static void main(String[] args) {
    byte testBytes[] = {0, -128, 127};
    for (byte aVal : testBytes) {
      System.out.println("Is " + aVal + " a byte? " + IsByte(aVal));
    }
    short testShorts[] = {0, -32768, 32767};
    for (short aShort : testShorts) {
      System.out.println("Is " + aShort + " a short? " + IsShort(aShort));
    }
  }
}
