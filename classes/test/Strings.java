package classes.test;

public class Strings {
  public static void main(String[] args) {
    String a = "alphabet";
    String b = "belvedere";
    String c = "AlPhAbEt";
    String d = "  \t alphabet  \n \t ";
    String e = "This has \"quotes\"";
    int ia = 5;
    int ib = 6;

    System.out.println(a.contains("phab"));
    System.out.println(a.contains(b));
    System.out.println(a.startsWith("alpha"));
    System.out.println(a.endsWith("bet"));
    System.out.println(a.toUpperCase());
    System.out.println(a.toLowerCase());
    System.out.println(a.equalsIgnoreCase(c));
    System.out.println(a.lastIndexOf("a"));
    System.out.println(a.length());
    System.out.println(a.substring(4,6));
    System.out.println(a.toString());
    System.out.println(d);
    System.out.println(d.trim());
    System.out.println(e);
    System.out.println(a.replace('a','z'));
    System.out.println(String.valueOf(1));
    // sans newlines
    System.out.print(1); System.out.print(2); System.out.println(3);
    System.out.println(String.valueOf(1.5));
    System.out.format("%s is asdf\n", "asdf");

    // Pseudo-UTF-8 strings. Testing boundaries between char classes.
    // There are 4 different char classes:
    // - 0x01 -> 0x7F
    // - 0x00 and 0x80 -> 0x07FF
    // - 0x0800 -> 0xFFFF
    // Numbers over 0xFFFF [new in JVMSE7+]
    // The JDK now generates CharacterData classes using giant unicode strings that
    // abuse ALL of these character classes. These CharacterData classes handle e.g.
    // parseInt and many other required APIs.
    String DATA = "\u0001\u007F\u0000\u0080\u07FF\u0800\uFFFF\u4800\u100FA";
    for (int i = 0; i < DATA.length(); i++) {
      System.out.print("" + ((int) DATA.charAt(i)) + ",");
    }
    System.out.println("");
  }
}
