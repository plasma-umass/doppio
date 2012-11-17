package classes.test;

import java.lang.reflect.*;

class Clinit {
  public static void main(String[] args) throws ClassNotFoundException {
    System.out.println("Declared methods for class ClinitBar:");
    Method[] methods = ClinitBar.class.getDeclaredMethods();
    for (Method m : methods) {
      System.out.println(m.getName());
    }
    System.out.println("\nPublic methods for class ClinitBar:");
    methods = ClinitBar.class.getMethods();
    for (Method m : methods) {
      System.out.println(m.getName());
    }
  }
}

class ClinitFoo {
  static {
    // should not get called
    System.out.println("initializing class ClinitFoo");
  }
  void foo() {};
  public void pubFoo() {};
}

class ClinitBar extends ClinitFoo {
  static {
    // should not get called
    System.out.println("initializing class ClinitBar");
  }
  void bar() {};
  public void pubBar() {};
}
