package classes.test;

class HashCode {
  public static void main(String[] args) {
    // should be zero
    System.out.println(System.identityHashCode(null));
    // should not be zero
    System.out.println("hello".hashCode());
  }
}
