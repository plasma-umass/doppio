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

  public static Object classInMethod() {
    class InMethod{};
    return new InMethod();
  }

  public static void main(String[] args)
  throws ClassNotFoundException, NoSuchMethodException, IllegalAccessException,
         InvocationTargetException, NoSuchFieldException {
    // test multiNewArray
    int[] arr = (int[]) Array.newInstance(int.class, 4);
    System.out.println(Arrays.toString(arr));
    int[][] mat = (int[][]) Array.newInstance(int.class, 2, 3);
    System.out.println(Arrays.deepToString(mat));

    // test getEnclosingMethod0
    System.out.println(Reflection.class.getEnclosingMethod());
    System.out.println(Reflection.classInMethod().getClass().getEnclosingMethod());

    // repro for Jython bug
    SubClass sub = new SubClass();
    Field subf = Reflection.class.getDeclaredField("goodString");
    System.out.println(subf.get(sub));

    // repro for beanshell bug
    Method iface_method = Iface.class.getMethod("inYourIface", Object.class);
    iface_method.invoke(sub, "foo");

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

    System.out.println("Testing java.lang.reflect.Array.set");
    byte[] byteArr = new byte[1];
    Array.set(byteArr, 0, new Byte((byte)1));
    System.out.println(byteArr[0]);

    char[] charArr = new char[1];
    Array.set(charArr, 0, new Character('a'));
    System.out.println(charArr[0]);

    double[] doubleArr = new double[1];
    Array.set(doubleArr, 0, new Double(1));
    System.out.println(doubleArr[0]);

    float[] floatArr = new float[1];
    Array.set(floatArr, 0, new Float(1));
    System.out.println(floatArr[0]);

    int[] intArr = new int[1];
    Array.set(intArr, 0, new Integer(1));
    System.out.println(intArr[0]);

    long[] longArr = new long[1];
    Array.set(longArr, 0, new Long(1));
    System.out.println(longArr[0]);

    short[] shortArr = new short[1];
    Array.set(shortArr, 0, new Short((short)1));
    System.out.println(shortArr[0]);

    boolean[] boolArr = new boolean[1];
    Array.set(boolArr, 0, new Boolean(true));
    System.out.println(boolArr[0]);

    // no unboxing should occur here.
    Integer[] integerArr = new Integer[1];
    Array.set(integerArr, 0, new Integer(1));
    System.out.println(integerArr[0].getClass().getName());
    System.out.println(integerArr[0]);

    System.out.println("Checking Array.set's exceptions");

    try {
      Array.set(charArr, 1, new Character('a'));
    }
    catch (ArrayIndexOutOfBoundsException e) {
      System.out.println("Caught ArrayIndexOutOfBoundsException");
    }

    try {
      Array.set(charArr, -1, new Character('a'));
    }
    catch (ArrayIndexOutOfBoundsException e) {
      System.out.println("Caught ArrayIndexOutOfBoundsException");
    }

    try {
      Array.set(byteArr, 0, new Character('a'));
    }
    catch (IllegalArgumentException e) {
      System.out.println("Caught IllegalArgumentException");
    }

    try {
      // not a subclass
      Array.set(integerArr, 0, "foo");
    } catch (IllegalArgumentException e) {
      System.out.println("Caught IllegalArgumentException");
    }

    // The docs don't say which exception should be thrown if we have both an
    // illegal index as well as an illegal argument. Let's just match HotSpot's
    // behavior.
    try {
      Array.set(byteArr, 1, new Character('a'));
    }
    catch (ArrayIndexOutOfBoundsException e) {
      System.out.println("Caught ArrayIndexOutOfBoundsException");
    }

    System.out.println("Testing java.lang.reflect.Array.get*");
    System.out.println(Array.getLength(byteArr));
    System.out.println(Array.getByte(byteArr, 0));
    System.out.println(Array.getChar(charArr, 0));
    System.out.println(Array.getDouble(doubleArr, 0));
    System.out.println(Array.getFloat(floatArr, 0));
    System.out.println(Array.getInt(intArr, 0));
    System.out.println(Array.getLong(longArr, 0));
    System.out.println(Array.getShort(shortArr, 0));
    System.out.println(Array.getBoolean(boolArr, 0));
    // no unboxing should occur here.
    System.out.println(Array.get(integerArr, 0).getClass().getName());
    // boxing should occur here.
    System.out.println(Array.get(intArr, 0).getClass().getName());

    System.out.println("Checking Array.get*'s exceptions");
    try {
      Array.getChar(charArr, 1);
    }
    catch (ArrayIndexOutOfBoundsException e) {
      System.out.println("Caught ArrayIndexOutOfBoundsException");
    }
    try {
      Array.getChar(charArr, -1);
    }
    catch (ArrayIndexOutOfBoundsException e) {
      System.out.println("Caught ArrayIndexOutOfBoundsException");
    }

    // Primitive classes, array classes, and modifiers.
    Class arrayByteClass = Class.forName("[B");
    System.out.println(arrayByteClass.getName());
    System.out.println(arrayByteClass.getCanonicalName());
    System.out.println(arrayByteClass.getModifiers());
    Class byteClass = arrayByteClass.getComponentType();
    System.out.println(byteClass.getName());
    System.out.println(byteClass.getCanonicalName());
    System.out.println(byteClass.getModifiers());
  }

  interface Iface {
    public void inYourIface(Object o);
  }

  static class SubClass extends Reflection implements Iface {
    public String badString = "I'm a bad string";
    public void inYourIface(Object o) {
      System.out.println("called interface'd method inYourIface: "+o);
    }
  }
}
