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

class classes_doppio_Debug {

  public static 'SetLogLevel(Lclasses/doppio/Debug$LogLevel;)V'(rs: runtime.RuntimeState, loglevel: java_object.JavaObject): void {
    logging.log_level = loglevel.get_field(rs, 'Lclasses/doppio/Debug$LogLevel;level');
  }

  public static 'GetLogLevel()Lclasses/doppio/Debug$LogLevel;'(rs: runtime.RuntimeState): java_object.JavaObject {
    var ll_cls = <ClassData.ReferenceClassData> rs.get_bs_class('Lclasses/doppio/Debug$LogLevel;');
    switch (logging.log_level) {
      case 10:
        return ll_cls.static_get(rs, 'VTRACE');
      case 9:
        return ll_cls.static_get(rs, 'TRACE');
      case 5:
        return ll_cls.static_get(rs, 'DEBUG');
      default:
        return ll_cls.static_get(rs, 'ERROR');
    }
  }

}

class classes_doppio_JavaScript {

  public static 'eval(Ljava/lang/String;)Ljava/lang/String;'(rs: runtime.RuntimeState, to_eval: java_object.JavaObject): java_object.JavaObject {
    var rv = eval(to_eval.jvm2js_str());
    // Coerce to string, if possible.
    if (rv != null) {
      return rs.init_string("" + rv);
    } else {
      return null;
    }
  }

}

// Export line. This is what DoppioJVM sees.
({
  'classes/doppio/Debug': classes_doppio_Debug,
  'classes/doppio/JavaScript': classes_doppio_JavaScript
})
