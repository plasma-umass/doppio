package classes.test;

import java.io.*;

class RAFile {
  public static void main(String[] args) throws Exception {
    RandomAccessFile f = new RandomAccessFile("./classes/test/RAFile.java", "r");
    long fp = f.getFilePointer();  // will vary from machine to machine
    System.out.println(f.length());
    f.seek(20);

    byte[] b = new byte[10];

    f.read(b, 5, 5);
    printBytes(b);

    f.seek(0);
    f.read(b,0,10);
    printBytes(b);
    f.close();
  }
  static void printBytes(byte[] b) {
    for (int i=0; i<b.length; i++) 
      System.out.print(b[i]+" ");
    System.out.println();
  }
}
