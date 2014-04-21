import runtime = require('../runtime');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');

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

({
  'classes/doppio/Debug': classes_doppio_Debug,
  'classes/doppio/JavaScript': classes_doppio_JavaScript
})
