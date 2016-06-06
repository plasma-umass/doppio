import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import IJVMConstructor = Doppio.VM.ClassFile.IJVMConstructor;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import ThreadStatus = Doppio.VM.Enums.ThreadStatus;
import debug = logging.debug;
import interfaces = Doppio.VM.Interfaces;
import NewSocket = Doppio.Socket.NewSocket;
import JVMTypes = require('../../includes/JVMTypes');
import * as net from 'net';
import * as dns from 'dns';
declare var registerNatives: (defs: any) => void;

const isNode = !util.are_in_browser();

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
let hostLookup: {[addr: number]: string} = {},
  hostReverseLookup: {[address: string]: number} = {},
  // 240.0.0.0 .. 250.0.0.0 is currently unused address space
  nextHostAddress = 0xF0000000;

// localhost: hardcode
hostLookup[hostReverseLookup['localhost'] = addressFromString('127.0.0.1')] = 'localhost';
console.log(hostReverseLookup['localhost']);
// See RFC 6455 section 7.4
function websocketStatusToMessage(status: number): string {
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

function nextAddress(): number {
  nextHostAddress++;
  if (nextHostAddress > 0xFA000000) {
    logging.error('Out of addresses');
    nextHostAddress = 0xF0000000;
  }
  // Turn into a signed number.
  return nextHostAddress | 0;
}

function packAddress(address: number[]): number {
  let data = new Buffer(4);
  for (let i = 0; i < 4; i++) {
    data.writeInt8(address[i], i);
  }
  return data.readInt32BE(0);
}

function hostAllocateAddress(address: string): number {
  if (hostReverseLookup[address]) {
    return hostReverseLookup[address];
  }

  let ret = nextAddress();
  hostLookup[ret] = address;
  hostReverseLookup[address] = ret;
  return ret;
}

function addressFromString(address: string): number {
  let portions = address.split('.').map((val) => parseInt(val, 10));
  let rv = 0;
  for (let i = 0; i < 4; i++) {
    let shift = (3-i) * 8;
    rv |= portions[i] << shift;
  }
  console.log(`${address} => ${rv | 0}`)
  return rv | 0;
}

function addressToString(address: number[]): string {
  let addressComponents = new Array<number>(address.length);
  let data = new Buffer(4);
  for (let i = 0; i < 3; i++) {
    data.writeInt8(address[i], i);
    addressComponents[i] = data.readUInt8(i);
  }
  return addressComponents.join('.');
}

function addressNumberToString(address: number): string {
  console.log(address);
  let data = new Buffer(4);
  data.writeInt32BE(address, 0);
  let ip = new Array<number>(4);
  for (let i = 0; i < 4; i++) {
    ip[i] = data.readUInt8(i);
  }
  return ip.join('.');
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

  public static 'lookupAllHostAddr(Ljava/lang/String;)[Ljava/net/InetAddress;'(thread: JVMThread, javaThis: JVMTypes.java_net_Inet4AddressImpl, javaHostname: JVMTypes.java_lang_String): void {
    const hostname = javaHostname.toString();
    if (isNode) {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      dns.resolve4(hostname, (err, addresses) => {
        if (err) {
          thread.throwNewException('Ljava/net/UnknownHostException;', `${err}`);
        } else {
          const rv = addresses.map((address) => util.newObject<JVMTypes.java_net_Inet4Address>(thread, thread.getBsCl(), 'Ljava/net/Inet4Address;'));
          let i = 0;
          util.asyncForEach(rv, (addr: JVMTypes.java_net_Inet4Address, next: (err?: any) => void) => {
            addr['<init>(Ljava/lang/String;I)V'](thread, [javaHostname, addressFromString(addresses[i++])], next);
          }, (e) => {
            if (e) {
              thread.throwException(e);
            } else {
              thread.asyncReturn(util.newArrayFromData<JVMTypes.java_net_InetAddress>(thread, thread.getBsCl(), '[Ljava/net/InetAddress;', rv));
            }
          });
        }
      });
    } else {
      const rv = util.newObject<JVMTypes.java_net_Inet4Address>(thread, thread.getBsCl(), 'Ljava/net/Inet4Address;');
      rv['<init>(Ljava/lang/String;I)V'](thread, [javaHostname, hostAllocateAddress(hostname)], (e?: JVMTypes.java_lang_Throwable) => {
        if (e) {
          thread.throwException(e);
        } else {
          thread.asyncReturn(util.newArrayFromData<JVMTypes.java_net_InetAddress>(thread, thread.getBsCl(), '[Ljava/net/InetAddress;', [rv]));
        }
      });
    }
  }

  public static 'getHostByAddr([B)Ljava/lang/String;'(thread: JVMThread, javaThis: JVMTypes.java_net_Inet4AddressImpl, addr: JVMTypes.JVMArray<number>): JVMTypes.java_lang_String {
    if (isNode) {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      dns.reverse(addressToString(addr.array), (err, hostnames) => {
        if (err || hostnames.length === 0) {
          thread.throwNewException('Ljava/net/UnknownHostException;', `Unknown host: ${addressToString(addr.array)}`);
        } else {
          thread.asyncReturn(util.initString(thread.getBsCl(), hostnames[0]));
        }
      });
    } else {
      let ret = hostReverseLookup[packAddress(addr.array)];
      if (!ret) {
        return null;
      }
      return util.initString(thread.getBsCl(), "" + ret);
    }
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
    let fd = javaThis['java/net/SocketImpl/fd'];
    javaThis.$sock = NewSocket();
    fd['java/io/FileDescriptor/fd'] = javaThis.$sock.fd();
  }

  public static 'socketConnect(Ljava/net/InetAddress;II)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, address: JVMTypes.java_net_InetAddress, port: number, timeout: number): void {
    // The IPv4 case
    let holder = address['java/net/InetAddress/holder'],
      addy = holder['java/net/InetAddress$InetAddressHolder/address'],
      addyString: string;
    if (hostLookup[addy] == null) {
      addyString = addressNumberToString(addy);
    } else {
      addyString = hostLookup[addy];
    }
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    debug(`Connecting to ${addyString} with timeout of ${timeout} ms`);
    if (timeout === 0) {
      // If no timeout specified, use default of 10 seconds.
      timeout = 10000;
    }
    javaThis.$sock.connect(port, addyString, timeout, (e) => {
      if (e) {
        thread.throwNewException('Ljava/io/IOException;', e.message);
      } else {
        thread.asyncReturn();
      }
    });;
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

  public static 'socketAvailable()I'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl): number {
    return javaThis.$sock.available();
  }

  public static 'socketClose0(Z)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, arg0: number): void {
    javaThis.$sock.close();
  }

  public static 'socketShutdown(I)V'(thread: JVMThread, javaThis: JVMTypes.java_net_PlainSocketImpl, arg0: number): void {
    javaThis.$sock.shutdown();
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
    javaThis.$sock.write([data]);
  }

}

class java_net_SocketInputStream {

  public static 'socketRead0(Ljava/io/FileDescriptor;[BIII)I'(thread: JVMThread, javaThis: JVMTypes.java_net_SocketInputStream, fd: JVMTypes.java_io_FileDescriptor, b: JVMTypes.JVMArray<number>, offset: number, len: number, timeout: number): void | number {
    const impl = <JVMTypes.java_net_PlainSocketImpl> javaThis['java/net/SocketInputStream/impl'];
    const sock = impl.$sock;
    if (sock.available() >= len) {
      return sock.readSync(b.array, offset, len);
    } else {
      if (timeout === 0) {
        timeout = 10000;
      }
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      sock.readAsync(b.array, offset, len, timeout, (len) => {
        thread.asyncReturn(len);
      });
    }
  }

  public static 'init()V'(thread: JVMThread): void {
    // NOP
  }

}

class java_net_SocketOutputStream {

  public static 'socketWrite0(Ljava/io/FileDescriptor;[BII)V'(thread: JVMThread, javaThis: JVMTypes.java_net_SocketOutputStream, fd: JVMTypes.java_io_FileDescriptor, b: JVMTypes.JVMArray<number>, offset: number, len: number): void {
    const impl = <JVMTypes.java_net_PlainSocketImpl> javaThis['java/net/SocketOutputStream/impl'];
    const sock = impl.$sock;
    sock.write(b.array.slice(offset, offset + len));
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
