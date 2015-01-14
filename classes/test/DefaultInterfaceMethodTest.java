package classes.test;
import classes.test.shared_classes.*;

/**
 * Tests new default interface method functionality in Java 8.
 */
public class DefaultInterfaceMethodTest {
  public static void main(String[] args) {
    for (ISpeak speaker : ISpeak.getSpeakers()) {
      System.out.println("Speaker Class: " + speaker.getClass().getCanonicalName());
      speaker.speak();
    }
  }
}
