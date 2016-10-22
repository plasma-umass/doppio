import * as JVMTypes from '../../includes/JVMTypes';
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;

export default function (): any {
  class sun_net_spi_DefaultProxySelector {

    public static 'init()Z'(thread: JVMThread): boolean {
      return true;
    }

    public static 'getSystemProxy(Ljava/lang/String;Ljava/lang/String;)Ljava/net/Proxy;'(thread: JVMThread, javaThis: JVMTypes.sun_net_spi_DefaultProxySelector, arg0: JVMTypes.java_lang_String, arg1: JVMTypes.java_lang_String): JVMTypes.java_net_Proxy {
      return null;
    }

  }

  return {
    'sun/net/spi/DefaultProxySelector': sun_net_spi_DefaultProxySelector
  };
};
