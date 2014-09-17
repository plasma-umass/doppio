/**
 * A module for generic interfaces. Like enums.ts, we use this to avoid
 * unneeded dependencies between modules, which can induce circular
 * dependencies.
 */

/**
 * Standard JVM options.
 */
export interface JVMOptions{
  // The bootstrap classpath, including paths related to the Java Class Library (JCL).
  bootstrapClasspath: string[];
  // Non-JCL paths on the class path.
  classpath: string[];
  // Path to JAVA_HOME.
  javaHomePath: string;
  // Path where we can extract JAR files.
  extractionPath: string;
  // XXX: Path where native methods are located.
  nativeClasspath: string[];
}
