package classes.test;

import java.util.Arrays;
import java.lang.reflect.*;
import java.io.*;

public class Reflection {

  public String goodString = "I'm a good string";
  public static final String constValue = "I'm a constant";
  public static final int constInt = 23;
  public static final float constFloat = 2.45f;
  public static final double constDouble = 1.4567;
  public static final long constLong = 8394834397L;
  public static final short constShort = 12;
  public static final boolean constBool = true;

  public static long add(long a, long b) {
    return a + b;
  }

  public static Long add(Long a, Long b) {
    return new Long(a.longValue() + b.longValue());
  }

  public static void foo() {
    System.out.println("called foo");
  }

  public static void main(String[] args)
  throws ClassNotFoundException, NoSuchMethodException, IllegalAccessException,
         InvocationTargetException, NoSuchFieldException {
    // repro for Jython bug
    SubClass sub = new SubClass();
    Field subf = Reflection.class.getDeclaredField("goodString");
    System.out.println(subf.get(sub));

    Reflection obj = new Reflection();
    Class<Reflection> c = Reflection.class;

    // test the ability to reflectively get constants, which are usually baked
    // in to bytecodes by the compiler
    Field f = c.getField("constValue");
    System.out.println(f.get(null));
    Field f2 = c.getField("constInt");
    System.out.println(f2.get(null));
    Field f3 = c.getField("constFloat");
    System.out.println(f3.get(null));
    Field f4 = c.getField("constDouble");
    System.out.println(f4.get(null));
    Field f5 = c.getField("constLong");
    System.out.println(f5.get(null));
    Field f6 = c.getField("constShort");
    System.out.println(f6.get(null));
    Field f7 = c.getField("constBool");
    System.out.println(f7.get(null));

    Method bytecodeMethod = c.getClass().getMethod("toString");
    Method nativeMethod = c.getClass().getMethod("isArray");
    Method nativeMethodWithArgs = c.getClass().getMethod("isInstance", Object.class);
    Method unboxingMethod = c.getMethod("add", long.class, long.class);
    Method boxingMethod = c.getMethod("add", Long.class, Long.class);
    Method voidMethod = c.getMethod("foo");
    // regular method reflected invocation
    System.out.println("toString: " + bytecodeMethod.invoke(c));
    // native method reflected invocation
    System.out.println("is array? " + nativeMethod.invoke(c));
    // native method reflected invocation with parameters
    System.out.println("is instance? " + nativeMethodWithArgs.invoke(c, obj));
    // unboxing has to be handled specially by our native method invoker
    Long a = new Long(40L);
    Long b = new Long(2L);
    System.out.println("unboxing: " + unboxingMethod.invoke(null, a, b));
    // boxing is handled by javac
    System.out.println("boxing: " + boxingMethod.invoke(null, 1300L, 37L));
    // void return values
    System.out.println("void return: " + voidMethod.invoke(null));
  }

  static class SubClass extends Reflection {
    public String badString = "I'm a bad string";
  }
}
