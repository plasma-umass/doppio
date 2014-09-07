import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
declare var registerNatives: (defs: any) => void;

class sun_font_FreetypeFontScaler {

  public static 'initIDs(Ljava/lang/Class;)V'(thread: threading.JVMThread, arg0: java_object.JavaClassObject): void {
    // NOP
  }

  public static 'initNativeScaler(Lsun/font/Font2D;IIZI)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number, arg2: number, arg3: number, arg4: number): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getFontMetricsNative(Lsun/font/Font2D;JJ)Lsun/font/StrikeMetrics;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphAdvanceNative(Lsun/font/Font2D;JJI)F'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getGlyphMetricsNative(Lsun/font/Font2D;JJILjava/awt/geom/Point2D$Float;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number, arg4: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getGlyphImageNative(Lsun/font/Font2D;JJI)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphOutlineBoundsNative(Lsun/font/Font2D;JJI)Ljava/awt/geom/Rectangle2D$Float;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphOutlineNative(Lsun/font/Font2D;JJIFF)Ljava/awt/geom/GeneralPath;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number, arg4: number, arg5: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphVectorOutlineNative(Lsun/font/Font2D;JJ[IIFF)Ljava/awt/geom/GeneralPath;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: java_object.JavaArray, arg4: number, arg5: number, arg6: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphPointNative(Lsun/font/Font2D;JJII)Ljava/awt/geom/Point2D$Float;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: gLong, arg2: gLong, arg3: number, arg4: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getLayoutTableCacheNative(J)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'disposeNativeScaler(J)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getGlyphCodeNative(JC)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong, arg1: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getNumGlyphsNative(J)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getMissingGlyphCodeNative(J)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getUnitsPerEMNative(J)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'createScalerContextNative(J[DZIIFF)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong, arg1: java_object.JavaArray, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class sun_font_StrikeCache {

  public static 'getGlyphCacheDescription([J)V'(thread: threading.JVMThread, infoArray: java_object.JavaArray): void {
    // XXX: these are guesses, see the javadoc for full descriptions of the infoArray
    infoArray.array[0] = gLong.fromInt(8);        // size of a pointer
    infoArray.array[1] = gLong.fromInt(8); // size of a glyphInfo
  }

  public static 'freeIntPointer(I)V'(thread: threading.JVMThread, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'freeLongPointer(J)V'(thread: threading.JVMThread, arg0: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'freeIntMemory([IJ)V'(thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'freeLongMemory([JJ)V'(thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

registerNatives({
  'sun/font/FreetypeFontScaler': sun_font_FreetypeFontScaler,
  'sun/font/StrikeCache': sun_font_StrikeCache
});
