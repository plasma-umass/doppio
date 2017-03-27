import {IWebsock} from './interfaces';
import * as net from 'net';
import logging = require('./logging');
import {are_in_browser} from './util';
const debug = logging.debug;

declare var Websock: {
  new (): IWebsock;
}

let nextFd = 30000;

// Used as an empty callback
function nop() {}

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

export function NewSocket(): DoppioSocket {
  if (are_in_browser()) {
    return WebsockifySocket.create();
  } else {
    return NodeSocket.create();
  }
}

/**
 * Doppio's socket interface. Implements basic features required to emulate blocking I/O
 * on top of nonblocking interfaces.
 */
export interface DoppioSocket {
  /**
   * Connect to the given address and port.
   */
  connect(port: number, address: string, timeout: number, cb: (e?: Error) => void): void;
  /**
   * Number of bytes available in the socket's queue.
   */
  available(): number;
  /**
   * Close the socket.
   */
  close(): void;
  /**
   * Shutdown the socket.
   */
  shutdown(): void;
  /**
   * Attempt to read length bytes synchronously from the queue.
   */
  readSync(buffer: number[], offset: number, length: number): number;
  /**
   * Read `length` bytes asynchronously, or until timeout occurs.
   */
  readAsync(buffer: number[], offset: number, length: number, timeout: number, cb: (len: number) => void): void;
  /**
   * Write the given bytes to the socket.
   */
  write(buffer: number[]): void;
  /**
   * Get the "file descriptor" for this socket.
   */
  fd(): number;
}

export interface DoppioSocketConstructor {
  create(): DoppioSocket;
}
let _: DoppioSocketConstructor;

class NodeSocket implements DoppioSocket {
  private _qLen: number = 0;
  private _q: Buffer[] = [];
  private _sock: net.Socket = null;
  private _fd = nextFd++;
  private _canReuse: boolean = true;

  public static create(): NodeSocket {
    return new NodeSocket();
  }

  public fd(): number {
    return this._fd;
  }

  public available(): number {
    return this._qLen;
  }

  public close(): void {
    if (this._sock) {
      this._sock.end();
      this._sock = null;
    }
  }

  public shutdown(): void {
    this.close();
    this._canReuse = false;
  }

  public connect(port: number, address: string, timeout: number, cb: (e?: Error) => void): void {
    const sock = this._sock = new net.Socket();
    const self = this;
    function clear() {
      sock.removeListener('connect', connectCb);
      sock.removeListener('close', closeCb);
      sock.removeListener('error', errorCb);
      sock.removeListener('end', endCb);
    }

    function connectCb() {
      clear();
      cb();
    }

    function endCb() {
      clear();
      cb(new Error(`Connection failed! (Closed on other side)`));
    }

    function closeCb() {
      clear();
      cb(new Error(`Connection failed! (Closed)`));
    }

    function dataCb(data: Buffer) {
      self._q.push(data);
      self._qLen += data.length;
    }

    function errorCb() {
      clear();
      cb(new Error(`Connection failed! (Exception)`));
    }

    sock.connect(port, address, connectCb);
    sock.on('data', dataCb);
    sock.on('close', closeCb);
    sock.on('error', errorCb);
    sock.on('end', endCb);
  }

  public readSync(buffer: number[], offset: number, length: number): number {
    let available = this._qLen,
      trimmedLen = available < length ? available : length,
      remaining = trimmedLen,
      q = this._q;

    while (remaining > 0) {
      const next = q.shift();
      const nextLen = next.length;
      if (remaining < nextLen) {
        // Take part of the buffer.
        for (let i = 0; i < remaining; i++) {
          buffer[offset++] = next.readInt8(i);
        }
        q.unshift(next.slice(remaining));
        remaining = 0;
      } else {
        // Take all of the buffer.
        for (let i = 0; i < nextLen; i++) {
          buffer[offset++] = next.readInt8(i);
        }
        remaining -= nextLen;
      }
    }

    this._qLen -= trimmedLen;
    return trimmedLen;
  }

  public readAsync(buffer: number[], offset: number, length: number, timeout: number, cb: (len: number) => void): void {
    const sock = this._sock;
    const self = this;
    let id = setTimeout(end, timeout);
    function end() {
      sock.removeListener('data', dataCb);
      cb(self.readSync(buffer, offset, length));
    }

    function dataCb() {
      if (self.available() >= length) {
        clearTimeout(id);
        end();
      }
    }

    sock.on('data', dataCb);
  }

  public write(buffer: number[]): void {
    this._sock.write(new Buffer(buffer));
  }

}
_ = NodeSocket;

export class WebsockifySocket implements DoppioSocket {
  private _websock: IWebsock;
  private _canReuse: boolean = true;
  private _fd = nextFd++;
  constructor(websock: IWebsock) {
    this._websock = websock;
  }

  public static create(): WebsockifySocket {
    return new WebsockifySocket(new Websock());
  }

  public fd(): number {
    return this._fd;
  }

  public available(): number {
    return this._websock.rQlen();
  }

  public close(): void {
    this._websock.close();
  }

  public shutdown(): void {
    this._canReuse = false;
  }

  public connect(port: number, address: string, timeout: number, cb: (e?: Error) => void): void {
    if (!this._canReuse) {
      return cb(new Error(`Socket is shutdown and cannot be reused.`));
    }
    const host = `ws://${address}:${port}`;
    debug(`[${host}] Connecting...`);
    const sock = this._websock;
    let id = setTimeout(clearAndCallCb, timeout, 'Connection timeout!');
    function clearAndCallCb(msg: string): void {
      debug(`[${host}] Error: ${msg}`);
      clearState();
      cb(new Error(`${msg}`));
    }

    function clearState() {
      clearTimeout(id);
      sock.on('open', nop);
      sock.on('close', nop);
      sock.on('error', nop);
    }

    sock.on('open', () => {
      debug(`[${host}] Open!`);
      clearState();
      cb();
    });
    // Error cases
    sock.on('close', (e: CloseEvent) => clearAndCallCb(`Connection failed! (Closed): ${websocketStatusToMessage(e.code)}`));
    try {
      sock.open(host);
    } catch (err) {
      setImmediate(() => {
        clearAndCallCb(`Connection failed! (exception): ${err.message}`);
      });
    }
  }

  public readSync(buffer: number[], offset: number, length: number): number {
    const sock = this._websock;
    let available = sock.rQlen(),
      trimmedLen = available < length ? available : length,
      read = sock.rQshiftBytes(trimmedLen);
    for (let i = 0; i < trimmedLen; i++) {
      buffer[offset++] = read[i];
    }
    return trimmedLen;
  }

  public readAsync(buffer: number[], offset: number, length: number, timeout: number, cb: (len: number) => void): void {
    const sock = this._websock;
    const self = this;
    function end() {
      sock.on('message', () => {});
      cb(self.readSync(buffer, offset, length));
    }

    // Wait for timeout or `length` bytes to become available.
    const id = setTimeout(end, timeout);
    sock.on('message', () => {
      if (this.available() >= length) {
        clearTimeout(id);
        end();
      }
    });
  }

  public write(buffer: number[]): void {
    this._websock.send(buffer);
  }
}
_ = WebsockifySocket;
