import attributes = require("../../build/dev-cli/src/attributes");
import ClassData = require("../../build/dev-cli/src/ClassData");
import ClassLoader = require("../../build/dev-cli/src/ClassLoader");
import ConstantPool = require("../../build/dev-cli/src/ConstantPool");
import difflib = require("../../build/dev-cli/src/difflib");
import disassembler = require("../../build/dev-cli/src/disassembler");
import doppio = require("../../build/dev-cli/src/doppio");
import enums = require("../../build/dev-cli/src/enums");
import exceptions = require("../../build/dev-cli/src/exceptions");
import gLong = require("../../build/dev-cli/src/gLong");
import jar = require("../../build/dev-cli/src/jar");
import java_cli = require("../../build/dev-cli/src/java_cli");
import java_object = require("../../build/dev-cli/src/java_object");
import jvm = require("../../build/dev-cli/src/jvm");
import logging = require("../../build/dev-cli/src/logging");
import methods = require("../../build/dev-cli/src/methods");
import natives = require("../../build/dev-cli/src/natives");
import opcodes = require("../../build/dev-cli/src/opcodes");
import option_parser = require("../../build/dev-cli/src/option_parser");
import runtime = require("../../build/dev-cli/src/runtime");
import testing = require("../../build/dev-cli/src/testing");
import threading = require("../../build/dev-cli/src/threading");
import util = require("../../build/dev-cli/src/util");

function doPrivileged(rs: runtime.RuntimeState, action: java_object.JavaObject, ctx?: java_object.JavaObject): void {
  var my_sf = rs.curr_frame();
  var m = action.cls.method_lookup(rs, 'run()Ljava/lang/Object;');
  if (m != null) {
    if (!m.access_flags["static"]) {
      rs.push(action);
    }
    m.setup_stack(rs);
    my_sf.runner = function () {
      var rv = rs.pop();
      rs.meta_stack().pop();
      rs.push(rv);
    };
    throw exceptions.ReturnException;
  } else {
    rs.async_op(function (resume_cb, except_cb) {
      action.cls.resolve_method(rs, 'run()Ljava/lang/Object;', (function () {
        rs.meta_stack().push(<any>{}); // dummy
        resume_cb();
      }), except_cb);
    });
  }
}

class java_security_AccessController {

  public static 'doPrivileged(Ljava/security/PrivilegedAction;)Ljava/lang/Object;': (rs: runtime.RuntimeState, action: java_object.JavaObject) => void = doPrivileged;
  public static 'doPrivileged(Ljava/security/PrivilegedAction;Ljava/security/AccessControlContext;)Ljava/lang/Object;': (rs: runtime.RuntimeState, action: java_object.JavaObject, ctx: java_object.JavaObject) => void = doPrivileged;
  public static 'doPrivileged(Ljava/security/PrivilegedExceptionAction;)Ljava/lang/Object;': (rs: runtime.RuntimeState, action: java_object.JavaObject) => void = doPrivileged;
  public static 'doPrivileged(Ljava/security/PrivilegedExceptionAction;Ljava/security/AccessControlContext;)Ljava/lang/Object;': (rs: runtime.RuntimeState, action: java_object.JavaObject, ctx: java_object.JavaObject) => void = doPrivileged;

  public static 'getStackAccessControlContext()Ljava/security/AccessControlContext;'(rs: runtime.RuntimeState): java_object.JavaObject {
    return null;
  }

  public static 'getInheritedAccessControlContext()Ljava/security/AccessControlContext;'(rs: runtime.RuntimeState): java_object.JavaObject {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

}

// Export line. This is what DoppioJVM sees.
({
  'java/security/AccessController': java_security_AccessController
})
