package classes.test;

import java.io.*;

class RAFile {
  public static void main(String[] args) throws Exception {
    RandomAccessFile f = new RandomAccessFile("./classes/test/RAFile.java", "r");
    System.out.println(f.getFilePointer());
    System.out.println(f.length());
    f.seek(20);
    System.out.println(f.getFilePointer());

    byte[] b = new byte[10];

    f.read(b, 5, 5);
    printBytes(b);
    System.out.println(f.getFilePointer());

    f.seek(0);
    f.read(b,0,10);
    printBytes(b);
    System.out.println(f.getFilePointer());
    f.seek(5);
    f.read(b,0,10);
    printBytes(b);
    System.out.println(f.getFilePointer());
    f.close();
  }
  static void printBytes(byte[] b) {
    for (int i=0; i<b.length; i++) 
      System.out.print(b[i]+" ");
    System.out.println();
  }
}
