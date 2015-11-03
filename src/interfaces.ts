/**
 * A module for generic interfaces. Like enums.ts, we use this to avoid
 * unneeded dependencies between modules, which can induce circular
 * dependencies.
 */

/**
 * Standard JVM options.
 */
export interface JVMOptions {
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
  // True if assertions are enabled, false otherwise.
  assertionsEnabled: boolean;
  // System properties for the JVM.
  properties?: {[name: string]: string};
  // Path where DoppioJVM can store temporary files. Defaults to /tmp.
  tmpDir?: string;
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
  launcherName?: string;
}

