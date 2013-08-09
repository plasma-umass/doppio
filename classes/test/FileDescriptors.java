package classes.test;

import java.io.*;

public class FileDescriptors {

  static void testDescriptorValidity(Closeable fp, FileDescriptor fd) throws IOException {
    System.out.println(fd.valid());
    fp.close();
    System.out.println(fd.valid());
  }

  public static void main (String[] args) throws IOException {
    RandomAccessFile raf = new RandomAccessFile("classes/test/FileDescriptors.java", "r");
    testDescriptorValidity(raf, raf.getFD());

    FileInputStream fs1 = new FileInputStream("classes/test/FileDescriptors.java");
    testDescriptorValidity(fs1, fs1.getFD());

    // replace by createTempFile when we get around to supporting it
    File temp = new File("/tmp/Doppio-FileDescriptorsTest");
    FileOutputStream fs2 = new FileOutputStream(temp);
    testDescriptorValidity(fs2, fs2.getFD());
    temp.delete(); // we don't support deleteOnExit either
  }
}
