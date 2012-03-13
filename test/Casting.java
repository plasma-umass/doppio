package test;

public class Casting {
  public static void main(String[] args) {
    {
      int a = 8;
      System.out.println(a);
      System.out.println((long)a);
      System.out.println((double)a);
      System.out.println((float)a);
      a = -a;
      System.out.println(a);
      System.out.println((long)a);
      System.out.println((double)a);
      System.out.println((float)a);
    }
    {
      long a = 8L;
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
      double a = 8.0;
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
      float a = 8.0f;
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
