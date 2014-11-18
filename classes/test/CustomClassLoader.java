package classes.test;

import java.io.*;

public class CustomClassLoader extends ClassLoader {
  private static final int BUFFER_SIZE = 8192;

  protected synchronized Class loadClass(String className, boolean resolve) throws ClassNotFoundException {

    // 1. is this class already loaded?
    Class cls = findLoadedClass(className);
    if (cls != null) {
      System.out.println("Already loaded "+className);
      return cls;
    }

    // 2. get class file name from class name
    // NOTE: Resource paths are *always* '/' separated, regardless of platform!
    String clsFile = className.replace('.', '/') + ".class";

    // 3. get bytes for class
    byte[] classBytes = null;
    try {
      InputStream in = getResourceAsStream(clsFile);
      byte[] buffer = new byte[BUFFER_SIZE];
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      int n = -1;
      while ((n = in.read(buffer, 0, BUFFER_SIZE)) != -1) {
        out.write(buffer, 0, n);
      }
      classBytes = out.toByteArray();
    }
    catch (IOException e) {
      System.out.println("ERROR loading class file: " + e);
    }
    catch (NullPointerException e) {
      System.out.println("ERROR reading " + clsFile);
    }

    if (classBytes == null) {
      throw new ClassNotFoundException("Cannot load class: " + className);
    }

    // 4. turn the byte array into a Class
    try {
      cls = defineClass(className, classBytes, 0, classBytes.length);
      if (resolve) {
        resolveClass(cls);
      }
      System.out.println("ran defineClass with no issues");
    } catch (SecurityException e) {
      cls = super.loadClass(className, resolve);
    }
    return cls;
  }

  public static void foo(){
    System.out.println("Called CustomClassLoader.foo");
  }

  public static void bar(){
    System.out.println("Called CustomClassLoader.bar");
  }

  public static void main(String[] args) throws Exception {
    CustomClassLoader loader1 = new CustomClassLoader();

    Class<?> c = Class.forName("classes.test.CustomClassLoader", true, loader1);
    System.out.println("Custom loaded class: " + c);

    System.out.print("Class loaded through custom loader is ");
    if (!CustomClassLoader.class.equals(c)) {
      System.out.print("NOT ");
    }
    System.out.println("the same as that loaded by System loader.");

    java.lang.reflect.Method m = c.getMethod("foo", new Class[] {});
    m.invoke(null, new Object[]{});
    java.lang.reflect.Method m2 = c.getMethod("bar", new Class[] {});
    m2.invoke(null, new Object[]{});

    Class<?> c2 = Class.forName("[Ljava.lang.Object;", true, loader1);
    System.out.print("Object[] loaded through custom classloader is ");
    Class<?> c3 = Object[].class;
    if (c2 != c3) {
      System.out.print("NOT ");
    }
    System.out.println("the same as that loaded by System loader.");

    try {
      Class<?> nonexistant = Class.forName("[Ljava.lang.Lolol;", true, loader1);
    } catch (ClassNotFoundException e) {
      System.out.println(e);
    }
    try {
      // this syntax is malformed, and should be caught in forName0
      Class<?> malformed = Class.forName("java.lang.Lolol[]", true, loader1);
    } catch (ClassNotFoundException e) {
      System.out.println("java.lang.Lolol[] is malformed");
    }
  }
}
