package classes.util;

import java.io.*;
import java.lang.reflect.*;

public class Javap {
  public static void main(String[] args)
  throws NoSuchMethodException, IllegalAccessException, InvocationTargetException {
    if (args.length < 1) {
      System.out.println("Syntax: java Javap [classes]");
      return;
    }
    for (int i=0; i<args.length; i++) {
      String arg = args[i];
      if (arg.endsWith(".class")) {
        int n = arg.length();
        args[i] = arg.substring(0,n-6);
      }
    }
    runJavap(args);
  }

  static void runJavap(String[] args)
  throws NoSuchMethodException, IllegalAccessException, InvocationTargetException {
    com.sun.tools.javap.Main.main(args);
  }
}
