package test;

class ArrayCopyTest {
  /**
   * Java generics... WHY CAN'T YOU BE MORE USEFUL?
   * Sorry for the copy+paste.
   */
  private static void NPEExceptionTest(String name, Object src, int srcPos,
    Object dest, int destPos, int length) {
    boolean caught = false;
    System.out.print("Test '" + name + "': ");
    try {
      System.arraycopy(src, srcPos, dest, destPos, length);
    } catch (NullPointerException exception) {
      caught = true;
    }
    System.out.println(caught ? "Pass" : "Fail");
  }
  private static void ASEExceptionTest(String name, Object src, int srcPos,
    Object dest, int destPos, int length) {
    boolean caught = false;
    System.out.print("Test '" + name + "': ");
    try {
      System.arraycopy(src, srcPos, dest, destPos, length);
    } catch (ArrayStoreException exception) {
      caught = true;
    }
    System.out.println(caught ? "Pass" : "Fail");
  }
  private static void IOOBExceptionTest(String name, Object src, int srcPos,
    Object dest, int destPos, int length) {
    boolean caught = false;
    System.out.print("Test '" + name + "': ");
    try {
      System.arraycopy(src, srcPos, dest, destPos, length);
    } catch (IndexOutOfBoundsException exception) {
      caught = true;
    }
    System.out.println(caught ? "Pass" : "Fail");
  }

  public static void main(String[] args) {
    NPEExceptionTest("src array null", null, 0,
      new Object[1], 0, 0);
    NPEExceptionTest("dest array null", new Object[1], 0, null, 0, 0);

    ASEExceptionTest("src not an array", new Object(), 0, new Object[1], 0,0);
    ASEExceptionTest("dst not an array", new Object[1], 0, new Object(), 0,0);
    ASEExceptionTest("different primitive components", new int[1], 0,
      new long[1], 0, 0);
    ASEExceptionTest("primitive array to ref array", new int[1], 0,
      new Object[1], 0, 0);
    ASEExceptionTest("ref array to primitive array", new Object[1], 0,
      new int[1], 0, 0);
    /**
     * If any actual component of the source array from position srcPos through
     * srcPos+length-1 cannot be converted to the component type of the
     * destination array by assignment conversion, an ArrayStoreException is
     * thrown. In this case, let k be the smallest nonnegative integer less than
     * length such that src[srcPos+k] cannot be converted to the component type
     * of the destination array; when the exception is thrown, source array
     * components from positions srcPos through srcPos+k-1 will already have
     * been copied to destination array positions destPos through destPos+k-1
     * and no other positions of the destination array will have been modified.
     */
    {
      Object[] objects = new Object[2];
      objects[1] = new Object();
      String[] strings = new String[3];
      strings[0] = "I've got";
      strings[1] = " a lovely";
      strings[2] = " bunch o' coconuts.";
      ASEExceptionTest("src components cannot be dest components", objects,
        0, strings, 0, 2);
      System.out.print("Test '*sigh*': ");
      boolean passes = strings[0] == null && strings[1].equals(" a lovely") &&
        strings[2].equals(" bunch o' coconuts.");
      System.out.println(passes ? "Pass" : "Fail");
    }

    System.out.print("Test 'src components can be dest components if null':");
    System.arraycopy(new Object[1], 0, new String[1], 0, 1);
    System.out.println(" Pass");

    IOOBExceptionTest("srcPos is negative", new Object[1], -1, new Object[1],
      0, 0);
    IOOBExceptionTest("destPos is negative", new Object[1], 0, new Object[1],
      -1, 0);
    IOOBExceptionTest("length is negative", new Object[1], 0, new Object[1],
      0, -1);
    IOOBExceptionTest("src array overrun", new Object[1], 0, new Object[2], 0,
      2);
    IOOBExceptionTest("dest array overrun", new Object[2], 0, new Object[1],
      0, 2);

    // SPECIAL BEHAVIOR
    // If src = dest, then you need to copy src before modifying it.
    String[] strings = new String[3];
    strings[0] = "Ring ring ring ring ring ring ring...";
    strings[1] = "...bananaphone!";
    strings[2] = "BOOP BOOP DE DOO BA DOOP";
    System.out.println("Test 'src=dst', references:");
    System.arraycopy(strings, 0, strings, 1, 2);
    for (String string : strings) {
      System.out.println("\t" + string);
    }

    int[] intarray = new int[3];
    intarray[0] = 1;
    intarray[1] = 2;
    intarray[2] = 3;
    System.out.println("Test 'src=dst', primitives:");
    System.arraycopy(intarray, 0, intarray, 1, 2);
    for (int i : intarray) {
      System.out.println("\t" + i);
    }
  }
}
