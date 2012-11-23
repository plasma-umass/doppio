package classes.test;

import sun.misc.Unsafe;
import java.lang.reflect.*;

class RawMemory {
  public static void main(String[] args)
      throws NoSuchFieldException, IllegalAccessException {
    // work around permissions issues
    Field f = Unsafe.class.getDeclaredField("theUnsafe");
    f.setAccessible(true);
    Unsafe unsafe = (Unsafe)f.get(null);
    long addr = unsafe.allocateMemory(100);

    // test of endianness
    unsafe.putLong(addr, 1);
    System.out.println(unsafe.getByte(addr));

    // ensure we are using signed bytes
    unsafe.setMemory(addr, 10L, (byte)(-1));
    System.out.println(unsafe.getByte(addr + 5));

    unsafe.freeMemory(addr);
  }
}
