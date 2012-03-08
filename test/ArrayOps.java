// test basic array operations
package test;
public class ArrayOps {
  public static void main(String[] args) {
    int[] foo = {5,4,3,2,1};
    int a = foo.length;
    int[] bar = new int[5];
    System.arraycopy(foo,0,bar,0,5);
    foo[2] = 30;
    int c = bar[2];
    for (int i = 0; i < foo.length; i++)
        System.out.println(foo[i]);
    for (int i = 0; i < bar.length; i++)
        System.out.println(bar[i]);
  }
}
