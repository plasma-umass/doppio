package test;

public class Strings {
  public static void main(String[] args) {
    String a = "alphabet";
    String b = "belvedere";
    String c = "AlPhAbEt";
    int ia = 5;
    int ib = 6;

    System.out.println(a.contains("phab"));
    System.out.println(a.contains(b));
    System.out.println(a.endsWith("bet"));
    System.out.println(a.toUpperCase());
    System.out.println(a.equalsIgnoreCase(c));
    System.out.println(a.lastIndexOf("a"));
    System.out.println(a.length());
    System.out.println(a.substring(4,6));
  }
}
