package classes.test;

import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.Enumeration;
import java.util.Hashtable;
import java.lang.reflect.Method;
import java.util.Comparator;

// Modified from: http://www.javalobby.org/java/forums/t18345.html

public class CustomClassLoader2 extends ClassLoader {
  private Hashtable classes = new Hashtable();

  public CustomClassLoader2 (){
    super(CustomClassLoader2.class.getClassLoader());
  }

  public static Comparator<Class> ClassNameComparator = new Comparator<Class>() {
      public int compare(Class cls1, Class cls2) {
        String className1 = cls1.getName();
        String className2 = cls2.getName();
        return className1.compareTo(className2);
      }
  };

  public static Comparator<Method> MethodNameComparator = new Comparator<Method>() {
      public int compare(Method m1, Method m2) {
        String mName1 = m1.getName();
        String mName2 = m2.getName();
        return mName1.compareTo(mName2);
      }
  };

  public static class CustomException2 extends Exception {
    public CustomException2() { super(); }
  }

  public static class CustomException extends Exception {
    public CustomException() { super(); }
  }

  public Class loadClass(String className) throws ClassNotFoundException {
    if (!className.equals("java.lang.Character"))
      System.out.println("Loading class " + className);
    return findClass(className);
  }

  public Class findClass(String className) {
    // JV: See note below.
    if (!className.equals("java.lang.Character"))
      System.out.println("Finding class " + className);
    byte classByte[];
    Class result=null;
    result = (Class)classes.get(className);
    if(result != null){
      return result;
    }

    // JV: Fixing flaky test. Doppio resolves this class when constructing a
    // reflection object at Runtime. The JVM does so at a later time, resulting
    // in divergent output.
    if (className.equals("java.lang.Character")) {
      try{
        return findSystemClass(className);
      } catch(Exception e){
        return null;
      }
    }

    // Get it ourselves before the system classloader.
    try{
      classByte = loadClassData("classes/test/data/CustomClassLoader2/" + className.replace('.',File.separatorChar)+".class");
      System.out.println("Defining class " + className);
      result = defineClass(className,classByte,0,classByte.length,null);
      System.out.println("Registering class " + className);
      classes.put(className,result);
      System.out.println("Found class. Returning.");
      return result;
    } catch(Exception e){
      System.out.println("Couldn't get the class ourselves!");
    }

    try{
      System.out.println("Getting the system class.");
      return findSystemClass(className);
    } catch(Exception e){
      System.out.println("Couldn't find. Returning null.");
      return null;
    }
  }

  private byte[] loadClassData(String className) throws IOException{
    File f ;
    f = new File(className);
    int size = (int)f.length();
    byte buff[] = new byte[size];
    FileInputStream fis = new FileInputStream(f);
    DataInputStream dis = new DataInputStream(fis);
    dis.readFully(buff);
    dis.close();
    return buff;
  }

  public static void printMethods(Method[] methods) {
    java.util.Arrays.sort(methods, MethodNameComparator);
    for (Method m : methods)
      System.out.println("\tMethod: " + m.getName());
  }

  public static void printInterfaces(Class[] clses) {
    System.out.println("There are " + clses.length + " interfaces!");
    java.util.Arrays.sort(clses, ClassNameComparator);
    for (Class cls : clses) {
      System.out.println("Interface: " + cls.getName());
      printMethods(cls.getMethods());
    }
  }

  public static void throwBootstrapException() throws CustomException {
    throw new CustomException();
  }

  public static void throwBootstrapException2() throws CustomException2 {
    throw new CustomException2();
  }

  // This class cannot rely on method/class/etc ordering, as it is
  // non-standardized.
  public static void main(String [] args) throws Exception{
    CustomClassLoader2 test = new CustomClassLoader2();
    System.out.println("Loading Dog...");
    Class dog = test.loadClass("classes.test.Dog");

    System.out.println("Dog's methods");
    printMethods(dog.getMethods());

    System.out.println("Getting Dog's interfaces...");
    printInterfaces(dog.getInterfaces());

    System.out.println("Now let's resolve dog...");
    test.resolveClass(dog);
    printInterfaces(dog.getInterfaces());

    Class sr = dog.getSuperclass();
    System.out.println("Super class: " + sr.getName());
    printMethods(sr.getMethods());

    Class catchBootstrapException = test.loadClass("classes.test.CatchBootstrapExceptions");
    Method catcher = catchBootstrapException.getMethod("catcher", Character.class);
    System.out.println("Obtained catcher Method.");
    // Method.invoke()'s permissions checking relies on something that we
    // don't implement correctly. setAccessible(true) bypasses the entire
    // check.
    catcher.setAccessible(true);
    catcher.invoke(null, 'a');
  }
}
