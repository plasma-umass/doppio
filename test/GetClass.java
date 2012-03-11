package test;

public class GetClass {

  public static void main(String[] args) {
    GetClass2 x = new GetClass2();
    System.out.println(x.getClass().getName());
  }

}

class GetClass2 {
}
