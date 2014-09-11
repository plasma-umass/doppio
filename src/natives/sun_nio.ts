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

  public static 'lock0(Ljava/io/FileDescriptor;ZJJZ)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number, arg2: gLong, arg3: gLong, arg4: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'release0(Ljava/io/FileDescriptor;JJ)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

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

  public static 'force0(Ljava/io/FileDescriptor;Z)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'truncate0(Ljava/io/FileDescriptor;J)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong): number {
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

  public static 'size0(Ljava/io/FileDescriptor;)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, fd_obj: java_object.JavaObject): void {
    var fd = fd_obj.get_field(thread, "Ljava/io/FileDescriptor;fd");
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.fstat(fd, (err, stats) => {
      if (null != err) {
        thread.throwNewException("Ljava/io/IOException;", "Bad file descriptor.");
      } else {
        thread.asyncReturn(gLong.fromNumber(stats.size), null);
      }
    });
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

class sun_nio_ch_FileDispatcher {

  public static 'read0(Ljava/io/FileDescriptor;JI)I'(thread: threading.JVMThread, fd_obj: java_object.JavaObject, address: gLong, len: number): void {
    var fd = fd_obj.get_field(thread, "Ljava/io/FileDescriptor;fd"),
      // read upto len bytes and store into mmap'd buffer at address
      addr = address.toNumber(),
      buf = new Buffer(len);
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.read(fd, buf, 0, len, 0, (err, bytes_read) => {
      if (err) {
        thread.throwNewException("Ljava/io/IOException;", 'Error reading file: ' + err);
      } else {
        var i: number, heap = thread.getThreadPool().getJVM().getHeap();
        for (i = 0; i < bytes_read; i++) {
          heap.set_byte(addr + i, buf.readUInt8(i));
        }
        thread.asyncReturn(bytes_read);
      }
    });
  }

  public static 'pread0(Ljava/io/FileDescriptor;JIJ)I'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: gLong, arg2: number, arg3: gLong): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'readv0(Ljava/io/FileDescriptor;JI)J'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: gLong, arg2: number): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'write0(Ljava/io/FileDescriptor;JI)I'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: gLong, arg2: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'pwrite0(Ljava/io/FileDescriptor;JIJ)I'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: gLong, arg2: number, arg3: gLong): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'writev0(Ljava/io/FileDescriptor;JI)J'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: gLong, arg2: number): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'close0(Ljava/io/FileDescriptor;)V'(thread: threading.JVMThread, arg0: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'preClose0(Ljava/io/FileDescriptor;)V'(thread: threading.JVMThread, arg0: java_object.JavaObject): void {
    // NOP, I think the actual fs.close is called later. If not, NBD.
  }

  public static 'closeIntFD(I)V'(thread: threading.JVMThread, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'init()V'(thread: threading.JVMThread): void {
    // NOP
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

registerNatives({
  'sun/nio/ch/FileChannelImpl': sun_nio_ch_FileChannelImpl,
  'sun/nio/ch/FileDispatcher': sun_nio_ch_FileDispatcher,
  'sun/nio/ch/NativeThread': sun_nio_ch_NativeThread
});
