/**
 * A module for generic interfaces. Like enums.ts, we use this to avoid
 * unneeded dependencies between modules, which can induce circular
 * dependencies.
 */

/**
 * Standard JVM options.
 */
export interface JVMOptions {
  // [Required] Path where DoppioJVM's things are.
  // DoppioJVM expects that:
  // - natives are in the 'natives' subdirectory.
  // - JCL is in the 'vendor/java_home' subdirectory.
  // If this is not true, change the relevant options below.
  doppioHomePath: string;
  // Non-JCL paths on the class path. Defaults to the current working directory.
  classpath?: string[];
  // The bootstrap classpath, including paths related to the Java Class Library (JCL).
  bootstrapClasspath?: string[];
  // Path to JAVA_HOME.
  javaHomePath?: string;
  // XXX: Path where native methods are located.
  nativeClasspath?: string[];
  // True if assertions are enabled in system classes, false otherwise.
  // (equivalent to -esa command line option)
  enableSystemAssertions?: boolean;
  // Enable assertions across all classes (if `true`) or
  // selected packages/classes
  // (see http://docs.oracle.com/javase/7/docs/technotes/guides/language/assert.html for syntax)
  enableAssertions?: boolean | string[];
  // Disable assertions on specific classes / packages
  // (see http://docs.oracle.com/javase/7/docs/technotes/guides/language/assert.html for syntax)
  disableAssertions?: string[];
  // System properties for the JVM.
  properties?: {[name: string]: string};
  // Path where DoppioJVM can store temporary files. Defaults to /tmp.
  tmpDir?: string;
  // Responsiveness of JVM (expressed in milliseconds before a thread yields co-operatively)
  responsiveness?: number | (() => number);
}

/**
 * Partial typing for Websockify WebSockets.
 */
export interface IWebsock {
  rQlen(): number;
  rQshiftBytes(len: number): number[];
  on(eventName: string, cb: Function): void;
  open(uri: string): void;
  close(): void;
  send(data: number): void;
  send(data: number[]): void;
  // XXX: Did we add this to the library? I think we did.
  get_raw_state(): number;
}

/**
 * Doppio-specific configuration options passed to this Java interface.
 */
export interface JVMCLIOptions extends JVMOptions {
  // Name of the command used to launch `java`. Used in the 'usage' portion of
  // the help message.
  launcherName: string;
}

