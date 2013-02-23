package classes.test;
import classes.test.data.clinit.IDontExist;
import java.io.File;
public class CatchingClinitException {

  public static void main(String args[]){
    //Delete IDontExist.class if it exists. javac will create it every time
    //you compile this file.
    File file = new File("./classes/test/data/clinit/IDontExist.class");
    file.delete();

    try {
      Hurray h = new Hurray();
    } catch (ExceptionInInitializerError e) {
      System.out.println("Don't worry; we got it.");
      System.out.println("Exception type: " + e.getClass().getName());
    }

    try {
      NotGood i = new NotGood();
    } catch (Error e) {
      System.out.println("Don't worry; we got it.");
      System.out.println("Exception type: " + e.getClass().getName());
    }

    try {
      Better i = new Better();
    } catch (Error e) {
      System.out.println("Don't worry; we got it.");
      System.out.println("Exception type: " + e.getClass().getName());
    }

    try {
      OhNo i = new OhNo();
    } catch (Error e) {
      System.out.println("Don't worry; we got it.");
      System.out.println("Exception type: " + e.getClass().getName());
    }

    try {
      OhNo2 i = new OhNo2();
    } catch (Error e) {
      System.out.println("Don't worry; we got it.");
      System.out.println("Exception type: " + e.getClass().getName());
    }

    try {
      BadThings i = new BadThings();
    } catch (Error e) {
      System.out.println("Don't worry; we got it.");
      System.out.println("Exception type: " + e.getClass().getName());
    }
  };

}
// Does something illegal in static initialization (divide by 0) that causes
// an uncaught exception that must be wrapped in an ExceptionInInitializerError.
class Hurray {
  static int i, j, k, l;
  static {
    i = 1;
    j = 2;
    k = j-i-i;
    l = j / k;
  }

  public Hurray() {};
}
// Implements a nonexistant interface.
class NotGood implements IDontExist {
  public NotGood() {};
}
// Implements the same nonexistent interface as its parent class.
class Better extends NotGood implements IDontExist {
  public Better() {};
}
// A class is not found inside the static initializer. One might think that
// this would cause an ExceptionInInitializerError. You would be wrong.
class OhNo {
  static {
    Better h = new Better();
  }

  public OhNo() {};
}
// Same issue here.
class OhNo2 {
  static {
    OhNo h = new OhNo();
  }

  public OhNo2() {};
}
// ClassNotFoundException occurs in superclass.
class BadThings extends Better {
  public BadThings() {};
}