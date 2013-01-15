package classes.util;

import java.io.*;
import java.util.Enumeration;
import java.util.zip.ZipFile;
import java.util.zip.ZipEntry;

public class Unzip {

  public static void main(String[] args) {
    if(args.length < 1) {
      System.err.println("Usage: Unzip zipfile prefix");
      return;
    }
    String prefix = (args.length == 2)? args[1] : "";

    try {
      ZipFile zipFile = new ZipFile(args[0]);
      byte[] buffer = new byte[8192];
      int readLen;

      Enumeration<? extends ZipEntry> entries = zipFile.entries();
      while(entries.hasMoreElements()) {
        ZipEntry entry = entries.nextElement();
        File path = new File(prefix + entry.getName());
        System.out.println(path);
        if (entry.isDirectory()) continue;
        InputStream in = zipFile.getInputStream(entry);
        path.getParentFile().mkdirs();
        OutputStream out = new BufferedOutputStream(new FileOutputStream(path));
        while((readLen = in.read(buffer)) >= 0)
          out.write(buffer, 0, readLen);
        out.close();
      }
      zipFile.close();
    } catch (IOException ioe) {
      ioe.printStackTrace();
      return;
    }
  }

}
