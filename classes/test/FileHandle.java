// read a local file
package classes.test;
import java.io.*;
public class FileHandle {
  public static void main(String[] args) {
    FileInputStream in = null;
    try {
      in = new FileInputStream("./classes/test/FileHandle.java");
      in.read();
      in.close();
      in.read();
    } catch (IOException e) {
      System.err.println("An IOException has occurred (expected).");
    }
  }
}
