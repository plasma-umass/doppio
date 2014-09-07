import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import enums = require('../enums');
declare var registerNatives: (defs: any) => void;

function doPrivileged(thread: threading.JVMThread, action: java_object.JavaObject, ctx?: java_object.JavaObject): void {
  var m = action.cls.method_lookup(thread, 'run()Ljava/lang/Object;'),
    args: any[] = [];
  if (m != null) {
    if (!m.access_flags["static"]) {
      args.push(action);
    }
    var strace = thread.getStackTrace();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    thread.runMethod(m, args, (e?, rv?) => {
      if (e) {
        // Wrap exception in a PrivilegedActionException, and throw it.
        thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
        thread.getBsCl().initializeClass(thread, 'Ljava/security/PrivilegedActionException;', (cdata: ClassData.ReferenceClassData) => {
          if (cdata != null) {
            var eobj = new java_object.JavaObject(cdata),
              m2 = cdata.method_lookup(thread, '<init>(Ljava/lang/Exception;)V');
            thread.runMethod(m2, [eobj, e], (e?, rv?) => {
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
}

class java_security_AccessController {

  public static 'doPrivileged(Ljava/security/PrivilegedAction;)Ljava/lang/Object;': (thread: threading.JVMThread, action: java_object.JavaObject) => void = doPrivileged;
  public static 'doPrivileged(Ljava/security/PrivilegedAction;Ljava/security/AccessControlContext;)Ljava/lang/Object;': (thread: threading.JVMThread, action: java_object.JavaObject, ctx: java_object.JavaObject) => void = doPrivileged;
  public static 'doPrivileged(Ljava/security/PrivilegedExceptionAction;)Ljava/lang/Object;': (thread: threading.JVMThread, action: java_object.JavaObject) => void = doPrivileged;
  public static 'doPrivileged(Ljava/security/PrivilegedExceptionAction;Ljava/security/AccessControlContext;)Ljava/lang/Object;': (thread: threading.JVMThread, action: java_object.JavaObject, ctx: java_object.JavaObject) => void = doPrivileged;

  public static 'getStackAccessControlContext()Ljava/security/AccessControlContext;'(thread: threading.JVMThread): java_object.JavaObject {
    return null;
  }

  public static 'getInheritedAccessControlContext()Ljava/security/AccessControlContext;'(thread: threading.JVMThread): java_object.JavaObject {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

registerNatives({
  'java/security/AccessController': java_security_AccessController
});
