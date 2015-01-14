
package classes.test;

import java.lang.reflect.Field;
import sun.misc.Unsafe;
import classes.test.Interfaces;

/* Still needs to be tested:
defineClass(Ljava/lang/String;[BIILjava/lang/ClassLoader;Ljava/security/ProtectionDomain;)Ljava/lang/Class;
*/

public class UnsafeOps {

  public static Unsafe getUnsafe() {
    try {
      Field f = Unsafe.class.getDeclaredField("theUnsafe");
      f.setAccessible(true);
      return (Unsafe)f.get(null);
    } catch (Exception e) {
      return null;
    }
  }

  public static void main(String[] args) {
    Unsafe unsafe = getUnsafe();
    // These will vary from platform to platform,
    // so just make sure they exist
    int addrSize = unsafe.addressSize();
    int abo = unsafe.arrayBaseOffset(int[].class);
    int ais = unsafe.arrayIndexScale(int[].class);

    Object f;
    try {
      f = unsafe.allocateInstance(Foo.class);
      System.out.println(((Foo)f).a);
      System.out.println(((Foo)f).b);
      System.out.println(((Foo)f).c);
    } catch (InstantiationException e) {
      System.out.println(e);
      return;
    }

    Field fc;
    try {
      fc = Foo.class.getDeclaredField("c");
    } catch (NoSuchFieldException e) {
      System.out.println(e);
      return;
    }
    long offset = unsafe.objectFieldOffset(fc);
    System.out.println(unsafe.getObject(f,offset));
    unsafe.putObject(f,offset, "hello Unsafe");
    System.out.println(unsafe.getObject(f,offset));
    System.out.println(((Foo)f).c);
    String newC = "hello again Unsafe";
    unsafe.putOrderedObject(f,offset,newC);
    System.out.println(unsafe.getObject(f,offset));
    System.out.println(((Foo)f).c);

    {  // test compareAndSwapObject
      boolean updated = unsafe.compareAndSwapObject(f,offset,"not newC","whargl");
      System.out.println(updated);
      System.out.println(((Foo)f).c);
      updated = unsafe.compareAndSwapObject(f,offset,newC,"whargl");
      System.out.println(updated);
      System.out.println(((Foo)f).c);
    }
    // Test throwException
    Exception e = new Exception("I'm exceptional!");
    try {
      unsafe.throwException(e);
    } catch (Exception exception) {
      System.out.println("Caught an exception! Is it the same as the one I threw? "+((e == exception)?"true":"false"));
    }
    // Test staticFieldOffset
    /*{


      // Animal.f
      long offset = unsafe.staticFieldOffset(Interfaces.Animal.getField('f'));
    }
    // Test objectFieldOffset
    {

    }*/
  }

  class Foo {
    int a = 7;
    double b = 5.9;
    String c;
  }
}
