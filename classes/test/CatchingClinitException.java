package classes.test;
public class CatchingClinitException {

  public static void main(String args[]){
    try {
      Hurray h = new Hurray();
    } catch (ExceptionInInitializerError e) {
      System.out.println("Don't worry; we got it.");
      e.printStackTrace();
    }
  };

}
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
