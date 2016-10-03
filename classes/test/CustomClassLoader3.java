package classes.test;

public class CustomClassLoader3 extends ClassLoader {

  public CustomClassLoader3 (){
    super(CustomClassLoader3.class.getClassLoader());
  }

  public static void main(String [] args) throws Exception{
    CustomClassLoader3 ccl = new CustomClassLoader3();
    String[] signers = new String[]{"One", "Two"};

    // Test with primitive types
    ccl.testSigners(java.lang.Byte.TYPE, null, null);
    ccl.testSigners(java.lang.Byte.TYPE, signers, null);
    ccl.testSigners(java.lang.Void.TYPE, signers, null);

    // Test with reference types
    ccl.testSigners(ccl.getClass(), signers, signers);
    ccl.testSigners(ccl.getClass(), null, null);

    // Test with array types
    CustomClassLoader3[] arrayCCL = new CustomClassLoader3[] {ccl, ccl};
    ccl.testSigners(arrayCCL.getClass(), null, null);
    ccl.testSigners(arrayCCL.getClass(), signers, null);
  }

  void testSigners(Class<?> cls, Object[] signers, Object[] expected) {
    System.out.println("Testing: " + cls);
    System.out.println("Setting signers to:" + describeArray(signers));
    setSigners(cls, signers);
    System.out.println("Expecting:" + describeArray(expected));
    System.out.println("Got: " + describeArray(cls.getSigners()));
    System.out.println("-------");
  }

  String describeArray(Object[] arr) {
    if (arr == null) {
      return "null";
    } else {
      return "array of length: " + arr.length;
    }
  }
}
