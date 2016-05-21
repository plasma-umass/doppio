package doppio.security;

import java.security.*;

/**
 * Provides RNG and other security facilities to the JVM.
 * @author John Vilk <jvilk@cs.umass.edu>
 */
public final class DoppioProvider extends Provider {
  public DoppioProvider() {
    super("DOPPIO", 1.8d, "DOPPIO (SecureRandom)");
    if (BrowserPRNG.isAvailable()) {
      this.put("SecureRandom.DoppioPRNGBlocking", "doppio.security.BrowserPRNG");
    }
    if (NodePRNG.isAvailable()) {
      this.put("SecureRandom.DoppioPRNGBlocking", "doppio.security.NodePRNG");
    }
  }

  /**
   * Initializes the provider with the JCL.
   */
  static {
    // Provider list is 1-based, so this makes the DoppioProvider the most-preferred.
    Security.insertProviderAt(new DoppioProvider(), 1);
    Security.setProperty("securerandom.strongAlgorithms", "DoppioPRNGBlocking:DOPPIO");
  }
}
