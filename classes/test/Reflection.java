package classes.test;

import java.util.Arrays;
import java.lang.reflect.*;

public class Reflection {

  public static long add(long a, long b) {
    return a + b;
  }

  public static void main(String[] args)
  throws ClassNotFoundException, NoSuchMethodException, IllegalAccessException,
         InvocationTargetException {
    Reflection obj = new Reflection();
    Class c = Reflection.class;
    Method bytecodeMethod = c.getClass().getMethod("toString");
    Method nativeMethod = c.getClass().getMethod("isArray");
    Method nativeMethodWithArgs = c.getClass().getMethod("isInstance", Object.class);
    Method unboxingMethod = c.getMethod("add", long.class, long.class);
    // regular method reflected invocation
    System.out.println("toString: " + bytecodeMethod.invoke(c));
    // native method reflected invocation
    System.out.println("is array? " + nativeMethod.invoke(c));
    // native method reflected invocation with parameters
    System.out.println("is instance? " + nativeMethodWithArgs.invoke(c, obj));
    // unboxing
    Long a = new Long(40L);
    Long b = new Long(2L);
    System.out.println("unboxing: " + unboxingMethod.invoke(null, a, b));
  }
}
