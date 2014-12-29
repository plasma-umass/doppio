package classes.test.shared_classes;

import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodType;
import java.lang.invoke.WrongMethodTypeException;
import java.lang.reflect.*;
import java.lang.invoke.MethodHandles;

/**
 * Dumb test interface with a default method implementation.
 */
public interface ISpeak {
  default void speak() {
    System.out.println("ISpeak Speaking!");
  }

  public static ISpeak[] getSpeakers() {
    return new ISpeak[]{ new InnerSpeakImpl(), new ISpeakHelper(), new ISpeakHelperStatic(), new SpeakImpl(), new SpeakImplChild(), new SpeakImplChildChild(), new NaturalSpeakerChild(), new EmptySpeakImpl(), new EmptySpeakImplChild(), getAnonymousClass() };
  }

  public static ISpeak getAnonymousClass() {
    return new ISpeak() { public void speak() { System.out.println("Anonymous Speak Class!"); } };
  }

  /**
   * Tests access to the specific field. Attempts to read and set the new field to an appropriate, and a bad
   * value.
   */
  default void testField(Class clazz, String fieldName, Object instance, Object newValue, Object badNewValue) {
    System.out.println(clazz.getCanonicalName() + ":" + fieldName);
    try {
      Field f = clazz.getDeclaredField(fieldName);
      System.out.println("\tFound!");
      Object val = f.get(instance);
      System.out.println("\tVal: " + val);
      f.set(instance, newValue);
      System.out.println("\tSet value. Matches? " + (f.get(instance) == newValue));
      f.set(instance, badNewValue);
    } catch (NoSuchFieldException e) {
      System.out.println("NoSuchFieldException");
    } catch (IllegalAccessException e) {
      System.out.println("IllegalAccessException");
    }
  }

  default void testMethod(MethodHandles.Lookup lookup, Class clazz, String methodName, Object instance) {
    // Reflection invoke
    System.out.println(clazz.getCanonicalName() + ": " + methodName);
    System.out.println("\tReflection:");
    try {
      Method m = clazz.getDeclaredMethod(methodName);
      System.out.println("\t\tFound!");
      m.invoke(instance);
    } catch (NoSuchMethodException e) {
      System.out.println("\t\tNo such method!");
    } catch (IllegalAccessException e) {
      System.out.println("\t\tIllegalAccessException.");
    } catch (InvocationTargetException e) {
      System.out.println("\t\tInvocationTargetException...?");
    }

    // MethodHandle invoke
    try {
      System.out.println("\tMethodHandle Lookup:");
      MethodHandle handle = lookup.findVirtual(clazz, methodName, MethodType.methodType(void.class));
      System.out.println("\tInvoke:");
      handle.invoke(instance);
      try {
        System.out.println("\tInvokeExact");
        handle.invokeExact(instance);
      } catch (WrongMethodTypeException e) {
        System.out.println("WrongMethodTypeException: " + e);
      }
      // Try to fix the method handle to be *exact*.
      System.out.println("\tInvokeExact as ISpeak:");
      handle.invokeExact((ISpeak) instance);
    } catch (NoSuchMethodException e) {
      System.out.println("\t\tNo such method!");
    } catch (IllegalAccessException e) {
      System.out.println("\t\tIllegalAccessExcetpion");
    } catch (Throwable e) {
      System.out.println("\t\tEncountered throwable: " + e);
    }
  }

  default void runAccessTest(MethodHandles.Lookup lookup, Class[] classes, String[] methodNames) {
    for (int i = 0; i < classes.length; i++) {
      Class clazz = classes[i];
      try {
        Object instance = clazz.newInstance();
        for (int j = 0; j < methodNames.length; j++) {
          testMethod(lookup, clazz, methodNames[j], instance);
        }
      } catch (IllegalAccessException e) {
        System.out.println("Illegal access exception for constructor of class " + clazz.getCanonicalName());
      } catch (InstantiationException e) {
        System.out.println("InstantiationException for class " + clazz.getCanonicalName());
      }
    }
  }

  /**
   * Part of a unit test. Checks if ISpeak can reflectively retrieve and invoke various methods.
   * ISpeak should be able to access and invoke private/protected/public methods of inner classes, but not
   * the private methods of other classes.
   */
  default void accessTest() {
    MethodHandles.Lookup lookup = MethodHandles.lookup();
    // Test part 1: Test ability to access various methods.
    String[] methodNames = {"speak", "protectedSpeak", "privateSpeak"};
    Class[] classes = { ISpeakHelper.class, ISpeakHelperStatic.class, InnerSpeakImpl.class };
    runAccessTest(lookup, classes, methodNames);

    // Test part 2: Test ability to invoke various methods.
    Class[] speakImpls = { ISpeakHelper.class, ISpeakHelperStatic.class, SpeakImpl.class, SpeakImplChild.class, SpeakImplChildChild.class, NaturalSpeakerChild.class, EmptySpeakImpl.class, EmptySpeakImplChild.class };
    runAccessTest(lookup, speakImpls, new String[]{"speak"});

    // Test part 3: Test ability to invoke default Object methods on interfaces.
    testMethod(lookup, ISpeak.class, "getClass", this);
    testMethod(lookup, ISpeak.class, "clone", this);

    // Test part 4: Anonymous inner class.
    testMethod(lookup, ISpeak.class, "speak", getAnonymousClass());

    // Test part 5: IFace invocation, which should trigger class lookup.
    for (Class speakImpl : speakImpls) {
      try {
        testMethod(lookup, ISpeak.class, "speak", speakImpl.newInstance());
      } catch (IllegalAccessException e) {
        System.out.println("IllegalAccessException constructing " + speakImpl.getCanonicalName());
      } catch (InstantiationException e) {
        System.out.println("InstantiationException constructing: " + speakImpl.getCanonicalName());
      }
    }

    // Test part 6: Catching exception thrown through interface.
  }

  // Inner class.
  public class ISpeakHelper implements ISpeak {
    public void speak() {
      System.out.println("ISpeakHelper speaking!");
    }

    protected void protectedSpeak() {
      System.out.println("Protected ISpeakHelper speak!");
    }

    private void privateSpeak() {
      System.out.println("Private ISpeakHelper speak!");
    }
  }

  // Static nested class.
  public static class ISpeakHelperStatic implements ISpeak {
    public void speak() {
      System.out.println("ISpeakHelperStatic speaking!");
    }

    protected void protectedSpeak() {
      System.out.println("Protected ISpeakHelperStatic speak!");
    }

    private void privateSpeak() {
      System.out.println("Private ISpeakHelperStatic speak!");
    }
  }
}

interface ISpeak2 extends ISpeak {
  default void speak() {
    System.out.println("ISpeak2 Speaking!");
  }
}

/**
 * Inaccessible outside of package.
 */
class InnerSpeakImpl implements ISpeak {
  public void speak() {
    System.out.println("InnerSpeakImpl Speaking!");
  }

  protected void protectedSpeak() {
    System.out.println("Protected InnerSpeakImpl speak!");
  }

  private void privateSpeak() {
    System.out.println("Private InnerSpeakImpl speak!");
  }
}

class SpeakImpl implements ISpeak2 {
  public void speak() {
    ISpeak2.super.speak();
    new InnerSpeakImpl().speak();
    System.out.println("SpeakImpl speak");
  }
}
class SpeakImplChild extends SpeakImpl {
  public void speak() {
    System.out.println("SpeakImplChild speak");
    super.speak();
  }
}
class SpeakImplChildChild extends SpeakImplChild implements ISpeak {
  // Do nothing. A bad method lookup algorithm will use the default ISpeak speak method
  // rather than the parent class's.
}
class NaturalSpeaker {
  public void speak() {
    System.out.println("Natural speaker.");
  }
}
class NaturalSpeakerChild extends NaturalSpeaker implements ISpeak {}
class EmptySpeakImpl implements ISpeak2 {}
// Below class is ambiguous. HotSpot invokes ISpeak2.speak rather than ISpeak.speak.
class EmptySpeakImplChild extends EmptySpeakImpl implements ISpeak {}
