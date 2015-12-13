package classes.test;
// Ensures assertions are enabled during testing.
public class AssertionTest {
  public static void main(String[] args) {
    try {
      assert false;
    } catch (AssertionError e) {
      System.out.println("Caught assertion error.");
    }
  }
}
