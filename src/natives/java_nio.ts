import JVMTypes = require('../../includes/JVMTypes');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import Long = Doppio.VM.Long;
import ClassData = Doppio.VM.ClassFile.ClassData;
import ThreadStatus = Doppio.VM.Enums.ThreadStatus;

declare var registerNatives: (natives: any) => void;

class java_nio_Bits {

  public static 'copyFromShortArray(Ljava/lang/Object;JJJ)V'(thread: JVMThread, arg0: JVMTypes.java_lang_Object, arg1: Long, arg2: Long, arg3: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'copyToShortArray(JLjava/lang/Object;JJ)V'(thread: JVMThread, arg0: Long, arg1: JVMTypes.java_lang_Object, arg2: Long, arg3: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'copyFromIntArray(Ljava/lang/Object;JJJ)V'(thread: JVMThread, arg0: JVMTypes.java_lang_Object, arg1: Long, arg2: Long, arg3: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'copyToIntArray(JLjava/lang/Object;JJ)V'(thread: JVMThread, arg0: Long, arg1: JVMTypes.java_lang_Object, arg2: Long, arg3: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'copyFromLongArray(Ljava/lang/Object;JJJ)V'(thread: JVMThread, arg0: JVMTypes.java_lang_Object, arg1: Long, arg2: Long, arg3: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'copyToLongArray(JLjava/lang/Object;JJ)V'(thread: JVMThread, arg0: Long, arg1: JVMTypes.java_lang_Object, arg2: Long, arg3: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_nio_MappedByteBuffer {

  public static 'isLoaded0(JJI)Z'(thread: JVMThread, javaThis: JVMTypes.java_nio_MappedByteBuffer, arg0: Long, arg1: Long, arg2: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return 0;
  }

  public static 'load0(JJ)V'(thread: JVMThread, javaThis: JVMTypes.java_nio_MappedByteBuffer, arg0: Long, arg1: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'force0(Ljava/io/FileDescriptor;JJ)V'(thread: JVMThread, javaThis: JVMTypes.java_nio_MappedByteBuffer, arg0: JVMTypes.java_io_FileDescriptor, arg1: Long, arg2: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_nio_charset_Charset$3 {

  public static 'run()Ljava/lang/Object;'(thread: JVMThread, javaThis: JVMTypes.java_nio_charset_Charset$3): JVMTypes.java_lang_Object {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return null;
  }

}

// Export line. This is what DoppioJVM sees.
registerNatives({
  'java/nio/Bits': java_nio_Bits,
  'java/nio/MappedByteBuffer': java_nio_MappedByteBuffer,
  'java/nio/charset/Charset$3': java_nio_charset_Charset$3
});
