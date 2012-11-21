package classes.test;

import java.io.*;

class FilePath {
  public static void main(String[] args) throws IOException {
    File f = new File("");
    System.out.println(f.isAbsolute());
    System.out.println(f.getAbsolutePath());
    System.out.println(f.getCanonicalPath());
  }
}
