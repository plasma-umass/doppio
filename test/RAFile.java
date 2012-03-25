package test;

import java.io.*;

class RAFile {
  public static void main(String[] args) throws Exception {
    RandomAccessFile f = new RandomAccessFile("./test/RAFile.java", "r");

    f.seek(20);

    byte[] b = new byte[10];

    f.read(b, 5, 5);

    for (int i=0; i<b.length; i++) 
      System.out.println(b[i]);
  }
}
