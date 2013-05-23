package classes.special_test;

import classes.doppio.JavaScript;

public class EvalTest {
  public static void main(String[] args) throws Exception {
    String[] tests = new String[]{"'Hello World!'", "null", "undefined", "3", "3.3", "false"};
    String[] expected = new String[]{"Hello World!", null, null, "3", "3.3", "false"};

    for (int i = 0; i < tests.length; i++) {
      String result = JavaScript.eval(tests[i]);
      if (result != expected[i] && !result.equals(expected[i])) {
        throw new Exception("Error: Result for " + tests[i] + " did not match expected value.");
      }
    }
    System.out.println("Pass.");
  }
}
