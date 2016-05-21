package doppio.security;
import java.security.*;

/**
 * Provides strong/secure RNG to the JVM in the browser.
 * @author John Vilk <jvilk@cs.umass.edu>
 */
public class BrowserPRNG extends SecureRandomSpi {
  public BrowserPRNG() {
    if (!BrowserPRNG.isAvailable()) {
      throw new AssertionError("BrowserPRNG is not available.");
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
