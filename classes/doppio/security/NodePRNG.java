package doppio.security;
import java.security.*;

/**
 * Provides strong/secure RNG to the JVM in NodeJS.
 * @author John Vilk <jvilk@cs.umass.edu>
 */
public class NodePRNG extends SecureRandomSpi {
  public NodePRNG() {
    if (!NodePRNG.isAvailable()) {
      throw new AssertionError("NodePRNG is not available.");
    }
  }

  public static native boolean isAvailable();
  @Override
  protected native void engineSetSeed(byte[] seed);

  @Override
  protected native void engineNextBytes(byte[] bytes);

  @Override
  protected native byte[] engineGenerateSeed(int numBytes);
}
