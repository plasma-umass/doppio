///<reference path='../vendor/DefinitelyTyped/node/node.d.ts' />

// A power-of-two segregated freelist "heap",
// for explicit memory management into a buffer.
// by Emery Berger, www.cs.umass.edu/~emery

"use strict";

interface HashTable<T> {
  [key : number]: T;
}

class Heap {

  // size = total amount of memory for the heap.
  constructor(private size: number) {
    this._buffer    = new Buffer(size);
    this._remaining = size;  // the whole thing is available.
    this._offset    = 0;     // start of the buffer.
    // Initialize the freelists.
    this._freeLists = new Array<number>(Heap._numSizeClasses);
    for (var i = 0; i < Heap._numSizeClasses; i++) {
      this._freeLists[i] = [];
    }
  }

  // Allocate size bytes, returning the "address".
  malloc(size: number): number {
    // if size is less than a word, round it up to a word (4 bytes).
    if (size <= 4) {
      size = 4;
    }
    // if we are out of memory, throw an exception.
    if (this._remaining < size) {
      // TODO: could actually scan larger freelists to see if there's
      // free memory there.
      throw "out of memory";
    }
    // compute the size class.
    var addr : number;
    var cl   : number;
    cl   = Heap.size_to_class(size);
    addr = this._freeLists[cl].pop();
    // if there's no more memory, get some.
    if (addr === undefined) {
      addr = this.refill(cl);
    }
    return addr;
  }

  // Deallocate memory.
  free(addr: number): void {
    // push this address onto the appropriate freelist.
    // first, mask the address.
    var masked = addr & ~(Heap._chunkSize - 1);
    // next, look up the class using the masked address.
    var cl = this._sizeMap[masked];
    // finally, push onto the appropriate free list.
    // TODO: for sanity, we could check to see if this was *really* freed
    // and drop it if not.
    this._freeLists[cl].push(addr);
  }

  // Store a word (32-bits) at this address.
  store_word(addr: number, value: number): void {
    // TODO: add sanity checks?
    this._buffer.writeUInt32LE (value, addr);
  }

  // Access a byte at this location.
  get_byte(addr: number): number {
    // TODO: add sanity checks?
    return this._buffer.readUInt8 (addr);
  }

  get_signed_byte(addr: number): number {
    return this._buffer.readInt8(addr);
  }

  set_byte(addr: number, value: number): void {
    this._buffer.writeUInt8(value, addr);
  }

  set_signed_byte(addr: number, value: number): void {
    this._buffer.writeInt8(value, addr);
  }

  /**
   * Copy len bytes from srcAddr to dstAddr.
   */
  memcpy(srcAddr: number, dstAddr: number, len: number) {
    var len8 = len % 4, i: number, len32 = len - len8;
    // Optimization: 32 bits at a time, when possible, from [0, len32)
    for (i = 0; i < len32; i += 4) {
      this._buffer.writeUInt32LE(this._buffer.readUInt32LE(srcAddr + i), dstAddr + i);
    }
    // Copy the remaining bytes, from [len32, len).
    for (i = len32; i < len; i++) {
      this._buffer.writeUInt8(this._buffer.readUInt8(srcAddr + i), dstAddr + i);
    }
  }

  // Get more memory for a particular size class.
  private refill(cl: number): number {
    // Get the largest size for this class.
    var sz = this.cl_to_size(cl);
    // Figure out how many objects we are going to "allocate".
    var count : number = Math.floor(Heap._chunkSize / sz);
    if (count < 1) {
      count = 1;
    }
    // Now store the size class *for the first object* only.
    // We will later look up this object via "pointer arithmetic".
    var addr = this._offset;
    this._sizeMap[addr] = cl;
    // Add each one to the freelist.
    for (var i = 0; i < count; i++) {
      this._remaining -= sz;
      addr = this._offset;
      this._freeLists[cl].push (addr);
      this._offset += sz;
    }
    return addr;
  }

  // Computes ceil(log2(num)).
  private static ilog2(num: number): number {
    var log2  = 0;
    var value = 1;
    while (value < num) {
      value <<= (1);
      log2++;
    }
    return (log2);
  }

  // power-of-two size classes (just a ref to ilog2).
  private static size_to_class(size: number): number {
    return Heap.ilog2(size);
  }

  // see above: classes are just powers of two.
  private cl_to_size(cl: number): number {
    return (1 << cl);
  }

  // Holds all memory, which we will allocate from via pointer bumping.
  private _buffer : NodeBuffer;

  // How much is left in the buffer, in bytes.
  private _remaining : number;

  // The current offset in the buffer.
  private _offset : number;

  // The total number of size classes.
  private static _numSizeClasses : number = 64; // way more than we'll ever need.

  // How much to grab at one time.
  private static _chunkSize : number = 4096;    // should be a power of two.

  // The size class array of stuff.
  private _freeLists;

  // A map of size classes per chunk (see above).
  private _sizeMap : HashTable<number> = {};

}

export = Heap;
