import threading = require('../threading');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import enums = require('../enums');
import JVMTypes = require('../../includes/JVMTypes');
declare var registerNatives: (defs: any) => void;

class java_util_concurrent_atomic_AtomicLong {

  public static 'VMSupportsCS8()Z'(thread: threading.JVMThread): boolean {
    return true;
  }

}

class java_util_jar_JarFile {

  public static 'getMetaInfEntryNames()[Ljava/lang/String;'(thread: threading.JVMThread, javaThis: JVMTypes.java_util_jar_JarFile): JVMTypes.JVMArray<JVMTypes.java_lang_String> {
    // @todo Hook up to JAR file parser.
    return null;
  }

}

class java_util_logging_FileHandler {

  public static 'isSetUID()Z'(thread: threading.JVMThread): boolean {
    // Our FS does not support setUID.
    return false;
  }

}

class java_util_TimeZone {

  public static 'getSystemTimeZoneID(Ljava/lang/String;)Ljava/lang/String;'(thread: threading.JVMThread, arg0: JVMTypes.java_lang_String): JVMTypes.java_lang_String {
    // XXX not sure what the local value is
    return thread.getThreadPool().getJVM().internString('GMT');
  }

  public static 'getSystemGMTOffsetID()Ljava/lang/String;'(thread: threading.JVMThread): JVMTypes.java_lang_String {
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

//@ sourceURL=natives/java_util.js