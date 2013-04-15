package classes.test;

import java.lang.reflect.*;
import java.io.*;

/*
 * Compile this file by copying it to $DOPPIO_DIR/classes/test.
 */

public class CatchBootstrapExceptions {
  // the IOException declaration is just there so we can inspect the order that
  // the classes referenced from method attributes get loaded
  public static void catcher(Character c) throws IOException {
    try {
      System.out.println("Starting catcher");
      CustomClassLoader2.throwBootstrapException();
    }
    catch (CustomClassLoader2.CustomException e) {
      System.out.println("Caught exception originating in bootstrap-loaded code.");
    }
    CatchBootstrapExceptions2.catcher();
  }
}

class CatchBootstrapExceptions2 {
  public static void catcher() {
    try {
      CustomClassLoader2.throwBootstrapException2();
    }
    catch (CustomClassLoader2.CustomException2 e) {
      System.out.println("Caught another exception originating in bootstrap-loaded code.");
    }
  }
}
