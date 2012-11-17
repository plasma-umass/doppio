package classes.test;

import java.io.*;

class RAFile {
  public static void main(String[] args) throws Exception {
    RandomAccessFile f = new RandomAccessFile("./test/RAFile.java", "r");

    f.seek(20);

    byte[] b = new byte[10];

    f.read(b, 5, 5);
    printBytes(b);

    f.seek(0);
    f.read(b,0,10);
    printBytes(b);

  }
  static void printBytes(byte[] b) {
    for (int i=0; i<b.length; i++) 
      System.out.print(b[i]+" ");
    System.out.println();
  }
}
