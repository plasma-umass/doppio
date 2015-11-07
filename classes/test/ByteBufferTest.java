// test ByteBuffer objects, which exercise unsafe operations.
package classes.test;
import java.nio.*;

public class ByteBufferTest {
  public static void main(String[] args) {
    ByteBuffer bb = ByteBuffer.allocateDirect(1024);
    
    // Fill so no two adjacent bytes are the same.
    for (int i = 0; i < 1024; i++) {
        bb.put(i, (byte) (i % 256 - 128));
    }
    
    // Read data.
    System.out.println("Byte(0): " + bb.get(0));
    System.out.println("Byte(1): " + bb.get(1));
    System.out.println("Int(0): " + bb.getInt(0));
    System.out.println("Int(1): " + bb.getInt(1));
    System.out.println("Short(0): " + bb.getShort(0));
    System.out.println("Short(1): " + bb.getShort(1));
    System.out.println("Long(0): " + bb.getLong(0));
    System.out.println("Long(1): " + bb.getLong(1));
    System.out.println("Float(0): " + bb.getFloat(0));
    System.out.println("Float(1): " + bb.getFloat(1));
    System.out.println("Double(0): " + bb.getDouble(0));
    System.out.println("Double(1): " + bb.getDouble(1));
  }
}