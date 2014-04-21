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

class java_nio_Bits {

  public static 'copyFromByteArray(Ljava/lang/Object;JJJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
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

({
  'java/nio/Bits': java_nio_Bits,
  'java/nio/MappedByteBuffer': java_nio_MappedByteBuffer
})
