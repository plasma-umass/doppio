"use strict";
import gLong = require('./gLong');
import assert = require('./assert');

/**
 * A ByteStream, implemented using a NodeBuffer.
 */
class ByteStream {
  private _index: number = 0;

  constructor(private buffer: NodeBuffer) {}

  /**
   * Returns the current read index, and increments the index by the indicated
   * amount.
   */
  private incIndex(inc: number): number {
    var readIndex = this._index;
    this._index += inc;
    return readIndex;
  }

  public rewind(): void {
    this._index = 0;
  }

  public seek(idx: number) {
    assert(idx >= 0 && idx < this.buffer.length, "Invalid seek position.");
    this._index = idx;
  }

  public pos(): number {
    return this._index;
  }

  public skip(bytesCount: number): void {
    this._index += bytesCount;
  }

  public hasBytes(): boolean {
    return this._index < this.buffer.length;
  }

  public getFloat(): number {
    return this.buffer.readFloatBE(this.incIndex(4));
  }

  public getDouble(): number {
    return this.buffer.readDoubleBE(this.incIndex(8));
  }

  public getUint(byteCount: number): number {
    switch (byteCount) {
      case 1:
        return this.getUint8();
      case 2:
        return this.getUint16();
      case 4:
        return this.getUint32();
      default:
        throw new Error("Invalid byte count for getUint: " + byteCount);
    }
  }

  public getInt(byteCount: number): number {
    switch (byteCount) {
      case 1:
        return this.getInt8();
      case 2:
        return this.getInt16();
      case 4:
        return this.getInt32();
      default:
        throw new Error("Invalid byte count for getUint: " + byteCount);
    }
  }

  public getUint8(): number {
    return this.buffer.readUInt8(this.incIndex(1));
  }

  public getUint16(): number {
    return this.buffer.readUInt16BE(this.incIndex(2));
  }

  public getUint32(): number {
    return this.buffer.readUInt32BE(this.incIndex(4));
  }

  public getInt8(): number {
    return this.buffer.readInt8(this.incIndex(1));
  }

  public getInt16(): number {
    return this.buffer.readInt16BE(this.incIndex(2));
  }

  public getInt32(): number {
    return this.buffer.readInt32BE(this.incIndex(4));
  }

  public getInt64(): gLong {
    var high = this.getUint32();
    var low = this.getUint32();
    return gLong.fromBits(low, high);
  }

  public read(bytesCount: number): Buffer {
    var rv = this.buffer.slice(this._index, this._index + bytesCount);
    this._index += bytesCount;
    return rv;
  }

  public peek(): number {
    return this.buffer.readUInt8(this._index);
  }

  public size(): number {
    return this.buffer.length - this._index;
  }

  public slice(len: number): ByteStream {
    var arr = new ByteStream(this.buffer.slice(this._index, this._index + len));
    this._index += len;
    return arr;
  }

  public getBuffer(): NodeBuffer {
    return this.buffer;
  }
}

export = ByteStream;
