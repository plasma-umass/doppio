package classes.test;
import classes.test.shared_classes.*;

import java.lang.invoke.*;
import java.lang.reflect.*;
import java.math.BigDecimal;

/**
 * Tests Method/Field slot lookup. Uses reflection to test lookup.
 */
public class SlotTest {
  private static <U,V,W> U tryInvoke(MethodHandle mh, boolean useExact, U rv, V arg1, W arg2) {
    try {
      if (useExact) {
        return (U) mh.invokeExact(arg1, arg2);
      } else {
        return (U) mh.invoke(arg1, arg2);
      }
    } catch (WrongMethodTypeException e) {
      System.out.println("WrongMethodTypeException: " + e);
    } catch (Throwable t) {
      System.out.println("Caught: " + t);
    }
    return null;
  }

  private static <U,V> U tryInvoke(MethodHandle mh, boolean useExact, U rv, V arg1, int arg2) {
    try {
      if (useExact) {
        return (U) mh.invokeExact(arg1, arg2);
      } else {
        return (U) mh.invoke(arg1, arg2);
      }
    } catch (WrongMethodTypeException e) {
      System.out.println("WrongMethodTypeException: " + e);
    } catch (Throwable t) {
      System.out.println("Caught: " + t);
    }
    return null;
  }

  private static <U,V> U tryInvoke(MethodHandle mh, boolean useExact, U rv, V arg1, byte arg2) {
    try {
      if (useExact) {
        return (U) mh.invokeExact(arg1, arg2);
      } else {
        return (U) mh.invoke(arg1, arg2);
      }
    } catch (WrongMethodTypeException e) {
      System.out.println("WrongMethodTypeException: " + e);
    } catch (Throwable t) {
      System.out.println("Caught: " + t);
      t.printStackTrace();
    }
    return null;
  }

  private static void throwsException(int count) throws Exception {
    // Count indicates desired depth of stack trace past the reflection boundary.
    if (--count == 0) {
      throw new Exception("I throw exceptions.");
    } else {
      throwsException(count);
    }
  }

  public static void main(String[] args) {
    // Map stderr to stdout to prevent nondeterministic interleavings from mucking up test results.
    System.setErr(System.out);
    ISpeak.ISpeakHelperStatic ishs = new ISpeak.ISpeakHelperStatic();
    ishs.accessTest();

    MethodHandles.Lookup lookup = MethodHandles.lookup();
    String[] methodNames = {"speak", "protectedSpeak", "privateSpeak"};
    for (int i = 0; i < methodNames.length; i++) {
      System.out.println("Looking up method " + ishs.getClass().getName() + "." + methodNames[i]);
      try {
        Method m = ishs.getClass().getDeclaredMethod(methodNames[i]);
        System.out.println("\tFound method.");
        m.invoke(ishs);
      } catch (NoSuchMethodException e) {
        System.out.println("\tCould not find method.");
      } catch (IllegalAccessException e) {
        System.out.println("\tIllegalAccessException");
      } catch (InvocationTargetException e) {
        System.out.println("\tInvocationTargetException.");
      }

      System.out.println("MethodHandle:");
      try {
        MethodHandle mh = lookup.findVirtual(ishs.getClass(), methodNames[i], MethodType.methodType(void.class));
        System.out.println("\tInvoke");
        mh.invoke(ishs);
        try {
          System.out.println("\tInvokeExact");
          mh.invokeExact(ishs);
        } catch (WrongMethodTypeException e) {
          System.out.println("WrongMethodTypeException: " + e);
        }
      } catch (NoSuchMethodException e) {
        System.out.println("\tNoSuchMethodException");
      } catch (IllegalAccessException e) {
        System.out.println("\tIllegalAccessException");
      } catch (Throwable t) {
        System.out.println("\tCaught exception: " + t);
      }
    }

    // Adapted from http://www.slideshare.net/hendersk/method-handles-in-java
    MethodType mt = MethodType.methodType (BigDecimal.class, int.class);
    try {
      MethodHandle power = lookup.findVirtual(BigDecimal.class, "pow", mt);
      BigDecimal p = tryInvoke(power, false, BigDecimal.ONE, new BigDecimal(5), 2);
      p = tryInvoke(power, false, BigDecimal.ONE, new BigDecimal(5), (byte) 2);
      // Invoke will convert boxed values into primitives.
      p = tryInvoke(power, false, BigDecimal.ONE, new BigDecimal(5), new Integer(2));
      p = tryInvoke(power, true, BigDecimal.ONE, new BigDecimal(5), 2);
      // InvokeExact failures:
      p = tryInvoke(power, true, BigDecimal.ONE, new BigDecimal(5), (byte) 2);
      p = tryInvoke(power, true, BigDecimal.ONE, new BigDecimal(5), new Integer(2));
      // InvokeExact fails even if its just the RV that is different:
      Object o = tryInvoke(power, true, new Object(), new BigDecimal(5), 2);
      // Try completely incorrect values w/ invoke non-exact.
      o = tryInvoke(power, false, new Object(), new Object(), new Object());
    } catch (NoSuchMethodException e) {
      System.out.println("No such method: " + e);
    } catch (IllegalAccessException e) {
      System.out.println("IllegalAccessException: " + e);
    }

    // Call a method that throws an exception through reflection and MHs.
    mt = MethodType.methodType(void.class, int.class);
    System.out.println("Throwing exception through reflection...");
    try {
      MethodHandle te = lookup.findStatic(SlotTest.class, "throwsException", mt);
      System.out.println("Invoke:");
      try {
        te.invoke(4);
      } catch (Throwable t) {
        System.out.println("Caught exception: " + t);
        t.printStackTrace();
      }
      System.out.println("InvokeExact:");
      try {
        te.invokeExact(4);
      } catch (Throwable t) {
        System.out.println("Caught exception: " + t);
        t.printStackTrace();
      }
      Method m = SlotTest.class.getDeclaredMethod("throwsException", int.class);
      System.out.println("Reflection:");
      try {
        m.invoke(null, 4);
      } catch (Throwable t) {
        System.out.println("Caught exception: " + t);
        // Difference in stack trace line numbers. :(
        // t.printStackTrace();
      }
    } catch (NoSuchMethodException e) {
      System.out.println("No such method: " + e);
    } catch (IllegalAccessException e) {
      System.out.println("IllegalAccessException: " + e);
    }

    // Attempt to call invoke and friends from Reflection (should throw exception).
    // invokeExact([Ljava/lang/Object;)Ljava/lang/Object;
    mt = MethodType.methodType(Object.class, Object[].class);
    System.out.println("Attempting to call invoke methods via reflection...");
    try {
      Method invokeExactMethod = MethodHandle.class.getDeclaredMethod("invokeExact", Object[].class);
      Method invokeMethod = MethodHandle.class.getDeclaredMethod("invoke", Object[].class);
      MethodHandle invoke = lookup.findVirtual(MethodHandle.class, "invoke", mt);

      for (Method m : new Method[]{invokeMethod, invokeExactMethod}) {
        try {
          System.out.println("Via reflection...");
          m.invoke(invoke, new Object[]{new Object[]{}});
        } catch (UnsupportedOperationException e) {
          System.out.println("UnsupportedOperationException: " + e);
        } catch (InvocationTargetException e) {
          Throwable cause = e.getCause();
          System.out.println("InvocationTargetException cause: " + cause);
        }
        try {
          System.out.println("Trying to unreflect...");
          MethodHandle mh = lookup.unreflect(m);
          mh.invoke(mh, new Object[]{new Object[]{}});
        } catch (UnsupportedOperationException e) {
          System.out.println("UnsupportedOperationException: " + e);
        }
      }
    } catch (NoSuchMethodException e) {
      System.out.println("No such method: " + e);
    } catch (IllegalAccessException e) {
      System.out.println("IllegalAccessException: " + e);
    } catch (Throwable t) {
      System.out.println("Caught exception: " + t);
      t.printStackTrace();
    }

    // TODO:
    // - Call virtual methods.
    // - Call interface methods.
    // - Call constructor.
    // - Call static methods.
  }
}
