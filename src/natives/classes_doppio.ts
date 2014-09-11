import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
declare var registerNatives: (defs: any) => void;

class classes_doppio_Debug {

  public static 'SetLogLevel(Lclasses/doppio/Debug$LogLevel;)V'(thread: threading.JVMThread, loglevel: java_object.JavaObject): void {
    logging.log_level = loglevel.get_field(thread, 'Lclasses/doppio/Debug$LogLevel;level');
  }

  public static 'GetLogLevel()Lclasses/doppio/Debug$LogLevel;'(thread: threading.JVMThread): java_object.JavaObject {
    var ll_cls = <ClassData.ReferenceClassData> thread.getBsCl().getInitializedClass(thread, 'Lclasses/doppio/Debug$LogLevel;');
    switch (logging.log_level) {
      case 10:
        return ll_cls.static_get(thread, 'VTRACE');
      case 9:
        return ll_cls.static_get(thread, 'TRACE');
      case 5:
        return ll_cls.static_get(thread, 'DEBUG');
      default:
        return ll_cls.static_get(thread, 'ERROR');
    }
  }

}

class classes_doppio_JavaScript {

  public static 'eval(Ljava/lang/String;)Ljava/lang/String;'(thread: threading.JVMThread, to_eval: java_object.JavaObject): java_object.JavaObject {
    var rv = eval(to_eval.jvm2js_str());
    // Coerce to string, if possible.
    if (rv != null) {
      return java_object.initString(thread.getBsCl(), "" + rv);
    } else {
      return null;
    }
  }

}

registerNatives({
  'classes/doppio/Debug': classes_doppio_Debug,
  'classes/doppio/JavaScript': classes_doppio_JavaScript
});
