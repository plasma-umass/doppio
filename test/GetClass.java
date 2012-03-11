package test;

public class GetClass {

  public static void main(String[] args) {
    GetClass2 x = new GetClass2();
    GetClass2[] xArr = new GetClass2[10];
    int[] iArr = new int[10];

    System.out.println(x.getClass().getName());
    System.out.println(xArr.getClass().getName());
    System.out.println(iArr.getClass().getName());
  }

}

class GetClass2 {
}
