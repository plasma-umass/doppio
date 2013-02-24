package classes.test;

import java.util.Arrays;
import java.lang.reflect.*;

public class Reflection {

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
         InvocationTargetException {
    Reflection obj = new Reflection();
    Class<Reflection> c = Reflection.class;
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

    // also test MethodUtil (used by rhino)
    Method m = sun.reflect.misc.MethodUtil.getMethod(c,"foo",null);
    System.out.println(m);
  }
}
