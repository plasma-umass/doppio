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

    // multidimensional array (multianewarray)
    Integer[][] foo2 = new Integer[5][5];

    for (int i = 0; i < foo2.length; i++)  {
      for (int j = 0; j < foo2[i].length; j++) {
        foo2[i][j] = i * j;
        System.out.print(foo2[i][j]);
      }
      System.out.println();
    }

    // all kinds of array loads
    long[] larr = new long[3];
    short[] sarr = new short[4];
    byte[] barr = new byte[5];
    float[] farr = new float[6];
    double[] darr = new double[7];
    darr[6] = 8.3;
    farr[5] = (float)darr[6];
    barr[4] = (byte)farr[5];
    sarr[3] = (short)barr[4];
    larr[2] = (long)sarr[3];
    darr[1] = (double)larr[2];
    // check that we initialized our long array with gLong objects
    larr[0] = 2 + larr[1];

    // null checks
    int[] baz = null;

    try {
      System.out.println(baz.length);
    }
    catch (NullPointerException e) { }

    try {
      baz[0] = 0;
    }
    catch (NullPointerException e) { }

    try {
      System.out.println(baz[0]);
    }
    catch (NullPointerException e) { }

    System.out.println("OK");
  }
}
