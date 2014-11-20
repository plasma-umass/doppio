import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import enums = require('../enums');
import fs = require('fs');
declare var registerNatives: (defs: any) => void;

class sun_nio_ch_FileChannelImpl {

  public static 'map0(IJJ)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: number, arg1: gLong, arg2: gLong): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'unmap0(JJ)I'(thread: threading.JVMThread, arg0: gLong, arg1: gLong): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'transferTo0(IJJI)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: number, arg1: gLong, arg2: gLong, arg3: number): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'position0(Ljava/io/FileDescriptor;J)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, fd: java_object.JavaObject, offset: gLong): gLong {
    var parent = javaThis.get_field(thread, 'Lsun/nio/ch/FileChannelImpl;parent');
    return gLong.fromNumber(offset.equals(gLong.NEG_ONE) ? parent.$pos : parent.$pos = offset.toNumber());
  }

  /**
   * this poorly-named method actually specifies the page size for mmap
   * This is the Mac name for sun/misc/Unsafe::pageSize. Apparently they
   * wanted to ensure page sizes can be > 2GB...
   */
  public static 'initIDs()J'(thread: threading.JVMThread): gLong {
    // arbitrary
    return gLong.fromNumber(1024);
  }

}

class sun_nio_ch_NativeThread {

  public static 'current()J'(thread: threading.JVMThread): gLong {
    // -1 means that we do not require signaling according to the
    // docs.
    return gLong.fromNumber(-1);
  }

  public static 'signal(J)V'(thread: threading.JVMThread, arg0: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'init()V'(thread: threading.JVMThread): void {
    // NOP
  }

}

// Java 8 support
class sun_nio_ch_IOUtil {

  public static 'iovMax()I'(thread: threading.JVMThread): number {
    // Maximum number of IOVectors supported. Let's punt and say zero.
    return 0;
  }

}

registerNatives({
  'sun/nio/ch/FileChannelImpl': sun_nio_ch_FileChannelImpl,
  'sun/nio/ch/NativeThread': sun_nio_ch_NativeThread
});
