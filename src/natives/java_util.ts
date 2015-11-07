import JVMTypes = require('../../includes/JVMTypes');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
declare var registerNatives: (defs: any) => void;

class java_util_concurrent_atomic_AtomicLong {

  public static 'VMSupportsCS8()Z'(thread: JVMThread): boolean {
    return true;
  }

}

class java_util_jar_JarFile {

  public static 'getMetaInfEntryNames()[Ljava/lang/String;'(thread: JVMThread, javaThis: JVMTypes.java_util_jar_JarFile): JVMTypes.JVMArray<JVMTypes.java_lang_String> {
    // @todo Hook up to JAR file parser.
    return null;
  }

}

class java_util_logging_FileHandler {

  public static 'isSetUID()Z'(thread: JVMThread): boolean {
    // Our FS does not support setUID.
    return false;
  }

}

class java_util_TimeZone {

  public static 'getSystemTimeZoneID(Ljava/lang/String;)Ljava/lang/String;'(thread: JVMThread, arg0: JVMTypes.java_lang_String): JVMTypes.java_lang_String {
    // XXX not sure what the local value is
    return thread.getJVM().internString('GMT');
  }

  public static 'getSystemGMTOffsetID()Ljava/lang/String;'(thread: JVMThread): JVMTypes.java_lang_String {
    // XXX may not be correct
    return null;
  }

}

registerNatives({
  'java/util/concurrent/atomic/AtomicLong': java_util_concurrent_atomic_AtomicLong,
  'java/util/jar/JarFile': java_util_jar_JarFile,
  'java/util/logging/FileHandler': java_util_logging_FileHandler,
  'java/util/TimeZone': java_util_TimeZone
});
