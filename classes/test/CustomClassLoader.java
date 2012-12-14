package classes.test;

import java.io.*;

public class CustomClassLoader extends ClassLoader {
  private static final int BUFFER_SIZE = 8192;

  protected synchronized Class loadClass(String className, boolean resolve) throws ClassNotFoundException {
    System.out.println("Loading class: " + className + ", resolve: " + resolve);

    // 1. is this class already loaded?
    Class cls = findLoadedClass(className);
    if (cls != null) { return cls; }

    // 2. get class file name from class name
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

    if (classBytes == null) {
      throw new ClassNotFoundException("Cannot load class: " + className);
    }

    // 4. turn the byte array into a Class
    try {
      cls = defineClass(className, classBytes, 0, classBytes.length);
      if (resolve) {
        resolveClass(cls);
      }
    } catch (SecurityException e) { 
      cls = super.loadClass(className, resolve);
    }
    return cls;
  }

  public static void foo(){
    System.out.println("Called CustomClassLoader.foo");
  }

  public static void main(String[] args) throws Exception {
    CustomClassLoader loader1 = new CustomClassLoader();
    
    Class c = Class.forName("classes.test.CustomClassLoader", true, loader1);
    System.out.println("Custom loaded class: " + c);

    System.out.print("Class loaded through custom loader is ");
    if (!CustomClassLoader.class.equals(c)) {
      System.out.print("NOT ");
    }
    System.out.println("the same as that loaded by System loader.");

    java.lang.reflect.Method m = c.getMethod("foo", new Class[] {});
    m.invoke(null, new Object[]{});
  }
}
