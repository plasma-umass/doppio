// read a local file
package classes.test;
import java.io.*;
public class FileWrite {
  public static void main(String[] args) {
    try {
      StringWriter stringWriter = new StringWriter();

      // replace by createTempFile when we get around to supporting it
      RandomAccessFile file = new RandomAccessFile("/tmp/Doppio-FileWriteTest", "rw");
      int[] arr = {89, 69, 83};
      for(int byteValue : arr) {
          file.write(byteValue);
      }

      file.seek(0);

      for(int byteValue : arr) {
        if (file.read() != byteValue) {
          throw new RuntimeException("RandomAccessFile byte write method failed.");
        }
      }
    } catch (IOException e) {
      System.err.println(e.getMessage());
    }
  }
}
