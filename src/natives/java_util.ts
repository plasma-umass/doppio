import runtime = require('../runtime');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import exceptions = require('../exceptions');

class java_util_concurrent_atomic_AtomicLong {

  public static 'VMSupportsCS8()Z'(rs: runtime.RuntimeState): boolean {
    return true;
  }

}

class java_util_jar_JarFile {

  public static 'getMetaInfEntryNames()[Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): java_object.JavaArray {
    // @todo Hook up to JAR file parser.
    return null;
  }

}

class java_util_logging_FileHandler {

  public static 'isSetUID()Z'(rs: runtime.RuntimeState): boolean {
    // Our FS does not support setUID.
    return false;
  }

}

class java_util_prefs_FileSystemPreferences {

  public static 'lockFile0(Ljava/lang/String;IZ)[I'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: number, arg2: number): java_object.JavaArray {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'unlockFile0(I)I'(rs: runtime.RuntimeState, arg0: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'chmod(Ljava/lang/String;I)I'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

}

class java_util_TimeZone {

  public static 'getSystemTimeZoneID(Ljava/lang/String;Ljava/lang/String;)Ljava/lang/String;'(rs: runtime.RuntimeState, arg0: java_object.JavaObject, arg1: java_object.JavaObject): java_object.JavaObject {
    // XXX not sure what the local value is
    return rs.init_string('GMT');
  }

  public static 'getSystemGMTOffsetID()Ljava/lang/String;'(rs: runtime.RuntimeState): java_object.JavaObject {
    // XXX may not be correct
    return null;
  }

}

({
  'java/util/concurrent/atomic/AtomicLong': java_util_concurrent_atomic_AtomicLong,
  'java/util/jar/JarFile': java_util_jar_JarFile,
  'java/util/logging/FileHandler': java_util_logging_FileHandler,
  'java/util/prefs/FileSystemPreferences': java_util_prefs_FileSystemPreferences,
  'java/util/TimeZone': java_util_TimeZone
})
