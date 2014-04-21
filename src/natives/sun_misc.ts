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

function unsafe_compare_and_swap(rs: runtime.RuntimeState, _this: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, expected: any, x: any): boolean {
  var actual = obj.get_field_from_offset(rs, offset);
  if (actual === expected) {
    obj.set_field_from_offset(rs, offset, x);
    return true;
  } else {
    return false;
  }
}

class sun_misc_GC {

  public static 'maxObjectInspectionAge()J'(rs: runtime.RuntimeState): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class sun_misc_MessageUtils {

  public static 'toStderr(Ljava/lang/String;)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'toStdout(Ljava/lang/String;)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class sun_misc_NativeSignalHandler {

  public static 'handle0(IJ)V'(rs: runtime.RuntimeState, arg0: number, arg1: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class sun_misc_Perf {

  public static 'attach(Ljava/lang/String;II)Ljava/nio/ByteBuffer;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number, arg2: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'detach(Ljava/nio/ByteBuffer;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'createLong(Ljava/lang/String;IIJ)Ljava/nio/ByteBuffer;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number, arg2: number, arg3: gLong): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'createByteArray(Ljava/lang/String;II[BI)Ljava/nio/ByteBuffer;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number, arg2: number, arg3: java_object.JavaArray, arg4: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'highResCounter()J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'highResFrequency()J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'registerNatives()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class sun_misc_Signal {

  public static 'findSignal(Ljava/lang/String;)I'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'handle0(IJ)J'(rs: runtime.RuntimeState, arg0: number, arg1: gLong): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'raise0(I)V'(rs: runtime.RuntimeState, arg0: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class sun_misc_Unsafe {

  public static 'getInt(Ljava/lang/Object;J)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putInt(Ljava/lang/Object;JI)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    return obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getObject(Ljava/lang/Object;J)Ljava/lang/Object;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): java_object.JavaObject {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putObject(Ljava/lang/Object;JLjava/lang/Object;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_obj: java_object.JavaObject): void {
    return obj.set_field_from_offset(rs, offset, new_obj);
  }

  public static 'getBoolean(Ljava/lang/Object;J)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putBoolean(Ljava/lang/Object;JZ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    return obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getByte(Ljava/lang/Object;J)B'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, address: gLong): number {
    var block_addr = rs.block_addr(address);
    if (typeof DataView !== "undefined" && DataView !== null) {
      return rs.mem_blocks[block_addr].getInt8(address.toNumber() - block_addr);
    } else {
      // Blocks are bytes.
      return rs.mem_blocks[block_addr];
    }
  }

  public static 'putByte(Ljava/lang/Object;JB)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getShort(Ljava/lang/Object;J)S'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putShort(Ljava/lang/Object;JS)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getChar(Ljava/lang/Object;J)C'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putChar(Ljava/lang/Object;JC)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    return obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getLong(Ljava/lang/Object;J)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): gLong {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putLong(Ljava/lang/Object;JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, address: gLong, value: gLong): void {
    var block_addr = rs.block_addr(address),
      offset = address.toNumber() - block_addr;
    // little endian
    if (typeof DataView !== "undefined" && DataView !== null) {
      rs.mem_blocks[block_addr].setInt32(offset, value.getLowBits(), true);
      rs.mem_blocks[block_addr].setInt32(offset + 4, value.getHighBits, true);
    } else {
      // Break up into 8 bytes. Hurray!
      var store_word = function (address: number, word: number) {
        // Little endian
        rs.mem_blocks[address] = word & 0xFF;
        rs.mem_blocks[address + 1] = (word >>> 8) & 0xFF;
        rs.mem_blocks[address + 2] = (word >>> 16) & 0xFF;
        rs.mem_blocks[address + 3] = (word >>> 24) & 0xFF;
      };
      store_word(address.toNumber(), value.getLowBits());
      store_word(address.toNumber() + 4, value.getHighBits());
    }
  }

  public static 'getFloat(Ljava/lang/Object;J)F'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putFloat(Ljava/lang/Object;JF)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getDouble(Ljava/lang/Object;J)D'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putDouble(Ljava/lang/Object;JD)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getByte(J)B'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putByte(JB)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getShort(J)S'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putShort(JS)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getChar(J)C'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putChar(JC)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getInt(J)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putInt(JI)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getLong(J)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'putLong(JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getFloat(J)F'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putFloat(JF)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getDouble(J)D'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'putDouble(JD)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getAddress(J)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'putAddress(JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'allocateMemory(J)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, size: gLong): gLong {
    var i: number, next_addr = util.last(rs.mem_start_addrs),
      sizeNum: number = size.toNumber();
    if (typeof DataView !== "undefined" && DataView !== null) {
      rs.mem_blocks[next_addr] = new DataView(new ArrayBuffer(sizeNum));
    } else {
      rs.mem_blocks[next_addr] = size;
      next_addr += 1;
      for (i = 0; i < sizeNum; i++) {
        rs.mem_blocks[next_addr + i] = 0;
      }
    }
    rs.mem_start_addrs.push(next_addr + size);
    return gLong.fromNumber(next_addr);
  }

  public static 'reallocateMemory(JJ)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: gLong): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'setMemory(JJB)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, address: gLong, bytes: gLong, value: number): void {
    var i: number, block_addr = rs.block_addr(address),
      bytesNum: number = bytes.toNumber();
    for (i = 0; i < bytesNum; i++) {
      if (typeof DataView !== "undefined" && DataView !== null) {
        rs.mem_blocks[block_addr].setInt8(i, value);
      } else {
        rs.mem_blocks[block_addr + i] = value;
      }
    }
  }

  public static 'copyMemory(Ljava/lang/Object;JLjava/lang/Object;JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: java_object.JavaObject, arg3: gLong, arg4: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'freeMemory(J)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, address: gLong): void {
    var i: number,  addrNum: number = address.toNumber();
    if (typeof DataView !== "undefined" && DataView !== null) {
      delete rs.mem_blocks[addrNum];
    } else {
      // XXX: Size will be just before address.
      var num_blocks = rs.mem_blocks[addrNum - 1];
      for (i = 0; i < num_blocks; i++) {
        delete rs.mem_blocks[addrNum + i];
      }
      delete rs.mem_blocks[addrNum - 1];
      // Restore to the actual start addr where size was.
      addrNum = addrNum - 1;
    }
    rs.mem_start_addrs.splice(rs.mem_start_addrs.indexOf(addrNum), 1);
  }

  public static 'staticFieldOffset(Ljava/lang/reflect/Field;)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, field: java_object.JavaObject): gLong {
    // we technically return a long, but it immediately gets casted to an int
    // XXX: encode both the class and slot information in an integer
    //      this may cause collisions, but it seems to work ok
    var jco = field.get_field(rs, 'Ljava/lang/reflect/Field;clazz'),
      slot = field.get_field(rs, 'Ljava/lang/reflect/Field;slot');
    return gLong.fromNumber(slot + jco.ref);
  }

  public static 'objectFieldOffset(Ljava/lang/reflect/Field;)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, field: java_object.JavaObject): gLong {
    // see note about staticFieldOffset
    var jco = field.get_field(rs, 'Ljava/lang/reflect/Field;clazz'),
      slot = field.get_field(rs, 'Ljava/lang/reflect/Field;slot');
    return gLong.fromNumber(slot + jco.ref);
  }

  public static 'staticFieldBase(Ljava/lang/reflect/Field;)Ljava/lang/Object;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, field: java_object.JavaObject): java_object.JavaObject {
    var cls = field.get_field(rs, 'Ljava/lang/reflect/Field;clazz');
    return new java_object.JavaObject(rs, cls.$cls);
  }

  public static 'ensureClassInitialized(Ljava/lang/Class;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, cls: java_object.JavaClassObject): void {
    return rs.async_op(function (resume_cb, except_cb) {
      // We modify resume_cb since this is a void function.
      return cls.$cls.loader.initialize_class(rs, cls.$cls.get_type(), (function () {
        return resume_cb();
      }), except_cb);
    });
  }

  public static 'arrayBaseOffset(Ljava/lang/Class;)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaClassObject): number {
    return 0;
  }

  public static 'arrayIndexScale(Ljava/lang/Class;)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaClassObject): number {
    return 1;
  }

  public static 'addressSize()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): number {
    return 4;
  }

  public static 'pageSize()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): number {
    return 1024;
  }

  public static 'defineClass(Ljava/lang/String;[BIILjava/lang/ClassLoader;Ljava/security/ProtectionDomain;)Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, name: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number, loader: java_object.JavaClassLoaderObject, pd: java_object.JavaObject): void {
    return rs.async_op(function (success_cb, except_cb) {
      return java_object.native_define_class(rs, name, bytes, offset, len, java_object.get_cl_from_jclo(rs, loader), success_cb, except_cb);
    });
  }

  public static 'defineClass(Ljava/lang/String;[BII)Ljava/lang/Class;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: java_object.JavaArray, arg2: number, arg3: number): java_object.JavaClassObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'allocateInstance(Ljava/lang/Class;)Ljava/lang/Object;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, jco: java_object.JavaClassObject): any {
    // This can trigger class initialization, so check if the class is
    // initialized.
    var cls = <ClassData.ReferenceClassData> jco.$cls;
    if (cls.is_initialized()) {
      return new java_object.JavaObject(rs, cls);
    } else {
      // 1 byte per block. Wasteful, terrible, etc... but good for now.
      // XXX: Stash allocation size here. Please hate me.
      return rs.async_op(function (resume_cb, except_cb) {
        return cls.loader.initialize_class(rs, cls.get_type(), (function () {
          return resume_cb(new java_object.JavaObject(rs, cls));
        }), except_cb);
      });
    }
  }

  public static 'monitorEnter(Ljava/lang/Object;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'monitorExit(Ljava/lang/Object;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'tryMonitorEnter(Ljava/lang/Object;)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'throwException(Ljava/lang/Throwable;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, exception: java_object.JavaObject): void {
    // XXX: Copied from java_throw, except instead of making a new Exception,
    //      we already have one. May want to make this a helper method.
    var my_sf = rs.curr_frame();
    my_sf.runner = function () {
      my_sf.runner = null;
      throw new exceptions.JavaException(exception);
    };
    throw exceptions.ReturnException;
  }

  public static 'compareAndSwapObject(Ljava/lang/Object;JLjava/lang/Object;Ljava/lang/Object;)Z': (rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: java_object.JavaObject, arg3: java_object.JavaObject) => boolean = unsafe_compare_and_swap;
  public static 'compareAndSwapInt(Ljava/lang/Object;JII)Z': (rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: number, arg3: number) => boolean = unsafe_compare_and_swap;
  public static 'compareAndSwapLong(Ljava/lang/Object;JJJ)Z': (rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong) => boolean = unsafe_compare_and_swap;

  public static 'getObjectVolatile(Ljava/lang/Object;J)Ljava/lang/Object;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): java_object.JavaObject {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putObjectVolatile(Ljava/lang/Object;JLjava/lang/Object;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: java_object.JavaObject): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getIntVolatile(Ljava/lang/Object;J)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putIntVolatile(Ljava/lang/Object;JI)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getBooleanVolatile(Ljava/lang/Object;J)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putBooleanVolatile(Ljava/lang/Object;JZ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getByteVolatile(Ljava/lang/Object;J)B'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putByteVolatile(Ljava/lang/Object;JB)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getShortVolatile(Ljava/lang/Object;J)S'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putShortVolatile(Ljava/lang/Object;JS)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getCharVolatile(Ljava/lang/Object;J)C'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putCharVolatile(Ljava/lang/Object;JC)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getLongVolatile(Ljava/lang/Object;J)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): gLong {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putLongVolatile(Ljava/lang/Object;JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: gLong): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getFloatVolatile(Ljava/lang/Object;J)F'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putFloatVolatile(Ljava/lang/Object;JF)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'getDoubleVolatile(Ljava/lang/Object;J)D'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong): number {
    return obj.get_field_from_offset(rs, offset);
  }

  public static 'putDoubleVolatile(Ljava/lang/Object;JD)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'putOrderedObject(Ljava/lang/Object;JLjava/lang/Object;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_obj: java_object.JavaObject): void {
    obj.set_field_from_offset(rs, offset, new_obj);
  }

  public static 'putOrderedInt(Ljava/lang/Object;JI)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: number): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'putOrderedLong(Ljava/lang/Object;JJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, obj: java_object.JavaObject, offset: gLong, new_value: gLong): void {
    obj.set_field_from_offset(rs, offset, new_value);
  }

  public static 'unpark(Ljava/lang/Object;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, thread: threading.JavaThreadObject): void {
    rs.unpark(thread);
  }

  public static 'park(ZJ)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, absolute: number, time: gLong): void {
    var timeout = Infinity;
    if (absolute) {
      timeout = time.toNumber();
    } else {
      // time is in nanoseconds, but we don't have that
      // type of precision
      if (time.toNumber() > 0) {
        timeout = (new Date).getTime() + time.toNumber() / 1000000;
      }
    }
    return rs.park(rs.curr_thread, timeout);
  }

  public static 'getLoadAverage([DI)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaArray, arg1: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

}

class sun_misc_Version {

  public static 'getJvmSpecialVersion()Ljava/lang/String;'(rs: runtime.RuntimeState): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getJdkSpecialVersion()Ljava/lang/String;'(rs: runtime.RuntimeState): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getJvmVersionInfo()Z'(rs: runtime.RuntimeState): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getJdkVersionInfo()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class sun_misc_VM {

  public static 'getThreadStateValues([[I[[Ljava/lang/String;)V'(rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: java_object.JavaArray): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'initialize()V'(rs: runtime.RuntimeState): void {
    var vm_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Lsun/misc/VM;');
    // this only applies to Java 7
    if (!(vm_cls.major_version >= 51)) {
      return;
    }
    // XXX: make savedProps refer to the system props
    var sys_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/System;'),
      props = sys_cls.static_get(rs, 'props');
    vm_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Lsun/misc/VM;');
    return vm_cls.static_put(rs, 'savedProps', props);
  }

}

class sun_misc_VMSupport {

  public static 'initAgentProperties(Ljava/util/Properties;)Ljava/util/Properties;'(rs: runtime.RuntimeState, arg0: java_object.JavaObject): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

({
  'sun/misc/GC': sun_misc_GC,
  'sun/misc/MessageUtils': sun_misc_MessageUtils,
  'sun/misc/NativeSignalHandler': sun_misc_NativeSignalHandler,
  'sun/misc/Perf': sun_misc_Perf,
  'sun/misc/Signal': sun_misc_Signal,
  'sun/misc/Unsafe': sun_misc_Unsafe,
  'sun/misc/Version': sun_misc_Version,
  'sun/misc/VM': sun_misc_VM,
  'sun/misc/VMSupport': sun_misc_VMSupport
})
