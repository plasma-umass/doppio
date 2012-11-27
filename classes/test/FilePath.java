package classes.test;

import java.io.*;

class FilePath {
  public static void main(String[] args) throws IOException {
    File f = new File("");
    System.out.println(f.isAbsolute());
    System.out.println(f.getAbsolutePath());
    System.out.println(f.getCanonicalPath());
    for (File child : new File(".").listFiles()) {
      System.out.println(child.getName());
    }
    System.out.println(f.exists());
    System.out.println(f.lastModified());
    System.out.println(f.length());
    System.out.println(f.canWrite());
    f = new File("README.md");
    System.out.println(f.exists());
    System.out.println(f.lastModified());
    System.out.println(f.length());
    System.out.println(f.canWrite());
  }
}
