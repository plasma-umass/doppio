// read a local file
package classes.test;
import java.io.*;
public class FileRead {
  public static void main(String[] args) {
    try {
      BufferedReader br = new BufferedReader(new FileReader("./classes/test/FileRead.java"));
      String line;
      while ((line = br.readLine()) != null){
        System.out.println(line);
      }
    } catch (IOException e) {
      System.err.println(e.getMessage());
    }
  }
}
