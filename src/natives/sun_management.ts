import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import enums = require('../enums');
declare var registerNatives: (defs: any) => void;

class sun_management_MemoryImpl {

  public static 'getMemoryPools0()[Ljava/lang/management/MemoryPoolMXBean;'(thread: threading.JVMThread): java_object.JavaArray {
    // XXX may want to revisit this 'NOP'
    return new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Lsun/management/MemoryPoolImpl;'), []);
  }

  public static 'getMemoryManagers0()[Ljava/lang/management/MemoryManagerMXBean;'(thread: threading.JVMThread): java_object.JavaArray {
    // XXX may want to revisit this 'NOP'
    return new java_object.JavaArray(<ClassData.ArrayClassData> thread.getBsCl().getInitializedClass(thread, '[Lsun/management/MemoryManagerImpl;'), []);
  }

  public static 'getMemoryUsage0(Z)Ljava/lang/management/MemoryUsage;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: number): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'setVerboseGC(Z)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_management_VMManagementImpl {

  public static 'getVersion0()Ljava/lang/String;'(thread: threading.JVMThread): java_object.JavaObject {
    return thread.getThreadPool().getJVM().internString("1.2");
  }

  public static 'initOptionalSupportFields()V'(thread: threading.JVMThread): void {
    var i: number,
      field_names = ['compTimeMonitoringSupport', 'threadContentionMonitoringSupport', 'currentThreadCpuTimeSupport', 'otherThreadCpuTimeSupport', 'bootClassPathSupport', 'objectMonitorUsageSupport', 'synchronizerUsageSupport'],
      vm_management_impl = <ClassData.ReferenceClassData> thread.getBsCl().getInitializedClass(thread, 'Lsun/management/VMManagementImpl;');
    // set everything to false
    for (i = 0; i < field_names.length; i++) {
      var name = field_names[i];
      vm_management_impl.static_put(thread, name, 0);
    }
  }

  public static 'isThreadContentionMonitoringEnabled()Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject): boolean {
    return false;
  }

  public static 'isThreadCpuTimeEnabled()Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject): boolean {
    return false;
  }

  public static 'getTotalClassCount()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getUnloadedClassCount()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getVerboseClass()Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getVerboseGC()Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getProcessId()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    return 1;
  }

  public static 'getVmArguments0()[Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaObject): java_object.JavaArray {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getStartupTime()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    return gLong.fromNumber(thread.getThreadPool().getJVM().getStartupTime().getTime());
  }

  public static 'getAvailableProcessors()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    return 1;
  }

  public static 'getTotalCompileTime()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getTotalThreadCount()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getLiveThreadCount()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getPeakThreadCount()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getDaemonThreadCount()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getSafepointCount()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getTotalSafepointTime()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getSafepointSyncTime()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getTotalApplicationNonStoppedTime()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getLoadedClassSize()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getUnloadedClassSize()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getClassLoadingTime()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMethodDataSize()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getInitializedClassCount()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getClassInitializationTime()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getClassVerificationTime()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

registerNatives({
  'sun/management/MemoryImpl': sun_management_MemoryImpl,
  'sun/management/VMManagementImpl': sun_management_VMManagementImpl
});
