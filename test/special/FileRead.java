// read a local file
// this is almost identical to the copy in test/, but the
// hardcoded filename is changed so that it works in the browser.

package test;
import java.io.*;
public class FileRead {
  public static void main(String[] args) {
    try {
      BufferedReader br = new BufferedReader(new FileReader("FileRead.java"));
      String line;
      while ((line = br.readLine()) != null){
        System.out.println(line);
      }
    } catch (IOException e) {
      System.err.println(e.getMessage());
    }
  }
}
