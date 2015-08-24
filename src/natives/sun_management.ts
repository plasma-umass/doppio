import threading = require('../threading');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import enums = require('../enums');
import JVMTypes = require('../../includes/JVMTypes');
declare var registerNatives: (defs: any) => void;

class sun_management_MemoryImpl {

  public static 'getMemoryPools0()[Ljava/lang/management/MemoryPoolMXBean;'(thread: threading.JVMThread): JVMTypes.JVMArray<JVMTypes.java_lang_management_MemoryPoolMXBean> {
    // XXX may want to revisit this 'NOP'
    return util.newArrayFromData<JVMTypes.sun_management_MemoryPoolImpl>(thread, thread.getBsCl(), '[Lsun/management/MemoryPoolImpl;', []);
  }

  public static 'getMemoryManagers0()[Ljava/lang/management/MemoryManagerMXBean;'(thread: threading.JVMThread): JVMTypes.JVMArray<JVMTypes.java_lang_management_MemoryManagerMXBean> {
    // XXX may want to revisit this 'NOP'
    return util.newArrayFromData<JVMTypes.sun_management_MemoryManagerImpl>(thread, thread.getBsCl(), '[Lsun/management/MemoryManagerImpl;', []);
  }

  public static 'getMemoryUsage0(Z)Ljava/lang/management/MemoryUsage;'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_MemoryImpl, arg0: number): JVMTypes.java_lang_management_MemoryUsage {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'setVerboseGC(Z)V'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_MemoryImpl, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class sun_management_VMManagementImpl {

  public static 'getVersion0()Ljava/lang/String;'(thread: threading.JVMThread): JVMTypes.java_lang_String {
    return thread.getThreadPool().getJVM().internString("1.2");
  }

  public static 'initOptionalSupportFields()V'(thread: threading.JVMThread): void {
    var vmManagementStatics = <typeof JVMTypes.sun_management_VMManagementImpl> (<ClassData.ReferenceClassData<JVMTypes.sun_management_VMManagementImpl>> thread.getBsCl().getInitializedClass(thread, 'Lsun/management/VMManagementImpl;')).getConstructor(thread);
    vmManagementStatics['sun/management/VMManagementImpl/compTimeMonitoringSupport'] = 0;
    vmManagementStatics['sun/management/VMManagementImpl/threadContentionMonitoringSupport'] = 0;
    vmManagementStatics['sun/management/VMManagementImpl/currentThreadCpuTimeSupport'] = 0;
    vmManagementStatics['sun/management/VMManagementImpl/otherThreadCpuTimeSupport'] = 0;
    vmManagementStatics['sun/management/VMManagementImpl/bootClassPathSupport'] = 0;
    vmManagementStatics['sun/management/VMManagementImpl/objectMonitorUsageSupport'] = 0;
    vmManagementStatics['sun/management/VMManagementImpl/synchronizerUsageSupport'] = 0;
  }

  public static 'isThreadContentionMonitoringEnabled()Z'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): boolean {
    return false;
  }

  public static 'isThreadCpuTimeEnabled()Z'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): boolean {
    return false;
  }

  public static 'getTotalClassCount()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getUnloadedClassCount()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getVerboseClass()Z'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getVerboseGC()Z'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getProcessId()I'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): number {
    return 1;
  }

  public static 'getVmArguments0()[Ljava/lang/String;'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): JVMTypes.JVMArray<JVMTypes.java_lang_String> {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getStartupTime()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    return gLong.fromNumber(thread.getThreadPool().getJVM().getStartupTime().getTime());
  }

  public static 'getAvailableProcessors()I'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): number {
    return 1;
  }

  public static 'getTotalCompileTime()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getTotalThreadCount()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getLiveThreadCount()I'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getPeakThreadCount()I'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getDaemonThreadCount()I'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'getSafepointCount()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getTotalSafepointTime()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getSafepointSyncTime()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getTotalApplicationNonStoppedTime()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getLoadedClassSize()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getUnloadedClassSize()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getClassLoadingTime()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getMethodDataSize()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getInitializedClassCount()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getClassInitializationTime()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'getClassVerificationTime()J'(thread: threading.JVMThread, javaThis: JVMTypes.sun_management_VMManagementImpl): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

registerNatives({
  'sun/management/MemoryImpl': sun_management_MemoryImpl,
  'sun/management/VMManagementImpl': sun_management_VMManagementImpl
});

//@ sourceURL=natives/sun_management.js