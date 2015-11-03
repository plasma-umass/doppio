import JVMTypes = require('../../includes/JVMTypes');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
declare var registerNatives: (defs: any) => void;

class classes_doppio_Debug {

  public static 'SetLogLevel(Lclasses/doppio/Debug$LogLevel;)V'(thread: JVMThread, loglevel: JVMTypes.classes_doppio_Debug$LogLevel): void {
    logging.log_level = loglevel['classes/doppio/Debug$LogLevel/level'];
  }

  public static 'GetLogLevel()Lclasses/doppio/Debug$LogLevel;'(thread: JVMThread): JVMTypes.classes_doppio_Debug$LogLevel {
    var ll_cls = <typeof JVMTypes.classes_doppio_Debug$LogLevel> (<ReferenceClassData<JVMTypes.classes_doppio_Debug$LogLevel>> thread.getBsCl().getInitializedClass(thread, 'Lclasses/doppio/Debug$LogLevel;')).getConstructor(thread);
    switch (logging.log_level) {
      case 10:
        return ll_cls['classes/doppio/Debug$LogLevel/VTRACE'];
      case 9:
        return ll_cls['classes/doppio/Debug$LogLevel/TRACE'];
      case 5:
        return ll_cls['classes/doppio/Debug$LogLevel/DEBUG'];
      default:
        return ll_cls['classes/doppio/Debug$LogLevel/ERROR'];
    }
  }

}

class classes_doppio_JavaScript {

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
  'classes/doppio/Debug': classes_doppio_Debug,
  'classes/doppio/JavaScript': classes_doppio_JavaScript
});
