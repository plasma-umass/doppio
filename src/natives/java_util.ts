import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import enums = require('../enums');
declare var registerNatives: (defs: any) => void;

class java_util_concurrent_atomic_AtomicLong {

  public static 'VMSupportsCS8()Z'(thread: threading.JVMThread): boolean {
    return true;
  }

}

class java_util_jar_JarFile {

  public static 'getMetaInfEntryNames()[Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaObject): java_object.JavaArray {
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

  public static 'getSystemTimeZoneID(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;'(thread: threading.JVMThread, arg0: java_object.JavaObject, arg1: java_object.JavaObject): java_object.JavaObject {
    // XXX not sure what the local value is
    return thread.getThreadPool().getJVM().internString('GMT');
  }

  public static 'getSystemGMTOffsetID()Ljava/lang/String;'(thread: threading.JVMThread): java_object.JavaObject {
    // XXX may not be correct
    return null;
  }

}

class java_util_ResourceBundle {

  public static 'getClassContext()[Ljava/lang/Class;'(thread: threading.JVMThread, javaThis: java_object.JavaObject): java_object.JavaArray {
    // return an array of classes for each method on the stack
    // starting with the current method and going up the call chain
    var classes: java_object.JavaClassObject[] = [],
      stack = thread.getStackTrace(),
      i: number;
    for (i = stack.length - 1; i >= 0; i--) {
      var sf = stack[i];
      classes.push(sf.method.cls.get_class_object(thread));
    }
    return new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Ljava/lang/Class;'), classes);
  }
}

registerNatives({
  'java/util/concurrent/atomic/AtomicLong': java_util_concurrent_atomic_AtomicLong,
  'java/util/jar/JarFile': java_util_jar_JarFile,
  'java/util/logging/FileHandler': java_util_logging_FileHandler,
  'java/util/ResourceBundle': java_util_ResourceBundle,
  'java/util/TimeZone': java_util_TimeZone
});
