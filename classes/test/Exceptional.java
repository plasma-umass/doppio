package classes.test;

import java.io.*;

public class Exceptional {
  public static final native long notImplementedNative();
  public static void throwingFunc() throws Exception {
    int x = 0;
    throw new Exception("good morning");
  }
  public static void anotherThrowingFunc() {
    try {
      throw new RuntimeException("bad morning");
    }
    catch (Exception e) {
      System.out.println("Caught RuntimeException as a subclass of Exception.");
    }
  }
  public static void main(String[] args) {
      try {
          throw new Exception("test");
      } catch (Exception e) {
          int a = 1;
      }

      int b = 0;
      try {
        throwingFunc();
      } catch (Exception e) {
        b += 200;
      }

      try {
        anotherThrowingFunc();
      }
      catch (Exception e) {
        b += 900;
      }
      finally {
        b += 1200;
      }

      // check that natively thrown errors are handled properly
      try {
        new FileReader("./NonExistentFile!!!");
      }
      catch (Exception e) {
        System.out.println(e.getMessage());
        // Note: Some JDK versions may have +/- an extra stack frame.
        System.out.println("is trace depth >= 5?: " + (e.getStackTrace().length >= 5 ? "yes" : "no"));
      }

      // check that NYI natives have the right error type
      try {
        notImplementedNative();
      } catch (UnsatisfiedLinkError e) {
        // we have a different message on purpose, so don't check that
        System.out.println("got an UnsatisfiedLinkError for a NYI native");
      }

      // check that system libraries have the right error type
      try {
        System.loadLibrary("cowsay");
      } catch (UnsatisfiedLinkError e) {
        System.err.println(e.getMessage());
      }

      try {
        throw new Error("I'm the gingerbread man");
      }
      catch (Exception e) {
        System.out.println("We should never reach this -- Error is not a subclass of Exception");
      }
  }
}
