package classes.test;

import java.lang.reflect.*;

class GenericSignature {

  static void printGenericMethodInfo(Method m) {
    System.out.println("Info for method " + m.getName());

    for (TypeVariable t : m.getTypeParameters()) System.out.println("Param: " + t.getName());

    Type returnType = m.getGenericReturnType();
    if (returnType instanceof TypeVariable)
      System.out.println("Returns: " + ((TypeVariable)returnType).getName());

    Type[] exceptionTypes = m.getGenericExceptionTypes();
    for (Type t : exceptionTypes)
      if (t instanceof TypeVariable)
        System.out.println("Throws: " + ((TypeVariable)t).getName());
  }

  public static void main(String[] args) throws NoSuchFieldException, NoSuchMethodException {
    Field f = GenericSignatureFoo.class.getField("fooField");
    System.out.println(f.getGenericType());
    f = GenericSignatureBar.class.getField("barField");
    System.out.println(f.getGenericType());

    printGenericMethodInfo(GenericSignatureFoo.class.getDeclaredMethods()[0]);
    printGenericMethodInfo(GenericSignatureBar.class.getDeclaredMethods()[0]);
  }

  class GenericSignatureFoo {
    public short fooField;
    public void fooMethod(int x, long y) throws RuntimeException { return; }
  }

  class GenericSignatureBar<U, V> {
    public U barField;
    public <W extends Throwable> V barMethod(U x, V y) throws W {
      return y;
    }
  }

}
