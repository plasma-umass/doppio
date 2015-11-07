import JVMTypes = require('../../includes/JVMTypes');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import ThreadStatus = Doppio.VM.Enums.ThreadStatus;
declare var registerNatives: (defs: any) => void;

function doPrivileged(thread: JVMThread, action: JVMTypes.java_security_PrivilegedAction, ctx?: JVMTypes.java_security_AccessControlContext): void {
  thread.setStatus(ThreadStatus.ASYNC_WAITING);
  action['run()Ljava/lang/Object;'](thread, (e?: JVMTypes.java_lang_Throwable, rv?: JVMTypes.java_lang_Object): void => {
    if (e) {
      // Wrap exception in a PrivilegedActionException, and throw it.
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      thread.getBsCl().initializeClass(thread, 'Ljava/security/PrivilegedActionException;', (cdata: ReferenceClassData<JVMTypes.java_security_PrivilegedActionException>) => {
        if (cdata != null) {
          var eobj = new (cdata.getConstructor(thread))(thread);
          thread.setStatus(ThreadStatus.ASYNC_WAITING);
          eobj['<init>(Ljava/lang/Exception;)V'](thread, [<JVMTypes.java_lang_Exception> e], (e?: JVMTypes.java_lang_Throwable) => {
            if (e) {
              // Failed to construct a PrivilegedActionException? Dang.
              thread.throwException(e);
            } else {
              thread.throwException(eobj);
            }
          });
        }
      }, false);
    } else {
      // Forward return value.
      thread.asyncReturn(rv);
    }
  });
}

class java_security_AccessController {

  public static 'doPrivileged(Ljava/security/PrivilegedAction;)Ljava/lang/Object;': (thread: JVMThread, action: JVMTypes.java_security_PrivilegedAction) => void = doPrivileged;
  public static 'doPrivileged(Ljava/security/PrivilegedAction;Ljava/security/AccessControlContext;)Ljava/lang/Object;': (thread: JVMThread, action: JVMTypes.java_security_PrivilegedAction, ctx: JVMTypes.java_security_AccessControlContext) => void = doPrivileged;
  public static 'doPrivileged(Ljava/security/PrivilegedExceptionAction;)Ljava/lang/Object;': (thread: JVMThread, action: JVMTypes.java_security_PrivilegedExceptionAction) => void = doPrivileged;
  public static 'doPrivileged(Ljava/security/PrivilegedExceptionAction;Ljava/security/AccessControlContext;)Ljava/lang/Object;': (thread: JVMThread, action: JVMTypes.java_security_PrivilegedExceptionAction, ctx: JVMTypes.java_security_AccessControlContext) => void = doPrivileged;

  public static 'getStackAccessControlContext()Ljava/security/AccessControlContext;'(thread: JVMThread): JVMTypes.java_security_AccessControlContext {
    return null;
  }

  public static 'getInheritedAccessControlContext()Ljava/security/AccessControlContext;'(thread: JVMThread): JVMTypes.java_security_AccessControlContext {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

registerNatives({
  'java/security/AccessController': java_security_AccessController
});
