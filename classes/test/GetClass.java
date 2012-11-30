package classes.test;

public class GetClass {

  public static void main(String[] args) {
    GetClass x = new GetClass();
    GetClass[] xArr = new GetClass[10];
    int[] iArr = new int[10];
    Integer[][] multiArr = new Integer[5][5];

    System.out.println(x.getClass().getName());
    System.out.println(xArr.getClass().getName());
    System.out.println(iArr.getClass().getName());
    System.out.println(iArr.getClass().getComponentType());
    System.out.println(iArr.getClass().getComponentType().getComponentType());
    System.out.println(multiArr.getClass().getName());
    System.out.println(multiArr.getClass().getComponentType());
    System.out.println(multiArr.getClass().getSuperclass());
  }

}
