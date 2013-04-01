package classes.special_test;

import java.io.*;
import java.lang.reflect.*;

public class EndToEnd {

  static void testJavap()
  throws NoSuchMethodException, IllegalAccessException, InvocationTargetException {
    // We have to do some manuevers because javap has a terrible interface:
    // * calling the main method calls System.exit
    // * calling the provided 'entry' method closes System.out !
    // So we have to hack around privacy restrictions and do it ourselves.
    PrintWriter out = new PrintWriter(new OutputStreamWriter(System.out));
    sun.tools.javap.Main javap = new sun.tools.javap.Main(out);
    String[] args = {"-help"};
    Method perform = javap.getClass().getDeclaredMethod("perform",args.getClass());
    perform.setAccessible(true);  // it's private
    perform.invoke(javap, (Object)args);
    out.flush();

    // test with an actual class
    args[0] = "classes/special_test/EndToEnd";
    perform.invoke(javap, (Object)args);
    out.flush();
  }

  static void testJavac() {
    String[] args = {};
    classes.util.Javac.main(args);
    String[] args2 = {"classes/special_test/EndToEnd.java"};
    classes.util.Javac.main(args2);
  }

  static void testRhino() {
    String[] args = {"-help"};
    try {
      com.sun.tools.script.shell.Main.main(args);
    } catch (SecurityException e) {
      System.out.println(e);
    }

    //String[] args2 = {"-e", "function foo(x){ return x*x; }; println(foo(5));"};
    String[] args2 = {"-e", "println(25);"};
    try {
      com.sun.tools.script.shell.Main.main(args2);
    } catch (SecurityException e) {
      System.out.println(e);
    }
  }

  public static void main(String[] args)
  throws NoSuchMethodException, IllegalAccessException, InvocationTargetException {
    testJavap();
    testJavac();

    // rhino calls System.exit, and there's no easy way around it
    System.setSecurityManager(new SecurityManager(){
      public void checkExit(int status) {
        super.checkExit(status);
        throw new SecurityException("Got exit code "+status);
      }
    });
    testRhino();
  }

}
