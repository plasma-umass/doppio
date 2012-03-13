package test;

public class Casting {
  public static void main(String[] args) {
    {
      int a = 999999;
      System.out.println(a);
      System.out.println((long)a);
      System.out.println((double)a);
      System.out.println((float)a);
      System.out.println((short)a);
      a = -a;
      System.out.println(a);
      System.out.println((long)a);
      System.out.println((double)a);
      System.out.println((float)a);
      System.out.println((short)a);
    }
    {
      long a = 8888888888888L;
      System.out.println(a);
      System.out.println((int)a);
      System.out.println((double)a);
      System.out.println((float)a);
      a = -a;
      System.out.println(a);
      System.out.println((int)a);
      System.out.println((double)a);
      System.out.println((float)a);
    }
    {
      double a = 777777777777.0;
      System.out.println(a);
      System.out.println((long)a);
      System.out.println((int)a);
      System.out.println((float)a);
      a = -a;
      System.out.println(a);
      System.out.println((long)a);
      System.out.println((int)a);
      System.out.println((float)a);
    }
    {
      float a = 6666666.0f;
      System.out.println(a);
      System.out.println((long)a);
      System.out.println((double)a);
      System.out.println((int)a);
      a = -a;
      System.out.println(a);
      System.out.println((long)a);
      System.out.println((double)a);
      System.out.println((int)a);
    }
  }

}
