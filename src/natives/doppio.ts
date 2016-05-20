import JVMTypes = require('../../includes/JVMTypes');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
declare var registerNatives: (defs: any) => void;

class doppio_Debug {

  public static 'SetLogLevel(Ldoppio/Debug$LogLevel;)V'(thread: JVMThread, loglevel: JVMTypes.doppio_Debug$LogLevel): void {
    logging.log_level = loglevel['doppio/Debug$LogLevel/level'];
  }

  public static 'GetLogLevel()Ldoppio/Debug$LogLevel;'(thread: JVMThread): JVMTypes.doppio_Debug$LogLevel {
    var ll_cls = <typeof JVMTypes.doppio_Debug$LogLevel> (<ReferenceClassData<JVMTypes.doppio_Debug$LogLevel>> thread.getBsCl().getInitializedClass(thread, 'Ldoppio/Debug$LogLevel;')).getConstructor(thread);
    switch (logging.log_level) {
      case 10:
        return ll_cls['doppio/Debug$LogLevel/VTRACE'];
      case 9:
        return ll_cls['doppio/Debug$LogLevel/TRACE'];
      case 5:
        return ll_cls['doppio/Debug$LogLevel/DEBUG'];
      default:
        return ll_cls['doppio/Debug$LogLevel/ERROR'];
    }
  }

}

class doppio_JavaScript {

  public static 'eval(Ljava/lang/String;)Ljava/lang/String;'(thread: JVMThread, to_eval: JVMTypes.java_lang_String): JVMTypes.java_lang_String {
    try {
      var rv = eval(to_eval.toString());
      // Coerce to string, if possible.
      if (rv != null) {
        return util.initString(thread.getBsCl(), "" + rv);
      } else {
        return null;
      }
    } catch (e) {
      thread.throwNewException('Ljava/lang/Exception;', `Error evaluating string: ${e}`);
    }
  }

}

registerNatives({
  'doppio/Debug': doppio_Debug,
  'doppio/JavaScript': doppio_JavaScript
});
