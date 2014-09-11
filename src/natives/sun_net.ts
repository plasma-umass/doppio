import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
declare var registerNatives: (defs: any) => void;

class sun_net_spi_DefaultProxySelector {

  public static 'init()Z'(thread: threading.JVMThread): boolean {
    return true;
  }

  public static 'getSystemProxy(Ljava/lang/String;Ljava/lang/String;)Ljava/net/Proxy;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: java_object.JavaObject): java_object.JavaObject {
    return null;
  }

}

registerNatives({
  'sun/net/spi/DefaultProxySelector': sun_net_spi_DefaultProxySelector
});
