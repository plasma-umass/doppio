package classes.test;

import java.lang.invoke.*;

/**
 * Tests Java's new variadic / signature polymorphic methods.
 * The below code generates invokevirtual instructions that involve
 * signature polymorphic methods.
 */
public class SignaturePolymorphicTest {
  private static void assertEquals(Object a, Object b) {
    assert(a == b);
  }

  public static void main(String[] args) throws NoSuchMethodException, IllegalAccessException, Throwable {
    // Example code from MethodHandle Javadoc.
    Object x, y; String s; int i;
    MethodType mt; MethodHandle mh;
    MethodHandles.Lookup lookup = MethodHandles.lookup();
    // mt is (char,char)String
    mt = MethodType.methodType(String.class, char.class, char.class);
    mh = lookup.findVirtual(String.class, "replace", mt);
    s = (String) mh.invokeExact("daddy",'d','n');
    // invokeExact(Ljava/lang/String;CC)Ljava/lang/String;
    assertEquals(s, "nanny");
    // weakly typed invocation (using MHs.invoke)
    s = (String) mh.invokeWithArguments("sappy", 'p', 'v');
    assertEquals(s, "savvy");
    // mt is (Object[])List
    mt = MethodType.methodType(java.util.List.class, Object[].class);
    mh = lookup.findStatic(java.util.Arrays.class, "asList", mt);
    assert(mh.isVarargsCollector());
    x = mh.invoke("one", "two");
    // invoke(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/Object;
    assertEquals(x, java.util.Arrays.asList("one","two"));
    // mt is (Object,Object,Object)Object
    mt = MethodType.genericMethodType(3);
    mh = mh.asType(mt);
    x = mh.invokeExact((Object)1, (Object)2, (Object)3);
    // invokeExact(Ljava/lang/Object;Ljava/lang/Object;Ljava/lang/Object;)Ljava/lang/Object;
    assertEquals(x, java.util.Arrays.asList(1,2,3));
    // mt is ()int
    mt = MethodType.methodType(int.class);
    mh = lookup.findVirtual(java.util.List.class, "size", mt);
    i = (int) mh.invokeExact(java.util.Arrays.asList(1,2,3));
    // invokeExact(Ljava/util/List;)I
    assert(i == 3);
    mt = MethodType.methodType(void.class, String.class);
    mh = lookup.findVirtual(java.io.PrintStream.class, "println", mt);
    mh.invokeExact(System.out, "Hello, world.");
    // invokeExact(Ljava/io/PrintStream;Ljava/lang/String;)V
  }
}
