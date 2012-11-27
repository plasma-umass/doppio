package classes.special_test;

/*
 * To run this test, first compile both NoSuchField.java and NoSuchFieldObject.java. Then delete
 * `int hasOwnProperty` from NoSuchFieldObject and recompile _only_ NoSuchFieldObject.java. Then run
 * `java NoSuchField`.
 */
class NoSuchField {
  public static void main(String[] args) throws InstantiationException, IllegalAccessException {
    try {
      System.out.println((new NoSuchFieldObject()).hasOwnProperty);
    }
    catch (Error e) {
      System.out.println(e);
    }
    try {
      (new NoSuchFieldObject()).hasOwnProperty = 1;
    }
    catch (Error e) {
      System.out.println(e);
    }
  }
}

