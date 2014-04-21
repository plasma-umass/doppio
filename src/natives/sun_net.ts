import runtime = require('../runtime');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import exceptions = require('../exceptions');

class sun_net_spi_DefaultProxySelector {

  public static 'init()Z'(rs: runtime.RuntimeState): boolean {
    return true;
  }

  public static 'getSystemProxy(Ljava/lang/String;Ljava/lang/String;)Ljava/net/Proxy;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: java_object.JavaObject): java_object.JavaObject {
    return null;
  }

}

({
  'sun/net/spi/DefaultProxySelector': sun_net_spi_DefaultProxySelector
})
