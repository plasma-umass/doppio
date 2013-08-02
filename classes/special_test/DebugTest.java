package classes.special_test;

import classes.doppio.Debug;

public class DebugTest {
  public static void main(String[] args) {
    System.out.println("Changing log level to VTRACE.");
    Debug.SetLogLevel(Debug.LogLevel.VTRACE);
    System.out.println("Log level is now: " + Debug.GetLogLevel());
    System.out.println("Changing back to error...");
    Debug.SetLogLevel(Debug.LogLevel.ERROR);
    System.out.println("Log level is now: " + Debug.GetLogLevel());
  }
}
