import threading = require('../threading');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import JVMTypes = require('../../includes/JVMTypes');
declare var registerNatives: (defs: any) => void;

class sun_net_spi_DefaultProxySelector {

  public static 'init()Z'(thread: threading.JVMThread): boolean {
    return true;
  }

  public static 'getSystemProxy(Ljava/lang/String;Ljava/lang/String;)Ljava/net/Proxy;'(thread: threading.JVMThread, javaThis: JVMTypes.sun_net_spi_DefaultProxySelector, arg0: JVMTypes.java_lang_String, arg1: JVMTypes.java_lang_String): JVMTypes.java_net_Proxy {
    return null;
  }

}

registerNatives({
  'sun/net/spi/DefaultProxySelector': sun_net_spi_DefaultProxySelector
});

//@ sourceURL=natives/sun_net.js