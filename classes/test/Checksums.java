package classes.test;

import java.util.zip.*;
import java.nio.*;

/**
 * Tests DoppioJVM's natively-implemented checksums.
 */
class Checksums {
  private static String getValue(Checksum csum) {
    long val = csum.getValue();
    // Return as hex.
    return String.format("%08X", val);
  }
  private static void byteByByte(Checksum csum, byte[] data) {
    System.out.print(csum.getClass().getCanonicalName() + " (individual bytes): ");
    for (int i = 0; i < data.length; i++) {
      csum.update((int) data[i]);
    }
    System.out.print(getValue(csum) + "\n");
    csum.reset();
  }

  private static void byteArrays(Checksum csum, byte[] data) {
    System.out.print(csum.getClass().getCanonicalName() + " (byte arrays): ");
    int dataLenHalf = data.length >> 1;
    // Check empty array case.
    byte[] empty = {};

    csum.update(data, 0, dataLenHalf);
    csum.update(data, dataLenHalf, 0);
    csum.update(empty, 0, 0);
    csum.update(data, dataLenHalf, data.length - dataLenHalf);
    System.out.print(getValue(csum) + "\n");
    csum.reset();
  }

  public static void main(String[] args) {
    CRC32 crc = new CRC32();
    Adler32 adler = new Adler32();
    String dataString = "Look at me, I'm a string! :D";
    byte[] raw = dataString.getBytes();

    Checksums.byteByByte(crc, raw);
    Checksums.byteByByte(adler, raw);
    Checksums.byteArrays(crc, raw);
    Checksums.byteArrays(adler, raw);

    ByteBuffer[] buffers = { ByteBuffer.allocate(raw.length), ByteBuffer.allocateDirect(raw.length) };

    // The ByteBuffer interface, while shared by all Checksum implementers,
    // is not part of the Checksum interface.
    boolean isDirect = false;
    for (ByteBuffer buff : buffers) {
      buff.put(raw);
      // Put changes position; rewind back to 0.
      buff.position(0);

      System.out.print("CRC32 (byte buffer " + (isDirect ? "direct" : "non-direct") + "): ");
      crc.update(buff);
      System.out.print(getValue(crc) + "\n");
      crc.reset();

      // Rewind for adler.
      buff.position(0);

      System.out.print("Adler32 (byte buffer " + (isDirect ? "direct" : "non-direct") + "): ");
      adler.update(buff);
      System.out.print(getValue(adler) + "\n");
      adler.reset();

      isDirect = true;
    }
  }
}