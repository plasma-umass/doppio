package doppio;

import java.lang.reflect.Method;
import java.util.jar.Attributes;
import java.util.jar.JarFile;
import java.util.jar.Manifest;

/**
 * Invoked by Doppio when Doppio is invoked with the -jar option.
 * We separate this logic from the JVM so the JAR is properly loaded
 * in the application classloader, NOT the bootstrap classloader.
 */
public class JarLauncher {
  /**
   * Main function of the application, invoked with all of the regular
   * command line arguments. We forward them to the JAR file.
   */
  public static void main(String[] args) throws Throwable {
    String cp = System.getProperty("java.class.path", null);
    JarFile mainJar = new JarFile(cp);
    Manifest manifest = mainJar.getManifest();

    if (manifest == null) {
      System.err.println("JAR file is missing manifest; cannot start JVM.");
    } else {
      String mainClassName = manifest.getMainAttributes().getValue(Attributes.Name.MAIN_CLASS);
      if (mainClassName == null) {
        System.err.println("JAR file manifest does not specify a main class; cannot start JVM.");
      } else {
        // Fetch the main class using the system's class loader.
        ClassLoader systemClassLoader = ClassLoader.getSystemClassLoader();
        Class<?> mainCls = Class.forName(mainClassName, true, systemClassLoader);
        Method mainMethod = mainCls.getMethod("main", new Class[] { String[].class });
        mainMethod.invoke(null, new Object[]{ args });
      }
    }
  }
}
