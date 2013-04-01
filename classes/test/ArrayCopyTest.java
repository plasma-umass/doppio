package classes.test;

class ArrayCopyTest {

  static void ExceptionTest(String name, Class expectedException, Object src,
                            int srcPos, Object dest, int destPos, int length) {
    System.out.print("Test '" + name + "': ");
    try {
      System.arraycopy(src, srcPos, dest, destPos, length);
    } catch (Exception e) {
      if (expectedException.isInstance(e)) {
        System.out.println("Pass");
        return;
      }
    }
    System.out.println("Fail");
  }

  public static void main(String[] args) {
    ExceptionTest("src array null", NullPointerException.class, null, 0, new Object[1], 0, 0);
    ExceptionTest("dest array null", NullPointerException.class, new Object[1], 0, null, 0, 0);
    ExceptionTest("dest array null with negative index", NullPointerException.class, new Object[1], -1, null, 100, 100);

    ExceptionTest("src not an array", ArrayStoreException.class, new Object(), 0, new Object[1], 0,0);
    ExceptionTest("dst not an array", ArrayStoreException.class, new Object[1], 0, new Object(), 0,0);
    ExceptionTest("different primitive components", ArrayStoreException.class, new int[1], 0, new long[1], 0, 0);
    ExceptionTest("primitive array to ref array", ArrayStoreException.class, new int[1], 0, new Object[1], 0, 0);
    ExceptionTest("ref array to primitive array", ArrayStoreException.class, new Object[1], 0, new int[1], 0, 0);
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
      ExceptionTest("src components cannot be dest components", ArrayStoreException.class, objects, 0, strings, 0, 2);
      System.out.print("Test '*sigh*': ");
      boolean passes = strings[0] == null && strings[1].equals(" a lovely") &&
        strings[2].equals(" bunch o' coconuts.");
      System.out.println(passes ? "Pass" : "Fail");
    }

    System.out.print("Test 'src components can be dest components if null':");
    System.arraycopy(new Object[1], 0, new String[1], 0, 1);
    System.out.println(" Pass");

    {
      Object[] objects = new Object[1];
      objects[0] = "Heyo";
      String[] strings = new String[1];
      System.out.print("Test 'src components can be dest components if upcast passes': ");
      System.arraycopy(objects, 0, strings, 0, 1);
      boolean result = strings[0] == "Heyo";
      System.out.println(result ? "Pass" : "Fail");
    }

    ExceptionTest("srcPos is negative", IndexOutOfBoundsException.class, new Object[1], -1, new Object[1], 0, 0);
    ExceptionTest("destPos is negative", IndexOutOfBoundsException.class, new Object[1], 0, new Object[1], -1, 0);
    ExceptionTest("length is negative", IndexOutOfBoundsException.class, new Object[1], 0, new Object[1], 0, -1);
    ExceptionTest("src array overrun", IndexOutOfBoundsException.class, new Object[1], 0, new Object[2], 0, 2);
    ExceptionTest("dest array overrun", IndexOutOfBoundsException.class, new Object[2], 0, new Object[1], 0, 2);
    System.out.print("Test 'exact copy': ");
    System.arraycopy(new Object[2], 0, new Object[2], 0, 2);
    System.out.println("Pass");

    // SPECIAL BEHAVIOR
    // If src = dest, then you need to copy src before modifying it.
    {
      String[] strings = new String[3];
      strings[0] = "Ring ring ring ring ring ring ring...";
      strings[1] = "...bananaphone!";
      strings[2] = "BOOP BOOP DE DOO BA DOOP";
      System.out.println("Test 'src=dst', references:");
      System.arraycopy(strings, 0, strings, 1, 2);
      for (String string : strings) {
        System.out.println("\t" + string);
      }
    }
    {
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

    {
      OhHaiObject[] ohai1 = new OhHaiObject[1];
      OhHaiObject[] ohai2 = new OhHaiObject[1];
      ohai1[0] = new OhHaiObject("Denny");
      ohai2[0] = new OhHaiObject("Mark");
      System.out.println("Test 'does not clone objects':");
      System.arraycopy(ohai1, 0, ohai2, 0, 1);
      ohai1[0].object = "Doggy";
      System.out.print("\t"); ohai1[0].printGreeting();
      System.out.print("\t"); ohai2[0].printGreeting();
    }
  }

  static class OhHaiObject {
    public OhHaiObject(String obj) { this.object = obj; }
    public String object;
    // http://www.youtube.com/watch?v=5uCZkq6Rs2k
    public void printGreeting() { System.out.println("Oh hai, "+object+"!"); }
  }
}
