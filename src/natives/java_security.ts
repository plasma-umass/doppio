import JVMTypes = require('../../includes/JVMTypes');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import IJVMConstructor = Doppio.VM.ClassFile.IJVMConstructor;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import ThreadStatus = Doppio.VM.Enums.ThreadStatus;
declare var registerNatives: (defs: any) => void;

function doPrivileged(thread: JVMThread, action: JVMTypes.java_security_PrivilegedAction, ctx?: JVMTypes.java_security_AccessControlContext): void {
  thread.setStatus(ThreadStatus.ASYNC_WAITING);
  action['run()Ljava/lang/Object;'](thread, null, (e?: JVMTypes.java_lang_Throwable, rv?: JVMTypes.java_lang_Object): void => {
    if (e) {
      // If e is an UNCHECKED exception, re-throw it.
      // https://docs.oracle.com/javase/tutorial/essential/exceptions/runtime.html
      let eCls = e.getClass();
      let bsCl = thread.getBsCl();
      let errCls = bsCl.getInitializedClass(thread, 'Ljava/lang/Error;');
      let reCls = bsCl.getInitializedClass(thread, 'Ljava/lang/RuntimeException;');
      if ((errCls !== null && eCls.isCastable(errCls)) || (reCls !== null && eCls.isCastable(reCls))) {
        thread.throwException(e);
      } else {
        // It is a checked exception. Wrap exception in a PrivilegedActionException, and throw it.
        thread.import('Ljava/security/PrivilegedActionException;', (paeCons: IJVMConstructor<JVMTypes.java_security_PrivilegedActionException>) => {
          var eobj = new paeCons(thread);
          thread.setStatus(ThreadStatus.ASYNC_WAITING);
          eobj['<init>(Ljava/lang/Exception;)V'](thread, [<JVMTypes.java_lang_Exception> e], (e?: JVMTypes.java_lang_Throwable) => {
            if (e) {
              // Failed to construct a PrivilegedActionException? Dang.
              thread.throwException(e);
            } else {
              thread.throwException(eobj);
            }
          });
        }, false);
      }
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
