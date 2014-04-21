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

class sun_font_FreetypeFontScaler {

  public static 'initIDs(Ljava/lang/Class;)V'(rs: runtime.RuntimeState, arg0: java_object.JavaClassObject): void {
    // NOP
  }

  public static 'initNativeScaler(Lsun/font/Font2D;IIZI)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number, arg2: number, arg3: number, arg4: number): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getFontMetricsNative(Lsun/font/Font2D;JJ)Lsun/font/StrikeMetrics;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphAdvanceNative(Lsun/font/Font2D;JJI)F'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getGlyphMetricsNative(Lsun/font/Font2D;JJILjava/awt/geom/Point2D$Float;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number, arg4: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getGlyphImageNative(Lsun/font/Font2D;JJI)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphOutlineBoundsNative(Lsun/font/Font2D;JJI)Ljava/awt/geom/Rectangle2D$Float;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphOutlineNative(Lsun/font/Font2D;JJIFF)Ljava/awt/geom/GeneralPath;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number, arg4: number, arg5: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphVectorOutlineNative(Lsun/font/Font2D;JJ[IIFF)Ljava/awt/geom/GeneralPath;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: java_object.JavaArray, arg4: number, arg5: number, arg6: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphPointNative(Lsun/font/Font2D;JJII)Ljava/awt/geom/Point2D$Float;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number, arg4: number): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getLayoutTableCacheNative(J)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'disposeNativeScaler(J)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'getGlyphCodeNative(JC)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getNumGlyphsNative(J)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getMissingGlyphCodeNative(J)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getUnitsPerEMNative(J)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'createScalerContextNative(J[DZIIFF)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong, arg1: java_object.JavaArray, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class sun_font_StrikeCache {

  public static 'getGlyphCacheDescription([J)V'(rs: runtime.RuntimeState, infoArray: java_object.JavaArray): void {
    // XXX: these are guesses, see the javadoc for full descriptions of the infoArray
    infoArray.array[0] = gLong.fromInt(8);        // size of a pointer
    infoArray.array[1] = gLong.fromInt(8); // size of a glyphInfo
  }

  public static 'freeIntPointer(I)V'(rs: runtime.RuntimeState, arg0: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'freeLongPointer(J)V'(rs: runtime.RuntimeState, arg0: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'freeIntMemory([IJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'freeLongMemory([JJ)V'(rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

// Export line. This is what DoppioJVM sees.
({
  'sun/font/FreetypeFontScaler': sun_font_FreetypeFontScaler,
  'sun/font/StrikeCache': sun_font_StrikeCache
})
