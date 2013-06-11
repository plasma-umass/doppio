package classes.doppio;

public class JavaScript {
  /*
   * Runs the given JavaScript code, and returns the String result. Returns
   * 'null' if the return value cannot be coerced into a String.
   */
  public static native String eval(String jsCode);
}