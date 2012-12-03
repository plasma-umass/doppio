/* Run like this:
node build/opt/console/runner.js --jar=/usr/share/java/junit.jar \
  org/junit/runner/JUnitCore --java=classes.special_test.JUnitTests
*/
package classes.special_test;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;


public class JUnitTests {

  @Test(expected=ClassCastException.class)
  public void BadClassCast() {
    class A { int a; }
    class B { int a; }
    A a = new A();
    Object b = new B();
    a = (A)b;
  }

  @Test
  public void ClassCastTest() {
    Map<String, Integer> foo = new TreeMap<String, Integer>();
    // these puts are necessary so that the casting isn't optimized to a nop
    foo.put("quick",614);
    foo.put("brown",104);
    foo.put("fox",124);
    TreeMap<String, Integer> bar = (TreeMap<String, Integer>)foo;

    assertTrue(foo instanceof TreeMap);
    assertTrue(bar instanceof TreeMap);
  }

  @Test
  public void IntCasting() {
    int a = 999999;
    assertEquals(a, 999999);
    assertEquals((long)a, 999999L);
    assertEquals((double)a, 999999.0, 0);
    assertEquals((float)a, 999999.0f, 0);
    assertEquals((short)a, 16959);
    assertEquals((int)((char)a), 16959);
    assertEquals((byte)a, 63);
    a = -a;
    assertEquals(a, -999999);
    assertEquals((long)a, -999999L);
    assertEquals((double)a, -999999.0, 0);
    assertEquals((float)a, -999999.0f, 0);
    assertEquals((short)a, -16959);
    assertEquals((int)((char)a), 48577);
    assertEquals((byte)a, -63);
  }

  @Test
  public void LongCasting() {
    long a = 8888888888888L;
    assertEquals(a, 8888888888888L);
    assertEquals("l2i", (int)a, -1693413832);
    assertEquals("l2d", (double)a, 8.888888888888E12, 0.0);
    assertEquals("l2f", (float)a, 8.8888889E12f, 1e6);
    a = -a;
    assertEquals(a, -8888888888888L);
    assertEquals("l2i", (int)a, 1693413832);
    assertEquals("l2d", (double)a, -8.888888888888E12, 0.0);
    assertEquals("l2f", (float)a, -8.8888889E12f, 1e6);
  }

  @Test
  public void DoubleCasting() {
    double a = 777777777777.0;
    assertEquals(a, 777777777777.0, 3185.0);
    assertEquals("d2i", (int)a, 2147483647);
    assertEquals("d2l", (long)a, 777777777777L);
    assertEquals("d2f", (float)a, 7.7777777E11f, 3185.0);
    a = -a;
    assertEquals(a, -7.77777777777E11, 3185.0);
    assertEquals("d2i", (int)a, -2147483648);
    assertEquals("d2l", (long)a, -777777777777L);
    assertEquals("d2f", (float)a, -7.7777777E11f, 3185.0);
  }

  @Test
  public void FloatCasting() {
    float a = 6666666.0f;
    assertEquals(a, 6666666.0f, 0);
    assertEquals((long)a, 6666666L);
    assertEquals((double)a, 6666666.0, 0);
    assertEquals((int)a, 6666666);
    a = -a;
    assertEquals(a, -6666666.0f, 0);
    assertEquals((long)a, -6666666L);
    assertEquals((double)a, -6666666.0, 0);
    assertEquals((int)a, -6666666);
  }

  // check that we're reading in bytes / shorts correctly from the classfile
  @Test
  public void ByteParse() {
    byte testBytes[] = {0, -128, 127};
    for (byte value : testBytes) {
      assertTrue(Byte.MIN_VALUE <= value && value <= Byte.MAX_VALUE);
    }
    short testShorts[] = {0, -32768, 32767};
    for (short value : testShorts) {
      assertTrue(Short.MIN_VALUE <= value && value <= Short.MAX_VALUE);
    }
  }

  @Test
  public void ArrayListOps() {
    List<Integer> lst = new ArrayList<Integer>();
    lst.add(1);
    lst.add(2);
    lst.add(1, 3);
    List<Integer> another_lst = new ArrayList<Integer>();
    another_lst.add(4);
    another_lst.add(5);
    lst.addAll(another_lst);
    int[] expected = {1,3,2,4,5};
    int index = 0;
    for (Integer i : lst) 
      assertEquals(i.intValue(), expected[index++]);
  }

  @Test
  public void ConcatStrings() {
    String a = "hello";
    String b = "world";
    String c = a + " " + b;
    String d = "" + 7 + 5.43 + -2L + 3.14f + "\n";
    assertEquals(a, "hello");
    assertEquals(b, "world");
    assertEquals(c, "hello world");
    assertEquals(d, "75.43-23.14\n");
  }

}
