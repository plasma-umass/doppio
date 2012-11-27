package classes.test;
public class Compare {
  public static void main(String[] args) {
    long foo = System.currentTimeMillis();
    if (foo < 0L) {
      System.out.println(10000);
    } else {
      System.out.println(99999);
    }
  }
}
