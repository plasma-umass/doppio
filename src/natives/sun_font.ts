import JVMTypes = require('../../includes/JVMTypes');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import Long = Doppio.VM.Long;
declare var registerNatives: (defs: any) => void;

class sun_font_FreetypeFontScaler {

  public static 'initIDs(Ljava/lang/Class;)V'(thread: JVMThread, arg0: JVMTypes.java_lang_Class): void {
    // NOP
  }

  public static 'initNativeScaler(Lsun/font/Font2D;IIZI)J'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: JVMTypes.sun_font_Font2D, arg1: number, arg2: number, arg3: number, arg4: number): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getFontMetricsNative(Lsun/font/Font2D;JJ)Lsun/font/StrikeMetrics;'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: JVMTypes.sun_font_Font2D, arg1: Long, arg2: Long): JVMTypes.sun_font_StrikeMetrics {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphAdvanceNative(Lsun/font/Font2D;JJI)F'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: JVMTypes.sun_font_Font2D, arg1: Long, arg2: Long, arg3: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getGlyphMetricsNative(Lsun/font/Font2D;JJILjava/awt/geom/Point2D$Float;)V'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: JVMTypes.sun_font_Font2D, arg1: Long, arg2: Long, arg3: number, arg4: JVMTypes.java_awt_geom_Point2D$Float): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getGlyphImageNative(Lsun/font/Font2D;JJI)J'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: JVMTypes.sun_font_Font2D, arg1: Long, arg2: Long, arg3: number): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphOutlineBoundsNative(Lsun/font/Font2D;JJI)Ljava/awt/geom/Rectangle2D$Float;'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: JVMTypes.sun_font_Font2D, arg1: Long, arg2: Long, arg3: number): JVMTypes.java_awt_geom_Rectangle2D$Float {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphOutlineNative(Lsun/font/Font2D;JJIFF)Ljava/awt/geom/GeneralPath;'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: JVMTypes.sun_font_Font2D, arg1: Long, arg2: Long, arg3: number, arg4: number, arg5: number): JVMTypes.java_awt_geom_GeneralPath {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphVectorOutlineNative(Lsun/font/Font2D;JJ[IIFF)Ljava/awt/geom/GeneralPath;'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: JVMTypes.sun_font_Font2D, arg1: Long, arg2: Long, arg3: JVMTypes.JVMArray<number>, arg4: number, arg5: number, arg6: number): JVMTypes.java_awt_geom_GeneralPath {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getGlyphPointNative(Lsun/font/Font2D;JJII)Ljava/awt/geom/Point2D$Float;'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: JVMTypes.sun_font_Font2D, arg1: Long, arg2: Long, arg3: number, arg4: number): JVMTypes.java_awt_geom_Point2D$Float {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getLayoutTableCacheNative(J)J'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: Long): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'disposeNativeScaler(Lsun/font/Font2D;J)V'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getNumGlyphsNative(J)I'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: Long): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getMissingGlyphCodeNative(J)I'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: Long): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getUnitsPerEMNative(J)J'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: Long): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'createScalerContextNative(J[DIIFF)J'(thread: JVMThread, javaThis: JVMTypes.sun_font_FreetypeFontScaler, arg0: Long, arg1: JVMTypes.JVMArray<number>, arg2: number, arg3: number, arg4: number, arg5: number, arg6: number): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

class sun_font_StrikeCache {

  public static 'getGlyphCacheDescription([J)V'(thread: JVMThread, infoArray: JVMTypes.JVMArray<Long>): void {
    // XXX: these are guesses, see the javadoc for full descriptions of the infoArray
    infoArray.array[0] = Long.fromInt(8);        // size of a pointer
    infoArray.array[1] = Long.fromInt(8); // size of a glyphInfo
  }

  public static 'freeIntPointer(I)V'(thread: JVMThread, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'freeLongPointer(J)V'(thread: JVMThread, arg0: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'freeIntMemory([IJ)V'(thread: JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'freeLongMemory([JJ)V'(thread: JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

registerNatives({
  'sun/font/FreetypeFontScaler': sun_font_FreetypeFontScaler,
  'sun/font/StrikeCache': sun_font_StrikeCache
});
