import * as JVMTypes from '../../includes/JVMTypes';
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ArrayClassData = Doppio.VM.ClassFile.ArrayClassData;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import LogLevel = logging.LogLevel;
import util = Doppio.VM.Util;
import IJVMConstructor = Doppio.VM.ClassFile.IJVMConstructor;
import * as NodeCrypto from 'crypto';
declare var msCrypto: Crypto;

export default function (): any {
  class doppio_Debug {

    public static 'SetLogLevel(Ldoppio/Debug$LogLevel;)V'(thread: JVMThread, loglevel: JVMTypes.doppio_Debug$LogLevel): void {
      logging.setLogLevel(loglevel['doppio/Debug$LogLevel/level']);
    }

    public static 'GetLogLevel()Ldoppio/Debug$LogLevel;'(thread: JVMThread): JVMTypes.doppio_Debug$LogLevel {
      var ll_cls = <typeof JVMTypes.doppio_Debug$LogLevel> (<ReferenceClassData<JVMTypes.doppio_Debug$LogLevel>> thread.getBsCl().getInitializedClass(thread, 'Ldoppio/Debug$LogLevel;')).getConstructor(thread);
      switch (logging.logLevel) {
        case LogLevel.VTRACE:
          return ll_cls['doppio/Debug$LogLevel/VTRACE'];
        case LogLevel.TRACE:
          return ll_cls['doppio/Debug$LogLevel/TRACE'];
        case LogLevel.DEBUG:
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

  class doppio_security_BrowserPRNG {
    private static crypto = typeof(crypto) !== 'undefined' ? crypto : typeof(msCrypto) !== 'undefined' ? msCrypto : null;

    public static 'isAvailable()Z'(thread: JVMThread): boolean {
      // !! makes it a boolean.
      const crypto = doppio_security_BrowserPRNG.crypto;
      return !!(crypto && crypto.getRandomValues);
    }

    public static 'engineSetSeed([B)V'(thread: JVMThread, javaThis: JVMTypes.doppio_security_BrowserPRNG, seed: JVMTypes.JVMArray<number>): void {
      thread.throwNewException('Ljava/security/ProviderException;', 'engineSetSeed() failed.');
    }

    public static 'engineNextBytes([B)V'(thread: JVMThread, javaThis: JVMTypes.doppio_security_BrowserPRNG, bytes: JVMTypes.JVMArray<number>): void {
      const crypto = doppio_security_BrowserPRNG.crypto;
      crypto.getRandomValues(<Int8Array> <any> bytes.array);
    }

    public static 'engineGenerateSeed(I)[B'(thread: JVMThread, javaThis: JVMTypes.doppio_security_BrowserPRNG, numBytes: number): JVMTypes.JVMArray<number> {
      const crypto = doppio_security_BrowserPRNG.crypto;
      const bytes = util.newArrayFromClass(thread, <ArrayClassData<number>> thread.getBsCl().getInitializedClass(thread, '[B'), numBytes);
      crypto.getRandomValues(<Int8Array> <any> bytes.array);
      return bytes;
    }

  }

  class doppio_security_NodePRNG {
    public static 'isAvailable()Z'(thread: JVMThread): boolean {
      return !util.are_in_browser();
    }

    public static 'engineSetSeed([B)V'(thread: JVMThread, javaThis: JVMTypes.doppio_security_NodePRNG, seed: JVMTypes.JVMArray<number>): void {
      thread.throwNewException('Ljava/security/ProviderException;', 'engineSetSeed() failed.');
    }

    public static 'engineNextBytes([B)V'(thread: JVMThread, javaThis: JVMTypes.doppio_security_NodePRNG, bytes: JVMTypes.JVMArray<number>): void {
      const array = bytes.array;
      const len = array.length;
      const data = NodeCrypto.randomBytes(len);
      for (let i = 0; i < len; i++) {
        array[i] = data.readInt8(i);
      }
    }

    public static 'engineGenerateSeed(I)[B'(thread: JVMThread, javaThis: JVMTypes.doppio_security_NodePRNG, numBytes: number): JVMTypes.JVMArray<number> {
      const data = NodeCrypto.randomBytes(numBytes);
      const array = util.u82i8(data, 0, data.length);
      return util.newArrayFromDataWithClass(thread, <ArrayClassData<number>> thread.getBsCl().getInitializedClass(thread, '[B'), <any> array);
    }

  }

  return {
    'doppio/Debug': doppio_Debug,
    'doppio/JavaScript': doppio_JavaScript,
    "doppio/security/BrowserPRNG": doppio_security_BrowserPRNG,
    "doppio/security/NodePRNG": doppio_security_NodePRNG
  };
};
