package classes.special_test;

import classes.doppio.JavaScript;

public class EvalTest {
  public static void main(String[] args) throws Exception {
    String constructorTest = "  var failure_fn = function(e_cb, success_cb, except_cb) {\n"
      + "    except_cb(e_cb);\n"
      + "  };\n"
      + "  var dbl_cls = rs.get_bs_class('Ljava/lang/Double;');\n"
      + "  var cons = dbl_cls.get_method('<init>(D)V');\n"
      + "  rs.call_bytecode(dbl_cls, cons, [0.1, null], function(dbl, success_cb, except_cb) {\n"
      + "    // Success!\n"
      + "    // Call toString() method on the double, return that.\n"
      + "    var tstr = dbl_cls.get_method('toString()Ljava/lang/String;');\n"
      + "    rs.call_bytecode(dbl_cls, tstr, [dbl], function(str) {\n"
      + "      success_cb(str);\n"
      + "    }, failure_fn);\n"
      + "  }, failure_fn);";
    String[] tests = new String[]{"'Hello World!'", "null", "undefined", "3", "3.3", "false", "Math.ceil(3.4)", constructorTest};
    String[] expected = new String[]{"Hello World!", null, null, "3", "3.3", "false", "4", "0.1"};

    for (int i = 0; i < tests.length; i++) {
      String result = JavaScript.eval(tests[i]);
      if (result != expected[i] && (result == null || !result.equals(expected[i]))) {
        throw new Exception("Error: Result for " + tests[i] + " did not match expected value.\n\tExpected: " + expected[i] + "\n\tReceived: " + result);
      }
    }
    System.out.println("Pass.");
  }
}
