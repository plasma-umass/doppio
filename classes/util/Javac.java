package classes.util;

import javax.tools.*;

public class Javac {
  public static void main(String[] args) {
    if (args.length < 1) {
      System.out.println("Syntax: java Javac [classes]");
      return;
    }
    JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
    int result = compiler.run(null, null, null, args);
    if (result != 0) {
      System.out.println("Compiler failed.");
    }
  }
}
