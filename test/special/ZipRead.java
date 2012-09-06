// read a zip archive
package test.special;
import java.io.*;
import java.util.Set;
import com.sun.tools.javac.zip.ZipFileIndex;

public class ZipRead {

  // Edit this to point to rt.jar
  public static final String RT_PATH = "/Applications/Xcode.app/Contents/Applications/Application Loader.app/Contents/MacOS/itms/java/lib/rt.jar";

  public static void main(String[] args) throws IOException {
      File zip = new File(RT_PATH);
      ZipFileIndex zfi = ZipFileIndex.getZipFileIndex(zip,0,false,null,false);
      Set<String> dirs = zfi.getAllDirectories();
      System.out.println(dirs.size() + " dirs in the zip, first 5 are:");
      int i = 0;
      for (String dir : dirs){
        System.out.println(dir);
        ++i;
        if (i == 5) break;
      }
  }
}
