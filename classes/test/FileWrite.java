/**
 * Writes a temporary file, and reads it back.
 */
package classes.test;
import java.io.*;
public class FileWrite {
  public static void main(String[] args) {
    try {
      StringWriter stringWriter = new StringWriter();
      File tmpFile = File.createTempFile("Doppio-FileWriteTest", null);
      RandomAccessFile file = new RandomAccessFile(tmpFile, "rw");
      // Should be "Doppio-FileWriteTest[random numbers].tmp"
      String fileName = tmpFile.getName();
      System.out.println(fileName.substring(fileName.indexOf('.')));
      int[] arr = {89, 69, 83};
      for(int byteValue : arr) {
          file.write(byteValue);
      }

      file.seek(0);

      for(int byteValue : arr) {
        System.out.print(byteValue);
      }
      System.out.print("\n");
      file.close();
    } catch (IOException e) {
      System.err.println(e.getMessage());
    }
  }
}
