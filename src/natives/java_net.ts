import runtime = require('../runtime');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import exceptions = require('../exceptions');

declare var Websock: {
  new (): java_object.IWebsock;
}

var host_lookup: {[addr: number]: string} = {},
  host_reverse_lookup: {[real_addr: string]: number} = {},
  // 240.0.0.0 .. 250.0.0.0 is currently unused address space
  next_host_address = 0xF0000000;

// See RFC 6455 section 7.4
function websocket_status_to_message(status: number): string {
  switch (status) {
    case 1000:
      return 'Normal closure';
    case 1001:
      return 'Endpoint is going away';
    case 1002:
      return 'WebSocket protocol error';
    case 1003:
      return 'Server received invalid data';
  }
  return 'Unknown status code or error';
}

function next_address(): number {
  next_host_address++;
  if (next_host_address > 0xFA000000) {
    logging.error('Out of addresses');
    next_host_address = 0xF0000000;
  }
  return next_host_address;
}

function pack_address(address: number[]): number {
  var i: number, ret = 0;
  for (i = 3; i >= 0; i--) {
    ret |= address[i] & 0xFF;
    ret <<= 8;
  }
  return ret;
}

function host_allocate_address(address: string): number {
  var ret = next_address();
  host_lookup[ret] = address;
  host_reverse_lookup[address] = ret;
  return ret;
}

/**
 * Asynchronously read data from a socket. Note that if this passes 0 to the
 * callback, Java will think it has received an EOF. Thus, we should wait until:
 * - We have at least one byte to return.
 * - The socket is closed.
 */
function socket_read_async(impl: java_object.JavaObject, b: java_object.JavaArray, offset: number, len: number, resume_cb: (arg: number) => void): void {
  var i: number,
    available = impl.$ws.rQlen(),
    trimmed_len = available < len ? available : len,
    read = impl.$ws.rQshiftBytes(trimmed_len);
  for (i = 0; i < trimmed_len; i++) {
    b.array[offset++] = read[i];
  }
  resume_cb(trimmed_len);
}

class java_net_Inet4Address {

  public static 'init()V'(rs: runtime.RuntimeState): void {
    // NOP
  }

}

class java_net_Inet4AddressImpl {

  public static 'getLocalHostName()Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): java_object.JavaObject {
    return rs.init_string('localhost');
  }

  public static 'lookupAllHostAddr(Ljava/lang/String;)[Ljava/net/InetAddress;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, hostname: java_object.JavaObject): void {
    var cdata = <ClassData.ReferenceClassData> rs.get_class('Ljava/net/Inet4Address;'),
      success = (rv, success_cb, except_cb) => {
        success_cb(new java_object.JavaArray(rs, <ClassData.ArrayClassData> rs.get_bs_class('[Ljava/net/InetAddress;'), [rv]));
      },
      failure = (e_cb, success_cb, except_cb) => {
        except_cb(e_cb);
      },
      cons = cdata.method_lookup(rs, '<init>(Ljava/lang/String;I)V');
    rs.call_bytecode(cdata, cons, [hostname, host_allocate_address(hostname.jvm2js_str())], success, failure);
  }

  public static 'getHostByAddr([B)Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, addr: java_object.JavaArray): java_object.JavaObject {
    var ret = host_reverse_lookup[pack_address(addr.array)];
    if (ret === void 0) {
      return null;
    }
    return rs.init_string("" + ret);
  }

  public static 'isReachable0([BI[BI)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaArray, arg1: number, arg2: java_object.JavaArray, arg3: number): boolean {
    return false;
  }

}

class java_net_Inet6Address {

  public static 'init()V'(rs: runtime.RuntimeState): void {
    // NOP
  }

}

class java_net_InetAddress {

  public static 'init()V'(rs: runtime.RuntimeState): void {
    // NOP
  }

}

class java_net_InetAddressImplFactory {

  public static 'isIPv6Supported()Z'(rs: runtime.RuntimeState): boolean {
    return false;
  }

}

class java_net_PlainSocketImpl {

  public static 'socketCreate(Z)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, isServer: number): void {
    // Check to make sure we're in a browser and the websocket libraries are present
    if (!util.are_in_browser()) {
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets are disabled');
    }
    var fd = javaThis.get_field(rs, 'Ljava/net/SocketImpl;fd');
    // Make the FileDescriptor valid with a dummy fd
    fd.set_field(rs, 'Ljava/io/FileDescriptor;fd', 8374);
    // Finally, create our websocket instance
    javaThis.$ws = new Websock();
    javaThis.$is_shutdown = false;
  }

  public static 'socketConnect(Ljava/net/InetAddress;II)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, address: java_object.JavaObject, port: number, timeout: number): void {
    var i: number,
      // The IPv4 case
      holder = address.get_field(rs, 'Ljava/net/InetAddress;holder'),
      addy = holder.get_field(rs, 'Ljava/net/InetAddress$InetAddressHolder;address'),
      // Assume scheme is ws for now
      host = 'ws://';
    if (host_lookup[addy] == null) {
      // Populate host string based off of IP address
      for (i = 3; i >= 0; i--) {
        var shift = i * 8;
        host += "" + ((addy & (0xFF << shift)) >>> shift) + ".";
      }
      // trim last '.'
      host = host.substring(0, host.length - 1);
    } else {
      host += host_lookup[addy];
    }
    // Add port
    host += ":" + port;
    logging.debug("Connecting to " + host + " with timeout = " + timeout + " ms");
    rs.async_op((resume_cb, except_cb) => {
      var id = 0,
        clear_state = () => {
          window.clearTimeout(id);
          javaThis.$ws.on('open', () => { });
          javaThis.$ws.on('close', () => { });
          javaThis.$ws.on('error', () => { });
        },
        error_cb = (msg) => {
          return (e) => {
            clear_state();
            except_cb(() => {
              rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), msg + ": " + e);
            });
          };
        },
        close_cb = (msg) => {
          return (e) => {
            clear_state();
            except_cb(() => {
              rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), msg + ": " + websocket_status_to_message(e.status));
            });
          };
        };
      // Success case
      javaThis.$ws.on('open', () => {
        logging.debug('Open!');
        clear_state();
        return resume_cb();
      });
      // Error cases
      javaThis.$ws.on('close', close_cb('Connection failed! (Closed)'));
      // Timeout case. In the case of no timeout, we set a default one of 10s.
      if (timeout === 0) {
        timeout = 10000;
      }
      id = setTimeout(error_cb('Connection timeout!'), timeout);
      logging.debug("Host: " + host);
      // Launch!
      try {
        javaThis.$ws.open(host);
      } catch (err) {
        error_cb('Connection failed! (exception)')(err.message);
      }
    });
  }

  public static 'socketBind(Ljava/net/InetAddress;I)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to bind');
  }

  public static 'socketListen(I)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to listen');
  }

  public static 'socketAccept(Ljava/net/SocketImpl;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to accept');
  }

  public static 'socketAvailable()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    rs.async_op((resume_cb) => {
      setImmediate(() => {
        resume_cb(javaThis.$ws.rQlen());
      });
    });
  }

  public static 'socketClose0(Z)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number): void {
    // TODO: Something isn't working here
    return javaThis.$ws.close();
  }

  public static 'socketShutdown(I)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number): void {
    javaThis.$is_shutdown = true;
  }

  public static 'initProto()V'(rs: runtime.RuntimeState): void {
    // NOP
  }

  public static 'socketSetOption(IZLjava/lang/Object;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number, arg1: number, arg2: java_object.JavaObject): void {
    // NOP
  }

  public static 'socketGetOption(ILjava/lang/Object;)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number, arg1: java_object.JavaObject): number {
    // NOP
    return 0;
  }

  public static 'socketGetOption1(ILjava/lang/Object;Ljava/io/FileDescriptor;)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number, arg1: java_object.JavaObject, arg2: java_object.JavaObject): number {
    // NOP
    return 0;
  }

  public static 'socketSendUrgentData(I)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, data: number): void {
    // Urgent data is meant to jump ahead of the
    // outbound stream. We keep no notion of this,
    // so queue up the byte like normal
    javaThis.$ws.send(data);
  }

}

class java_net_SocketInputStream {

  public static 'socketRead0(Ljava/io/FileDescriptor;[BIII)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, fd: java_object.JavaObject, b: java_object.JavaArray, offset: number, len: number, timeout: number): void {
    var impl = javaThis.get_field(rs, 'Ljava/net/SocketInputStream;impl');
    if (impl.$is_shutdown === true) {
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), 'Socket is shutdown.');
    }
    rs.async_op((resume_cb) => {
      setTimeout(() => { socket_read_async(impl, b, offset, len, resume_cb) }, timeout);
    });
  }

  public static 'init()V'(rs: runtime.RuntimeState): void {
    // NOP
  }

}

class java_net_SocketOutputStream {

  public static 'socketWrite0(Ljava/io/FileDescriptor;[BII)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, fd: java_object.JavaObject, b: java_object.JavaArray, offset: number, len: number): void {
    var impl = javaThis.get_field(rs, 'Ljava/net/SocketOutputStream;impl');
    if (impl.$is_shutdown === true) {
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), 'Socket is shutdown.');
    }
    if (impl.$ws.get_raw_state() !== WebSocket.OPEN) {
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), 'Connection isn\'t open');
    }
    // TODO: This can be optimized by accessing the 'Q' directly
    impl.$ws.send(b.array.slice(offset, offset + len));
    // Let the browser write it out
    rs.async_op((resume_cb) => {
      setImmediate(() => {
        resume_cb();
      });
    });
  }

  public static 'init()V'(rs: runtime.RuntimeState): void {
    // NOP
  }

}

({
  'java/net/Inet4Address': java_net_Inet4Address,
  'java/net/Inet4AddressImpl': java_net_Inet4AddressImpl,
  'java/net/Inet6Address': java_net_Inet6Address,
  'java/net/InetAddress': java_net_InetAddress,
  'java/net/InetAddressImplFactory': java_net_InetAddressImplFactory,
  'java/net/PlainSocketImpl': java_net_PlainSocketImpl,
  'java/net/SocketInputStream': java_net_SocketInputStream,
  'java/net/SocketOutputStream': java_net_SocketOutputStream
})
