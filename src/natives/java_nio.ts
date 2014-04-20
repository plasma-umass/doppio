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
import natives = require("../../build/dev-cli/src/natives");
import opcodes = require("../../build/dev-cli/src/opcodes");
import option_parser = require("../../build/dev-cli/src/option_parser");
import runtime = require("../../build/dev-cli/src/runtime");
import testing = require("../../build/dev-cli/src/testing");
import threading = require("../../build/dev-cli/src/threading");
import util = require("../../build/dev-cli/src/util");

function unsafe_memcpy(rs: runtime.RuntimeState, src_base: java_object.JavaArray, src_offset_l: gLong, dest_base: java_object.JavaArray, dest_offset_l: gLong, num_bytes_l: gLong): void {
  // XXX assumes base object is an array if non-null
  // TODO: optimize by copying chunks at a time
  var num_bytes = num_bytes_l.toNumber();
  if (src_base != null) {
    var src_offset = src_offset_l.toNumber();
    if (dest_base != null) {
      // both are java arrays
      return java_object.arraycopy_no_check(src_base, src_offset, dest_base, dest_offset_l.toNumber(), num_bytes);
    } else {
      // src is an array, dest is a mem block
      var dest_addr = rs.block_addr(dest_offset_l);
      if (typeof DataView !== "undefined" && DataView !== null) {
        for (var i = 0; i < num_bytes; i++) {
          rs.mem_blocks[dest_addr].setInt8(i, src_base.array[src_offset + i]);
        }
      } else {
        for (var i = 0; i < num_bytes; i++) {
          rs.mem_blocks[dest_addr + i] = src_base.array[src_offset + i];
        }
      }
    }
  } else {
    var src_addr = rs.block_addr(src_offset_l);
    if (dest_base != null) {
      // src is a mem block, dest is an array
      var dest_offset = dest_offset_l.toNumber();
      if (typeof DataView !== "undefined" && DataView !== null) {
        for (var i = 0; i < num_bytes; i++) {
          dest_base.array[dest_offset + i] = rs.mem_blocks[src_addr].getInt8(i);
        }
      } else {
        for (var i = 0; i < num_bytes; i++) {
          dest_base.array[dest_offset + i] = rs.mem_blocks[src_addr + i];
        }
      }
    } else {
      // both are mem blocks
      var dest_addr = rs.block_addr(dest_offset_l);
      if (typeof DataView !== "undefined" && DataView !== null) {
        for (var i = 0; i < num_bytes; i++) {
          rs.mem_blocks[dest_addr].setInt8(i, rs.mem_blocks[src_addr].getInt8(i));
        }
      } else {
        for (var i = 0; i < num_bytes; i++) {
          rs.mem_blocks[dest_addr + i] = rs.mem_blocks[src_addr + i];
        }
      }
    }
  }
}

class java_nio_Bits {

  public static 'byteOrder()Ljava/nio/ByteOrder;'(rs: runtime.RuntimeState): java_object.JavaObject {
    var cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/nio/ByteOrder;');
    return cls.static_get(rs, 'LITTLE_ENDIAN');
  }

  public static 'copyFromByteArray(Ljava/lang/Object;JJJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyToByteArray(JLjava/lang/Object;JJ)V'(rs: runtime.RuntimeState, srcAddr: gLong, dst: java_object.JavaArray, dstPos: gLong, length: gLong): void {
    unsafe_memcpy(rs, null, srcAddr, dst, dstPos, length);
  }

  public static 'copyFromShortArray(Ljava/lang/Object;JJJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyToShortArray(JLjava/lang/Object;JJ)V'(rs: runtime.RuntimeState, arg0: gLong, arg1: java_object.JavaObject, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyFromIntArray(Ljava/lang/Object;JJJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyToIntArray(JLjava/lang/Object;JJ)V'(rs: runtime.RuntimeState, arg0: gLong, arg1: java_object.JavaObject, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyFromLongArray(Ljava/lang/Object;JJJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'copyToLongArray(JLjava/lang/Object;JJ)V'(rs: runtime.RuntimeState, arg0: gLong, arg1: java_object.JavaObject, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class java_nio_charset_Charset$3 {

  public static 'run()Ljava/lang/Object;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): java_object.JavaObject {
    return null;
  }

}

class java_nio_MappedByteBuffer {

  public static 'isLoaded0(JJI)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong, arg2: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'load0(JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'force0(JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

// Export line. This is what DoppioJVM sees.
({
  'java/nio/Bits': java_nio_Bits,
  'java/nio/charset/Charset$3': java_nio_charset_Charset$3,
  'java/nio/MappedByteBuffer': java_nio_MappedByteBuffer
})
