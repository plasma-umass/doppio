package classes.test;
import java.io.*;
// modified from http://www.java-samples.com/showtutorial.php?tutorialid=398
public class Serialization {
  public static void main(String args[]) {
    // Object serialization
    byte[] serialized;
    try {
      MyClass object1 = new MyClass("Hello", -7, 2.7e10);
      System.out.println("serializing object: " + object1);
      ByteArrayOutputStream bout = new ByteArrayOutputStream();
      ObjectOutputStream oos = new ObjectOutputStream(bout);
      oos.writeObject(object1);
      serialized = bout.toByteArray();
    }
    catch(Exception e) {
      System.out.println("Exception during serialization: " + e);
      return;
    }
    // Object deserialization
    try {
      MyClass object2;
      ObjectInputStream ois = new ObjectInputStream(new ByteArrayInputStream(serialized));
      object2 = (MyClass)ois.readObject();
      ois.close();
      System.out.println("deserialized object: " + object2);
    }
    catch(Exception e) {
      System.out.println("Exception during deserialization: " + e);
      return;
    }
  }

static class MyClass implements Serializable {
  String s;
  int i;
  double d;
  public MyClass(String s, int i, double d) {
    this.s = s;
    this.i = i;
    this.d = d;
  }
  public String toString() {
    return "s=" + s + "; i=" + i + "; d=" + d;
  }
}

}
