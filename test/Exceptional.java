public class Exceptional {
  public static void throwingFunc() throws Exception {
    int x = 0;
    throw new Exception("good morning");
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
  }
}
