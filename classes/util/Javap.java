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
    // We have to do some manuevers because javap has a terrible interface:
    // * calling the main method calls System.exit
    // * calling the provided 'entry' method closes System.out !
    // So we have to hack around privacy restrictions and do it ourselves.
    PrintWriter out = new PrintWriter(new OutputStreamWriter(System.out));
    sun.tools.javap.Main javap = new sun.tools.javap.Main(out);
    Method perform = javap.getClass().getDeclaredMethod("perform",args.getClass());
    perform.setAccessible(true);  // it's private
    perform.invoke(javap, (Object)args);
    out.flush();
  }
}

