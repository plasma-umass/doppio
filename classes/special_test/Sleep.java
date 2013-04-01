package classes.special_test;

public class Sleep {
  public static void main(String[] args) throws InterruptedException {
    for (int i=0; i<10; i++) {
      System.out.println(i);
      Thread.currentThread().sleep(1000);
    }
  }
}
