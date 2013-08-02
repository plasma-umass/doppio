package classes.doppio;
/*
 * Contains methods useful for debugging Doppio. Note that some methods may not
 * work in the release build.
 */
public class Debug {
  public enum LogLevel {
    ERROR (1, "ERROR"),
    DEBUG (5, "DEBUG"),
    TRACE (9, "TRACE"),
    VTRACE (10, "VTRACE");

    public final int level;
    public final String name;
    LogLevel(int level, String name) {
      this.level = level;
      this.name = name;
    }
    public String toString() {
      return this.name;
    }
  }
  /*
   * Changes the log level. Note that the release build permanently uses the
   * 'ERROR' log level.
   */
  public static native void SetLogLevel(LogLevel level);
  public static native LogLevel GetLogLevel();
}