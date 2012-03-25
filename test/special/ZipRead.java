// read a zip archive
package test.special;
import java.io.*;
import com.sun.tools.javac.zip.ZipFileIndex;

public class ZipRead {
  public static void main(String[] args) throws IOException {
      File zip = new File("/Developer/Applications/Utilities/Application Loader.app/Contents/MacOS/itms/java/lib/rt.jar");
      ZipFileIndex zfi = ZipFileIndex.getZipFileIndex(zip,0,false,null,false);
      System.out.println("read the zip correctly");
  }
}
