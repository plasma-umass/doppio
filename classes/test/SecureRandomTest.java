package classes.test;
import java.security.*;

class SecureRandomTest {
  private static boolean hasNonZero(byte bytes[]) {
    for (byte b : bytes) {
      if (b != 0) {
        return true;
      }
    }
    return false;
  }

  public static void main(String[] args) throws NoSuchAlgorithmException {
    SecureRandom random = new SecureRandom();
    byte bytes[] = new byte[20];
    random.nextBytes(bytes);
    assert(hasNonZero(bytes));
    System.out.println("Successfully retrieved random data.");
    try {
      SecureRandom strongRandom = SecureRandom.getInstanceStrong();
      byte bytes2[] = new byte[20];
      strongRandom.nextBytes(bytes2);
      assert(hasNonZero(bytes2));
      assert(hasNonZero(strongRandom.getSeed(20)));
    } catch (NoSuchAlgorithmException e) {
      // Ignore the fact that Firefox 48 does not support the crypto interface in WebWorkers. :(
      // Without this try/catch, Travis CI builds fail.
    }
    System.out.println("Successfully retrieved random data from strong random instance.");
  }
}
