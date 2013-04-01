// use java.util.Scanner
package classes.test;
import java.util.Scanner;
import java.io.*;
import java.util.regex.MatchResult;

public class ScannerTest {

  static void useDelimiters() {
    String input = "1 fish 2 fish red fish blue fish";
    Scanner s = new Scanner(input).useDelimiter("\\s*fish\\s*");
    System.out.println(s.nextInt());
    System.out.println(s.nextInt());
    System.out.println(s.next());
    System.out.println(s.next());
    s.close();
  }

  static void useRegex() {
    String input = "1 fish 2 fish red fish blue fish";
    Scanner s = new Scanner(input);
    s.findInLine("(\\d+) fish (\\d+) fish (\\w+) fish (\\w+)");
    MatchResult result = s.match();
    for (int i=1; i<=result.groupCount(); i++)
      System.out.println(result.group(i));
    s.close();
  }

  static void readFile() {
    try {
      Scanner darkly = new Scanner(new File("./classes/test/ScannerTest.java"));
      System.out.println(darkly.hasNext());
      System.out.println(darkly.next());
      System.out.println(darkly.next());
      System.out.println(darkly.next());
      darkly.close();
    } catch (FileNotFoundException e) {
      System.out.println(e);
    }
  }

  public static void main(String[] args) {
    readFile();
    useDelimiters();
    useRegex();
  }
}
