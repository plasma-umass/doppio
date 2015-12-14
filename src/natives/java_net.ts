import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import IJVMConstructor = Doppio.VM.ClassFile.IJVMConstructor;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import ThreadStatus = Doppio.VM.Enums.ThreadStatus;
import debug = logging.debug;
import interfaces = Doppio.VM.Interfaces;
import JVMTypes = require('../../includes/JVMTypes');
declare var registerNatives: (defs: any) => void;

declare var Websock: {
  new (): interfaces.IWebsock;
}

/**
 * If an application wants to open a TCP/UDP connection to "foobar.com", the application must first perform
 * a DNS lookup to determine the IP of that domain, and then open a socket to that IP. Doppio needs to emulate
 * this same functionality in JavaScript.
 *
 * However, the browser does not expose any DNS interfaces, as DNS lookup is provided opaquely by the browser
 * platform. For example, an application can make a WebSocket connection directly to "https://foobar.com/", and
 * will never know that domain's IP.
 *
 * To get around this missing functionality, Doppio returns an unused private IP in the range of 240.0.0.0 to
 * 250.0.0.0 for each unique DNS lookup. Doppio uses this IP as a token for that particular DNS lookup. When
 * the application attempts to connect to an IP in this range, Doppio uses the IP as a key into a hash table,
 * which returns a domain name that Doppio uses in the resulting WebSocket connection. An application will never
 * try to connect to one of these invalid IP addresses directly, so Doppio can distinguish between connections to
 * specific IP addresses and connections to domains.
 */
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
function socket_read_async(impl: JVMTypes.java_net_PlainSocketImpl, b: JVMTypes.JVMArray<number>, offset: number, len: number, resume_cb: (arg: number) => void): void {
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

  public static 'init()V'(thread: JVMThread): void {
    // NOP
  }

}

class java_net_Inet4AddressImpl {

  public static 'getLocalHostName()Ljava/lang/String;'(thread: JVMThread, javaThis: JVMTypes.java_net_Inet4AddressImpl): JVMTypes.java_lang_String {
    return thread.getJVM().internString('localhost');
  }

  public static 'lookupAllHostAddr(Ljava/lang/String;)[Ljava/net/InetAddress;'(thread: JVMThread, javaThis: JVMTypes.java_net_Inet4AddressImpl, hostname: JVMTypes.java_lang_String): void {
    var rv = util.newObject<JVMTypes.java_net_Inet4Address>(thread, thread.getBsCl(), 'Ljava/net/Inet4Address;');
    rv['<init>(Ljava/lang/String;I)V'](thread, [hostname, host_allocate_address(hostname.toString())], (e?: JVMTypes.java_lang_Throwable) => {
      if (e) {
        thread.throwException(e);
      } else {
        thread.asyncReturn(util.newArrayFromData<JVMTypes.java_net_InetAddress>(thread, thread.getBsCl(), '[Ljava/net/InetAddress;', [rv]));
      }
    });
  }

  public static 'getHostByAddr([B)Ljava/lang/String;'(thread: JVMThread, javaThis: JVMTypes.java_net_Inet4AddressImpl, addr: JVMTypes.JVMArray<number>): JVMTypes.java_lang_String {
    var ret = host_reverse_lookup[pack_address(addr.array)];
    if (ret == null) {
      return null;
    }
    return util.initString(thread.getBsCl(), "" + ret);
  }

  public static 'isReachable0([BI[BI)Z'(thread: JVMThread, javaThis: JVMTypes.java_net_Inet4AddressImpl, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: JVMTypes.JVMArray<number>, arg3: number): boolean {
    return false;
  }

}

class java_net_Inet6Address {

  public static 'init()V'(thread: JVMThread): void {
    // NOP
  }

}

class java_net_InetAddress {

  public static 'init()V'(thread: JVMThread): void {
    // NOP
  }

}

class java_net_InetAddressImplFactory {

  public static 'isIPv6Supported()Z'(thread: JVMThread): boolean {
    return false;
  }

}

class java_net_PlainSocketImpl {

  public static 'socketCreate(Z)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, isServer: number): void {
    // Check to make sure we're in a browser and the websocket libraries are present
    if (!util.are_in_browser()) {
      thread.throwNewException('Ljava/io/IOException;', 'WebSockets are disabled');
    } else {
      var fd = javaThis['java/net/SocketImpl/fd'];
      // Make the FileDescriptor valid with a dummy fd
      fd['java/io/FileDescriptor/fd'] = 8374;
      // Finally, create our websocket instance
      javaThis.$ws = new Websock();
      javaThis.$is_shutdown = false;
    }
  }

  public static 'socketConnect(Ljava/net/InetAddress;II)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, address: JVMTypes.java_net_InetAddress, port: number, timeout: number): void {
    var i: number,
      // The IPv4 case
      holder = address['java/net/InetAddress/holder'],
      addy = holder['java/net/InetAddress$InetAddressHolder/address'],
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
    debug("Connecting to " + host + " with timeout = " + timeout + " ms");
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    var id = 0,
      clear_state = () => {
        window.clearTimeout(id);
        javaThis.$ws.on('open', () => { });
        javaThis.$ws.on('close', () => { });
        javaThis.$ws.on('error', () => { });
      },
      error_cb = (msg: string) => {
        return (e: any) => {
          clear_state();
          thread.throwNewException('Ljava/io/IOException;', msg + ": " + e);
        };
      },
      close_cb = (msg: string) => {
        return (e: any) => {
          clear_state();
          thread.throwNewException('Ljava/io/IOException;', msg + ": " + websocket_status_to_message(e.status));
        };
      };
    // Success case
    javaThis.$ws.on('open', () => {
      debug('Open!');
      clear_state();
      thread.asyncReturn();
    });
    // Error cases
    javaThis.$ws.on('close', close_cb('Connection failed! (Closed)'));
    // Timeout case. In the case of no timeout, we set a default one of 10s.
    if (timeout === 0) {
      timeout = 10000;
    }
    // XXX: Casting to a number because NodeJS typings specify a Timer object.
    id = <number><any> setTimeout(error_cb('Connection timeout!'), timeout);
    debug("Host: " + host);
    // Launch!
    try {
      javaThis.$ws.open(host);
    } catch (err) {
      error_cb('Connection failed! (exception)')(err.message);
    }
  }

  public static 'socketBind(Ljava/net/InetAddress;I)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, arg0: JVMTypes.java_net_InetAddress, arg1: number): void {
    thread.throwNewException('Ljava/io/IOException;', 'WebSockets doesn\'t know how to bind');
  }

  public static 'socketListen(I)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, arg0: number): void {
    thread.throwNewException('Ljava/io/IOException;', 'WebSockets doesn\'t know how to listen');
  }

  public static 'socketAccept(Ljava/net/SocketImpl;)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, arg0: JVMTypes.java_net_SocketImpl): void {
    thread.throwNewException('Ljava/io/IOException;', 'WebSockets doesn\'t know how to accept');
  }

  public static 'socketAvailable()I'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl): void {
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    setImmediate(() => {
      thread.asyncReturn(javaThis.$ws.rQlen());
    });
  }

  public static 'socketClose0(Z)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, arg0: number): void {
    // TODO: Something isn't working here
    javaThis.$ws.close();
  }

  public static 'socketShutdown(I)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, arg0: number): void {
    javaThis.$is_shutdown = true;
  }

  public static 'initProto()V'(thread: JVMThread): void {
    // NOP
  }

  public static 'socketSetOption0(IZLjava/lang/Object;)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, arg0: number, arg1: number, arg2: JVMTypes.java_lang_Object): void {
    // NOP
  }

  public static 'socketGetOption(ILjava/lang/Object;)I'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, arg0: number, arg1: JVMTypes.java_lang_Object): number {
    // NOP
    return 0;
  }

  public static 'socketSendUrgentData(I)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, data: number): void {
    // Urgent data is meant to jump ahead of the
    // outbound stream. We keep no notion of this,
    // so queue up the byte like normal
    javaThis.$ws.send(data);
  }

}

class java_net_SocketInputStream {

  public static 'socketRead0(Ljava/io/FileDescriptor;[BIII)I'(thread: JVMThread, javaThis: JVMTypes.java_net_SocketInputStream, fd: JVMTypes.java_io_FileDescriptor, b: JVMTypes.JVMArray<number>, offset: number, len: number, timeout: number): void {
    var impl = <JVMTypes.java_net_PlainSocketImpl> javaThis['java/net/SocketInputStream/impl'];
    if (impl.$is_shutdown === true) {
      thread.throwNewException('Ljava/io/IOException;', 'Socket is shutdown.');
    } else {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      setTimeout(() => {
        socket_read_async(impl, b, offset, len, (arg: number) => {
          thread.asyncReturn(arg);
        })
      }, timeout);
    }
  }

  public static 'init()V'(thread: JVMThread): void {
    // NOP
  }

}

class java_net_SocketOutputStream {

  public static 'socketWrite0(Ljava/io/FileDescriptor;[BII)V'(thread: JVMThread, javaThis: JVMTypes.java_net_SocketOutputStream, fd: JVMTypes.java_io_FileDescriptor, b: JVMTypes.JVMArray<number>, offset: number, len: number): void {
    var impl = <JVMTypes.java_net_PlainSocketImpl> javaThis['java/net/SocketOutputStream/impl'];
    if (impl.$is_shutdown === true) {
      thread.throwNewException('Ljava/io/IOException;', 'Socket is shutdown.');
    } else if (impl.$ws.get_raw_state() !== WebSocket.OPEN) {
      thread.throwNewException('Ljava/io/IOException;', 'Connection isn\'t open');
    } else {
      // TODO: This can be optimized by accessing the 'Q' directly
      impl.$ws.send(b.array.slice(offset, offset + len));
      // Let the browser write it out
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      setImmediate(() => {
        thread.asyncReturn();
      });
    }
  }

  public static 'init()V'(thread: JVMThread): void {
    // NOP
  }

}

class java_net_NetworkInterface {
  public static 'init()V'(thread: JVMThread): void {
    // NOP
  }

  public static 'getAll()[Ljava/net/NetworkInterface;'(thread: JVMThread): void {
    let bsCl = thread.getBsCl();
    // Create a fake network interface bound to 127.1.1.1.
    thread.import(['Ljava/net/NetworkInterface;', 'Ljava/net/InetAddress;'], (rv: [IJVMConstructor<JVMTypes.java_net_NetworkInterface>, typeof JVMTypes.java_net_InetAddress]) => {
      let niCons = rv[0], inetStatics = rv[1],
        iName = thread.getJVM().internString('doppio1');
      inetStatics['getByAddress(Ljava/lang/String;[B)Ljava/net/InetAddress;'](thread,
        [iName, util.newArrayFromData<number>(thread, thread.getBsCl(), '[B', [127,1,1,1])], (e?: JVMTypes.java_lang_Throwable, rv?: JVMTypes.java_net_InetAddress) => {
        if (e) {
          thread.throwException(e);
        } else {
          var niObj = new niCons(thread);
          niObj['<init>(Ljava/lang/String;I[Ljava/net/InetAddress;)V'](thread, [iName, 0, util.newArrayFromData<JVMTypes.java_net_InetAddress>(thread, bsCl, '[Ljava/net/InetAddress;', [rv])], (e?: JVMTypes.java_lang_Throwable) => {
            if (e) {
              thread.throwException(e);
            } else {
              thread.asyncReturn(util.newArrayFromData<JVMTypes.java_net_NetworkInterface>(thread, bsCl, '[Ljava/net/NetworkInterface;', [niObj]));
            }
          });
        }
      });
    });
  }

  public static 'getMacAddr0([BLjava/lang/String;I)[B'(thread: JVMThread, inAddr: JVMTypes.JVMArray<number>, name: JVMTypes.JVMArray<number>, ind: number): JVMTypes.JVMArray<number> {
    return util.newArrayFromData<number>(thread, thread.getBsCl(), '[B', [1,1,1,1,1,1]);
  }
}

registerNatives({
  'java/net/Inet4Address': java_net_Inet4Address,
  'java/net/Inet4AddressImpl': java_net_Inet4AddressImpl,
  'java/net/Inet6Address': java_net_Inet6Address,
  'java/net/InetAddress': java_net_InetAddress,
  'java/net/InetAddressImplFactory': java_net_InetAddressImplFactory,
  'java/net/PlainSocketImpl': java_net_PlainSocketImpl,
  'java/net/SocketInputStream': java_net_SocketInputStream,
  'java/net/SocketOutputStream': java_net_SocketOutputStream,
  'java/net/NetworkInterface': java_net_NetworkInterface
});
