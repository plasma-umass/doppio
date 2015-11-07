package classes.test;

import java.lang.invoke.*;

/**
 * Tests Java's new signature polymorphic methods.
 * The below code generates invokevirtual instructions that involve
 * signature polymorphic methods.
 */
public class SignaturePolymorphicTest {
  private static void assertEquals(Object a, Object b) {
    System.out.println(a);
    System.out.println(b);
    assert(a.equals(b));
  }
  
  static class SomeClass {
    public String varArgsCombo(int i, int j, String... args) {
      System.out.print("I: ");
      System.out.print(i);
      System.out.print(" J: ");
      System.out.println(j);
      for (int z = 0; z < args.length; z++) {
        System.out.println(args[z]);
      }
      if (args.length > 0) {
        return args[0];
      } else {
        return "None";
      }
    }
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
    
    SomeClass sc = new SomeClass();
    mt = MethodType.methodType(String.class, int.class, int.class, String[].class);
    mh = lookup.findVirtual(SomeClass.class, "varArgsCombo", mt);
    System.out.println(mh.invoke(sc, 1, 2, "r", "lol", "zla"));
    String[] strArgs = {"r", "lol", "zla"};
    System.out.println(mh.invoke(sc, 1, 2, strArgs));
    System.out.println(mh.invoke(sc, 1, 2));
  }
}
