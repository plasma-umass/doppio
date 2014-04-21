import attributes = require("../../build/dev-cli/src/attributes");
import ClassData = require("../../build/dev-cli/src/ClassData");
import ClassLoader = require("../../build/dev-cli/src/ClassLoader");
import ConstantPool = require("../../build/dev-cli/src/ConstantPool");
import difflib = require("../../build/dev-cli/src/difflib");
import disassembler = require("../../build/dev-cli/src/disassembler");
import doppio = require("../../build/dev-cli/src/doppio");
import enums = require("../../build/dev-cli/src/enums");
import exceptions = require("../../build/dev-cli/src/exceptions");
import gLong = require("../../build/dev-cli/src/gLong");
import jar = require("../../build/dev-cli/src/jar");
import java_cli = require("../../build/dev-cli/src/java_cli");
import java_object = require("../../build/dev-cli/src/java_object");
import jvm = require("../../build/dev-cli/src/jvm");
import logging = require("../../build/dev-cli/src/logging");
import methods = require("../../build/dev-cli/src/methods");
import opcodes = require("../../build/dev-cli/src/opcodes");
import option_parser = require("../../build/dev-cli/src/option_parser");
import runtime = require("../../build/dev-cli/src/runtime");
import testing = require("../../build/dev-cli/src/testing");
import threading = require("../../build/dev-cli/src/threading");
import util = require("../../build/dev-cli/src/util");
import fs = require('fs');

class sun_nio_ch_FileChannelImpl {

  public static 'lock0(Ljava/io/FileDescriptor;ZJJZ)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number, arg2: gLong, arg3: gLong, arg4: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'release0(Ljava/io/FileDescriptor;JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'map0(IJJ)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number, arg1: gLong, arg2: gLong): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'unmap0(JJ)I'(rs: runtime.RuntimeState, arg0: gLong, arg1: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'force0(Ljava/io/FileDescriptor;Z)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'truncate0(Ljava/io/FileDescriptor;J)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'transferTo0(IJJI)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number, arg1: gLong, arg2: gLong, arg3: number): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'position0(Ljava/io/FileDescriptor;J)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, fd: java_object.JavaObject, offset: gLong): gLong {
    var parent = javaThis.get_field(rs, 'Lsun/nio/ch/FileChannelImpl;parent');
    return gLong.fromNumber(offset.equals(gLong.NEG_ONE) ? parent.$pos : parent.$pos = offset.toNumber());
  }

  public static 'size0(Ljava/io/FileDescriptor;)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, fd_obj: java_object.JavaObject): void {
    var fd = fd_obj.get_field(rs, "Ljava/io/FileDescriptor;fd");
    rs.async_op(function (cb, e_cb) {
      fs.fstat(fd, function (err, stats) {
        if (null != err)
          e_cb(() => { rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class("Ljava/io/IOException;"), "Bad file descriptor."); });
        cb(gLong.fromNumber(stats.size));
      });
    });
  }

  /**
   * this poorly-named method actually specifies the page size for mmap
   * This is the Mac name for sun/misc/Unsafe::pageSize. Apparently they
   * wanted to ensure page sizes can be > 2GB...
   */
  public static 'initIDs()J'(rs: runtime.RuntimeState): gLong {
    // arbitrary
    return gLong.fromNumber(1024);
  }

}

class sun_nio_ch_FileDispatcher {

  public static 'read0(Ljava/io/FileDescriptor;JI)I'(rs: runtime.RuntimeState, fd_obj: java_object.JavaObject, address: gLong, len: number): void {
    var fd = fd_obj.get_field(rs, "Ljava/io/FileDescriptor;fd"),
      // read upto len bytes and store into mmap'd buffer at address
      block_addr = rs.block_addr(address),
      buf = new Buffer(len);
    rs.async_op((cb) => {
      fs.read(fd, buf, 0, len, 0, function (err, bytes_read) {
        var i: number;
        if ("undefined" != typeof DataView && null !== DataView)
          for (i = 0; bytes_read > i; i++)
            rs.mem_blocks[block_addr].setInt8(i, buf.readInt8(i));
        else
          for (i = 0; bytes_read > i; i++)
            rs.mem_blocks[block_addr + i] = buf.readInt8(i);
        cb(bytes_read);
      });
    });
  }

  public static 'pread0(Ljava/io/FileDescriptor;JIJ)I'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: number, arg3: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'readv0(Ljava/io/FileDescriptor;JI)J'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: number): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'write0(Ljava/io/FileDescriptor;JI)I'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'pwrite0(Ljava/io/FileDescriptor;JIJ)I'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: number, arg3: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'writev0(Ljava/io/FileDescriptor;JI)J'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: number): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'close0(Ljava/io/FileDescriptor;)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'preClose0(Ljava/io/FileDescriptor;)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): void {
    // NOP, I think the actual fs.close is called later. If not, NBD.
  }

  public static 'closeIntFD(I)V'(rs: runtime.RuntimeState, arg0: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'init()V'(rs: runtime.RuntimeState): void {
    // NOP
  }

}

class sun_nio_ch_NativeThread {

  public static 'current()J'(rs: runtime.RuntimeState): gLong {
    // -1 means that we do not require signaling according to the
    // docs.
    return gLong.fromNumber(-1);
  }

  public static 'signal(J)V'(rs: runtime.RuntimeState, arg0: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'init()V'(rs: runtime.RuntimeState): void {
    // NOP
  }

}

({
  'sun/nio/ch/FileChannelImpl': sun_nio_ch_FileChannelImpl,
  'sun/nio/ch/FileDispatcher': sun_nio_ch_FileDispatcher,
  'sun/nio/ch/NativeThread': sun_nio_ch_NativeThread
})
