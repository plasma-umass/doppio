package classes.test;

/**
 * Stresses various corner cases in UTF encoding.
 */
public class UTFTest {
  public static void main(String[] args) {
    System.out.println("호호");
    System.out.println("𐐷𐐷");
    int[] codePoint = {0x24B62};
    String largeCodePoint = new String(codePoint, 0, 1);
    System.out.println(largeCodePoint);
  }
}
