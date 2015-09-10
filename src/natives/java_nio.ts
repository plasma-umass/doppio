import JVMTypes = require("../../includes/JVMTypes");
import threading = require('../threading');
import gLong = require('../gLong');
import enums = require('../enums');
import ClassData = require('../ClassData');

declare var registerNatives: (natives: any) => void;

class java_nio_Bits {

  public static 'byteOrder()Ljava/nio/ByteOrder;'(thread: threading.JVMThread): JVMTypes.java_nio_ByteOrder {
    var cls = thread.getBsCl().getInitializedClass(thread, 'Ljava/nio/ByteOrder;');
    if (cls === null) {
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      thread.getBsCl().initializeClass(thread, 'Ljava/nio/ByteOrder;', (cdata: ClassData.ClassData) => {
        var rcdata = <ClassData.ReferenceClassData<JVMTypes.java_nio_ByteOrder>> cdata;
        if (rcdata !== null) {
          var cons = <typeof JVMTypes.java_nio_ByteOrder> <any> rcdata.getConstructor(thread);
          thread.asyncReturn(cons['java/nio/ByteOrder/LITTLE_ENDIAN']);
        }
      });
    } else {
      return (<typeof JVMTypes.java_nio_ByteOrder> <any>
        (<ClassData.ReferenceClassData<JVMTypes.java_nio_ByteOrder>> cls)
          .getConstructor(thread))['java/nio/ByteOrder/LITTLE_ENDIAN'];
    }
  }

  public static 'copyFromShortArray(Ljava/lang/Object;JJJ)V'(thread: threading.JVMThread, arg0: JVMTypes.java_lang_Object, arg1: gLong, arg2: gLong, arg3: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'copyToShortArray(JLjava/lang/Object;JJ)V'(thread: threading.JVMThread, arg0: gLong, arg1: JVMTypes.java_lang_Object, arg2: gLong, arg3: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'copyFromIntArray(Ljava/lang/Object;JJJ)V'(thread: threading.JVMThread, arg0: JVMTypes.java_lang_Object, arg1: gLong, arg2: gLong, arg3: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'copyToIntArray(JLjava/lang/Object;JJ)V'(thread: threading.JVMThread, arg0: gLong, arg1: JVMTypes.java_lang_Object, arg2: gLong, arg3: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'copyFromLongArray(Ljava/lang/Object;JJJ)V'(thread: threading.JVMThread, arg0: JVMTypes.java_lang_Object, arg1: gLong, arg2: gLong, arg3: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'copyToLongArray(JLjava/lang/Object;JJ)V'(thread: threading.JVMThread, arg0: gLong, arg1: JVMTypes.java_lang_Object, arg2: gLong, arg3: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_nio_MappedByteBuffer {

  public static 'isLoaded0(JJI)Z'(thread: threading.JVMThread, javaThis: JVMTypes.java_nio_MappedByteBuffer, arg0: gLong, arg1: gLong, arg2: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return 0;
  }

  public static 'load0(JJ)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_nio_MappedByteBuffer, arg0: gLong, arg1: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'force0(Ljava/io/FileDescriptor;JJ)V'(thread: threading.JVMThread, javaThis: JVMTypes.java_nio_MappedByteBuffer, arg0: JVMTypes.java_io_FileDescriptor, arg1: gLong, arg2: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_nio_charset_Charset$3 {

  public static 'run()Ljava/lang/Object;'(thread: threading.JVMThread, javaThis: JVMTypes.java_nio_charset_Charset$3): JVMTypes.java_lang_Object {
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
