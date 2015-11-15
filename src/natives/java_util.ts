/// <reference path="../../vendor/pako.d.ts" />
import JVMTypes = require('../../includes/JVMTypes');
import * as DoppioJVM from '../doppiojvm';
import JVMThread = DoppioJVM.VM.Threading.JVMThread;
import ReferenceClassData = DoppioJVM.VM.ClassFile.ReferenceClassData;
import logging = DoppioJVM.Debug.Logging;
import util = DoppioJVM.VM.Util;
import Long = DoppioJVM.VM.Long;
import AbstractClasspathJar = DoppioJVM.VM.ClassFile.AbstractClasspathJar;
import BrowserFS = require('browserfs');
import path = require('path');
import fs = require('fs');
import ThreadStatus = DoppioJVM.VM.Enums.ThreadStatus;
import ArrayClassData = DoppioJVM.VM.ClassFile.ArrayClassData;
import PrimitiveClassData = DoppioJVM.VM.ClassFile.PrimitiveClassData;
import assert = DoppioJVM.Debug.Assert;
import pako = require('pako');
let crc32: {
  (crc: number, buf: number[] | Uint8Array, len: number, pos: number): number;
} = require('pako/lib/zlib/crc32');
let adler32: {
  (adler: number, buf: number[] | Uint8Array, len: number, pos: number): number;
} = require('pako/lib/zlib/adler32');
type Inflater = pako.Inflate<Uint8Array>;
let BFSUtils = BrowserFS.BFSRequire('bfs_utils');

class InflaterState {
  public inflater: Inflater;
  public resultOffset: number = 0;
  public bytesLeft: number = 0;
  constructor(inflater: Inflater) {
    this.inflater = inflater;
  }

  public reset() {
    this.inflater = new pako.Inflate<Uint8Array>({raw: this.inflater.options.raw});
    this.resultOffset = 0;
    this.bytesLeft = 0;
  }

  /**
   * Read bytes from the inflater's existing results.
   * Returns the number of bytes read.
   */
  public readBytes(arr: number[] | Int8Array, off: number, len: number): number {
    let lenRead = len > this.bytesLeft ? this.bytesLeft : len;
    if (lenRead === 0) {
      return 0;
    }
    let result = this.inflater.result;
    let resultOff = this.resultOffset;
    if (isInt8Array(arr)) {
      // Get a slice and modify it as a u8 array.
      let u8arr = new Uint8Array(arr.buffer, arr.byteOffset + off, lenRead);
      u8arr.set(this.inflater.result.subarray(resultOff, resultOff + lenRead), 0);
    } else {
      // Slow path: No typed arrays.
      for (let i = 0; i < lenRead; i++) {
        arr[i + off] = result[resultOff + i];
        if (arr[i + off] > 127) {
          // Sign extend.
          arr[i + off] |= 0xFFFFFF80
        }
      }
    }
    this.bytesLeft -= lenRead;
    this.resultOffset += lenRead;
    return lenRead;
  }

  /**
   * Feed the given bytes into the inflater.
   */
  public writeBytes(arr: number[] | Uint8Array): pako.ZlibReturnCodes {
    assert(this.bytesLeft === 0, `Pushing bytes when there are bytes remaining.`);
    this.inflater.push(arr, pako.ZlibFlushValue.Z_SYNC_FLUSH);
    this.resultOffset = 0;
    if (this.inflater.result) {
      this.bytesLeft = this.inflater.result.length;
    } else {
      // Error condition, typically.
      this.bytesLeft = 0;
    }
    return this.inflater.err;
  }
}

// For type information only.
import {default as TZipFS, CentralDirectory as TCentralDirectory} from 'browserfs/dist/node/backend/ZipFS';
declare var registerNatives: (defs: any) => void;

let ZipFiles: {[id: number]: TZipFS} = {};
let ZipEntries: {[id: number]: TCentralDirectory} = {};
let Inflaters: {[id: number]: InflaterState} = {};
// Start at 1, as 0 is interpreted as an error.
let NextId: number = 1;
function OpenItem<T>(item: T, map: {[id: number]: T}): number {
  let id = NextId++;
  map[id] = item;
  return id;
}
function GetItem<T>(thread: JVMThread, id: number, map: {[id: number]: T}, errMsg: string): T {
  let item = map[id];
  if (!item) {
    thread.throwNewException("Ljava/lang/IllegalStateException;", errMsg);
    return null;
  } else {
    return item;
  }
}
function CloseItem<T>(id: number, map: {[id: number]: T}): void {
  delete map[id];
}

function OpenZipFile(zfile: TZipFS): number {
  return OpenItem(zfile, ZipFiles);
}
function CloseZipFile(id: number): void {
  CloseItem(id, ZipFiles);
}
/**
 * Returns the zip file, if it exists.
 * Otherwise, throws an IllegalStateException.
 */
function GetZipFile(thread: JVMThread, id: number): TZipFS {
  return GetItem(thread, id, ZipFiles, `ZipFile not found.`);
}
function OpenZipEntry(zentry: TCentralDirectory): number {
  return OpenItem(zentry, ZipEntries);
}
function CloseZipEntry(id: number): void {
  CloseItem(id, ZipEntries);
}
/**
 * Returns the zip entry, if it exists.
 * Otherwise, throws an IllegalStateException.
 */
function GetZipEntry(thread: JVMThread, id: number): TCentralDirectory {
  return GetItem(thread, id, ZipEntries, `Invalid ZipEntry.`);
}
function OpenInflater(inflaterState: InflaterState): number {
  return OpenItem(inflaterState, Inflaters);
}
function CloseInflater(id: number): void {
  CloseItem(id, Inflaters);
}
function GetInflater(thread: JVMThread, id: number): InflaterState {
  return GetItem(thread, id, Inflaters, `Inflater not found.`);
}

let CanUseCopyFastPath = false;
if (typeof Int8Array !== "undefined") {
  let i8arr = new Int8Array(1);
  let b = new Buffer(<any> i8arr.buffer);
  i8arr[0] = 100;
  CanUseCopyFastPath = i8arr[0] == b.readInt8(0);
}

interface Arrayish {
  [idx: number]: number;
}

function isUint8Array(arr: Arrayish): arr is Uint8Array {
  if (arr && typeof(Uint8Array) !== "undefined" && arr instanceof Uint8Array) {
    return true;
  }
  return false;
}

function isInt8Array(arr: Arrayish): arr is Int8Array {
  if (arr && typeof(Int8Array) !== "undefined" && arr instanceof Int8Array) {
    return true;
  }
  return false;
}

/**
 * Converts an Int8Array or an array of 8-bit signed ints into
 * a Uint8Array or an array of 8-bit unsigned ints.
 */
function i82u8(arr: number[] | Int8Array, start: number, len: number): number[] | Uint8Array {
  if (isInt8Array(arr)) {
    return new Uint8Array(arr.buffer, arr.byteOffset + start, len);
  } else if (Array.isArray(arr)) {
    if (typeof(Uint8Array) !== "undefined") {
      var i8arr = new Int8Array(len);
      if (start === 0 && len === arr.length) {
        i8arr.set(arr, 0);
      } else {
        i8arr.set(arr.slice(start, start + len), 0);
      }
      return new Uint8Array(i8arr.buffer);
    } else {
      // Slow way.
      let rv = new Array<number>(len);
      for (let i = 0; i < len; i++) {
        rv[i] = arr[start + i] & 0xFF;
      }
      return rv;
    }
  } else {
    throw new TypeError(`Invalid array.`);
  }
}

/**
 * Converts an Uint8Array or an array of 8-bit unsigned ints into
 * an Int8Array or an array of 8-bit signed ints.
 */
function u82i8(arr: number[] | Uint8Array, start: number, len: number): number[] | Int8Array {
  if (isUint8Array(arr)) {
    return new Int8Array(arr.buffer, arr.byteOffset + start, len);
  } else if (Array.isArray(arr)) {
    if (typeof(Int8Array) !== "undefined") {
      var u8arr = new Uint8Array(len);
      if (start === 0 && len === arr.length) {
        u8arr.set(arr, 0);
      } else {
        u8arr.set(arr.slice(start, start + len), 0);
      }
      return new Int8Array(u8arr.buffer);
    } else {
      // Slow way.
      let rv = new Array<number>(len);
      for (let i = 0; i < len; i++) {
        rv[i] = arr[start + i];
        if (rv[i] > 127) {
          // Sign extend.
          rv[i] |= 0xFFFFFF80
        }
      }
      return rv;
    }
  } else {
    throw new TypeError(`Invalid array.`);
  }
}

/**
 * Converts a buffer into either an Int8Array, or an array of signed 8-bit ints.
 */
function buff2i8(buff: NodeBuffer): Int8Array | number[] {
  let arrayish = BFSUtils.buffer2Arrayish(buff);
  return u82i8(<any> arrayish, 0, arrayish.length);
}

/**
 * The type of a JZEntry field. Copied from java.util.zip.ZipFile.
 */
const enum JZEntryType {
  JZENTRY_NAME = 0,
  JZENTRY_EXTRA = 1,
  JZENTRY_COMMENT = 2,
}

class java_util_concurrent_atomic_AtomicLong {

  public static 'VMSupportsCS8()Z'(thread: JVMThread): boolean {
    return true;
  }

}

class java_util_jar_JarFile {

  public static 'getMetaInfEntryNames()[Ljava/lang/String;'(thread: JVMThread, javaThis: JVMTypes.java_util_jar_JarFile): JVMTypes.JVMArray<JVMTypes.java_lang_String> {
    // @todo Hook up to JAR file parser.
    return null;
  }

}

class java_util_logging_FileHandler {

  public static 'isSetUID()Z'(thread: JVMThread): boolean {
    // Our FS does not support setUID.
    return false;
  }

}

class java_util_TimeZone {

  public static 'getSystemTimeZoneID(Ljava/lang/String;)Ljava/lang/String;'(thread: JVMThread, arg0: JVMTypes.java_lang_String): JVMTypes.java_lang_String {
    // XXX not sure what the local value is
    return thread.getJVM().internString('GMT');
  }

  public static 'getSystemGMTOffsetID()Ljava/lang/String;'(thread: JVMThread): JVMTypes.java_lang_String {
    // XXX may not be correct
    return null;
  }

}


class java_util_zip_Adler32 {

  public static 'update(II)I'(thread: JVMThread, adler: number, byte: number): number {
    return adler32(adler, [byte & 0xFF], 1, 0);
  }

  public static 'updateBytes(I[BII)I'(thread: JVMThread, adler: number, b: JVMTypes.JVMArray<number>, off: number, len: number): number {
    return adler32(adler, i82u8(b.array, off, len), len, 0);
  }

  public static 'updateByteBuffer(IJII)I'(thread: JVMThread, adler: number, addr: Long, off: number, len: number): number {
    let heap = thread.getJVM().getHeap();
    let buff = <Uint8Array> BFSUtils.buffer2Arrayish(heap.get_buffer(addr.toNumber() + off, len));
    return adler32(adler, buff, buff.length, 0);
  }

}


class java_util_zip_CRC32 {

  public static 'update(II)I'(thread: JVMThread, crc: number, byte: number): number {
    return crc32(crc, [byte & 0xFF], 1, 0);
  }

  public static 'updateBytes(I[BII)I'(thread: JVMThread, crc: number, b: JVMTypes.JVMArray<number>, off: number, len: number): number {
    return crc32(crc, i82u8(b.array, off, len), len, 0);
  }

  public static 'updateByteBuffer(IJII)I'(thread: JVMThread, crc: number, addr: Long, off: number, len: number): number {
    let heap = thread.getJVM().getHeap();
    let buff = <Uint8Array> BFSUtils.buffer2Arrayish(heap.get_buffer(addr.toNumber() + off, len));
    return crc32(crc, buff, buff.length, 0);
  }

}

class java_util_zip_Deflater {

  public static 'initIDs()V'(thread: JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'init(IIZ)J'(thread: JVMThread, arg0: number, arg1: number, arg2: number): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return null;
  }

  public static 'setDictionary(J[BII)V'(thread: JVMThread, arg0: Long, arg1: JVMTypes.JVMArray<number>, arg2: number, arg3: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'deflateBytes(J[BIII)I'(thread: JVMThread, javaThis: JVMTypes.java_util_zip_Deflater, arg0: Long, arg1: JVMTypes.JVMArray<number>, arg2: number, arg3: number, arg4: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return 0;
  }

  public static 'getAdler(J)I'(thread: JVMThread, arg0: Long): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return 0;
  }

  public static 'reset(J)V'(thread: JVMThread, arg0: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'end(J)V'(thread: JVMThread, arg0: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_util_zip_Inflater {

  public static 'initIDs()V'(thread: JVMThread): void {
    // NOP.
  }

  public static 'init(Z)J'(thread: JVMThread, nowrap: number): Long {
    return Long.fromNumber(OpenInflater(new InflaterState(new pako.Inflate<Uint8Array>({
      raw: nowrap ? true : false
    }))));
  }

  /**
   * Note: This function is explicitly not supported by pako, the library we use
   * for inflation.
   * @see Notes at http://nodeca.github.io/pako/
   */
  public static 'setDictionary(J[BII)V'(thread: JVMThread, arg0: Long, arg1: JVMTypes.JVMArray<number>, arg2: number, arg3: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  /**
   * NOTE: inflateBytes modifies the following properties on the Inflate object:
   *
   * - off
   * - len
   * - needDict
   * - finished
   */
  public static 'inflateBytes(J[BII)I'(thread: JVMThread, javaThis: JVMTypes.java_util_zip_Inflater, addr: Long, b: JVMTypes.JVMArray<number>, off: number, len: number): number {
    let inflater = GetInflater(thread, addr.toNumber());
    if (inflater) {
      // Step 1: Write what we have.
      let arr = b.array;
      let lenRead = inflater.readBytes(arr, off, len);
      // Step 2: If the requester wants more, feed the buffer we have into the
      // inflater.
      if (lenRead !== len) {
        // Give the entire buffer to inflate.
        // TODO: Test performance with large zip files.
        let inputArr = javaThis['java/util/zip/Inflater/buf'].array;
        let inputOff = javaThis['java/util/zip/Inflater/off'];
        let inputLen = javaThis['java/util/zip/Inflater/len'];
        if (inputLen !== 0) {
          let writeBytesRv = inflater.writeBytes(i82u8(inputArr, inputOff, inputLen));
          if (writeBytesRv !== pako.ZlibReturnCodes.Z_OK) {
            switch (writeBytesRv) {
              case pako.ZlibReturnCodes.Z_NEED_DICT:
                javaThis['java/util/zip/Inflater/needDict'] = 1;
                return lenRead;
              default:
                thread.throwNewException('Ljava/util/zip/DataFormatException;', inflater.inflater.msg);
                return;
            }
          }
          if (inflater.inflater.ended) {
            javaThis['java/util/zip/Inflater/finished'] = 1;
          }

          javaThis['java/util/zip/Inflater/len'] = 0;
          javaThis['java/util/zip/Inflater/off'] = inputOff + inputLen;

          // Step 3: Read the newly inflated bytes.
          lenRead += inflater.readBytes(arr, off + lenRead, len - lenRead);
        }
      }
      return lenRead;
    }
  }

  public static 'getAdler(J)I'(thread: JVMThread, addr: Long): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return 0;
  }

  public static 'reset(J)V'(thread: JVMThread, addr: Long): void {
    let addrNum = addr.toNumber();
    let inflaterState = GetInflater(thread, addrNum);
    if (inflaterState) {
      inflaterState.reset();
    }
  }

  public static 'end(J)V'(thread: JVMThread, addr: Long): void {
    CloseInflater(addr.toNumber());
  }

}

class java_util_zip_ZipFile {

  public static 'initIDs()V'(thread: JVMThread): void {
    // NOP.
  }

  /**
   * Note: Returns 0 when entry does not exist.
   */
  public static 'getEntry(J[BZ)J'(thread: JVMThread, jzfile: Long, nameBytes: JVMTypes.JVMArray<number>, addSlash: number): Long {
    // ASSUMPTION: Name is UTF-8.
    // Should actually compare the raw bytes.
    let zipfs = GetZipFile(thread, jzfile.toNumber());
    if (zipfs) {
      let name = new Buffer(nameBytes.array).toString('utf8');
      if (name[0] !== '/') {
        name = `/${name}`;
      }
      name = path.resolve(name);
      try {
        return Long.fromNumber(OpenZipEntry(zipfs.getCentralDirectoryEntry(name)));
      } catch (e) {
        return Long.ZERO;
      }
    }
  }

  public static 'freeEntry(JJ)V'(thread: JVMThread, jzfile: Long, jzentry: Long): void {
    CloseZipEntry(jzentry.toNumber());
  }

  public static 'getNextEntry(JI)J'(thread: JVMThread, jzfile: Long, index: number): Long {
    let zipfs = GetZipFile(thread, jzfile.toNumber());
    if (zipfs) {
      try {
        return Long.fromNumber(OpenZipEntry(zipfs.getCentralDirectoryEntryAt(index)));
      } catch (e) {
        return Long.ZERO;
      }
    }
  }

  public static 'close(J)V'(thread: JVMThread, jzfile: Long): void {
    CloseZipFile(jzfile.toNumber());
  }

  public static 'open(Ljava/lang/String;IJZ)J'(thread: JVMThread, nameObj: JVMTypes.java_lang_String, mode: number, modified: Long, usemmap: number): Long {
    // Ignore mmap option.
    let name = nameObj.toString();
    // Optimization: Check if this is a JAR file on the classpath.
    let cpath = thread.getBsCl().getClassPathItems();
    for (let i = 0; i < cpath.length; i++) {
      let cpathItem = cpath[i];
      if (cpathItem instanceof AbstractClasspathJar) {
        if (path.resolve(cpathItem.getPath()) === path.resolve(name)) {
          return Long.fromNumber(OpenZipFile((<AbstractClasspathJar> <any> cpathItem).getFS()));
        }
      }
    }

    // Async path.
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.readFile(name, (err, data) => {
      if (err) {
        thread.throwNewException("Ljava/io/IOException;", err.message);
      } else {
        thread.asyncReturn(Long.fromNumber(OpenZipFile(new BrowserFS.FileSystem.ZipFS(data, name))), null);
      }
    });
  }

  public static 'getTotal(J)I'(thread: JVMThread, jzfile: Long): number {
    let zipfs = GetZipFile(thread, jzfile.toNumber());
    if (zipfs) {
      return zipfs.getNumberOfCentralDirectoryEntries();
    }
  }

  public static 'startsWithLOC(J)Z'(thread: JVMThread, arg0: Long): number {
    // We do not support any zip files that do not begin with the proper signature.
    // Boolean, so 1 === true.
    return 1;
  }

  public static 'read(JJJ[BII)I'(thread: JVMThread, jzfile: Long, jzentry: Long, pos: Long, b: JVMTypes.JVMArray<number>, off: number, len: number): number {
    let zipentry = GetZipEntry(thread, jzentry.toNumber());
    let posNum = pos.toNumber();
    if (zipentry) {
      if (len <= 0) {
        return 0;
      }
      let data = zipentry.getRawData();
      // Sanity check: Will likely never happen, as Java code ensures that this method is
      // called in a sane manner.
      if (posNum >= data.length) {
        thread.throwNewException("Ljava/io/IOException;", "End of zip file.");
        return;
      }
      if (posNum + len > data.length) {
        len = data.length - posNum;
      }
      let arr = b.array;
      if (CanUseCopyFastPath) {
        let i8arr: Int8Array = <any> arr;
        // XXX: DefinitelyTyped typings are out of date.
        let b = new Buffer(<any> i8arr.buffer);
        return data.copy(b, off + i8arr.byteOffset, posNum, posNum + len);
      } else {
        for (let i = 0; i < len; i++) {
          arr[off + i] = data.readInt8(posNum + i);
        }
        return len;
      }
    }
  }

  public static 'getEntryTime(J)J'(thread: JVMThread, jzentry: Long): Long {
    let zipentry = GetZipEntry(thread, jzentry.toNumber());
    if (zipentry) {
      return Long.fromNumber(zipentry.rawLastModFileTime());
    }
  }

  public static 'getEntryCrc(J)J'(thread: JVMThread, jzentry: Long): Long {
    let zipentry = GetZipEntry(thread, jzentry.toNumber());
    if (zipentry) {
      return Long.fromNumber(zipentry.crc32());
    }
  }

  public static 'getEntryCSize(J)J'(thread: JVMThread, jzentry: Long): Long {
    let zipentry = GetZipEntry(thread, jzentry.toNumber());
    if (zipentry) {
      return Long.fromNumber(zipentry.compressedSize());
    }
  }

  public static 'getEntrySize(J)J'(thread: JVMThread, jzentry: Long): Long {
    let zipentry = GetZipEntry(thread, jzentry.toNumber());
    if (zipentry) {
      return Long.fromNumber(zipentry.uncompressedSize());
    }
  }

  public static 'getEntryMethod(J)I'(thread: JVMThread, jzentry: Long): number {
    let zipentry = GetZipEntry(thread, jzentry.toNumber());
    if (zipentry) {
      return zipentry.compressionMethod();
    }
  }

  public static 'getEntryFlag(J)I'(thread: JVMThread, jzentry: Long): number {
    let zipentry = GetZipEntry(thread, jzentry.toNumber());
    if (zipentry) {
      return zipentry.flag();
    }
  }

  public static 'getCommentBytes(J)[B'(thread: JVMThread, jzfile: Long): JVMTypes.JVMArray<number> {
    let zipfile = GetZipFile(thread, jzfile.toNumber());
    if (zipfile) {
      let eocd = zipfile.getEndOfCentralDirectory();
      let comment = eocd.rawCdZipComment();
      // Should be zero-copy in most situations.
      return util.newArrayFromDataWithClass(thread, <ArrayClassData<number>> thread.getBsCl().getInitializedClass(thread, '[B'), <number[]> buff2i8(comment));
    }
  }

  public static 'getEntryBytes(JI)[B'(thread: JVMThread, jzentry: Long, type: JZEntryType): JVMTypes.JVMArray<number> {
    let zipentry = GetZipEntry(thread, jzentry.toNumber());
    if (zipentry) {
      switch(type) {
        case JZEntryType.JZENTRY_COMMENT:
          return util.newArrayFromDataWithClass(thread, <ArrayClassData<number>> thread.getBsCl().getInitializedClass(thread, '[B'), <number[]> buff2i8(zipentry.rawFileComment()));
        case JZEntryType.JZENTRY_EXTRA:
          return util.newArrayFromDataWithClass(thread, <ArrayClassData<number>> thread.getBsCl().getInitializedClass(thread, '[B'), <number[]> buff2i8(zipentry.extraField()));
        case JZEntryType.JZENTRY_NAME:
          return util.newArrayFromDataWithClass(thread, <ArrayClassData<number>> thread.getBsCl().getInitializedClass(thread, '[B'), <number[]> buff2i8(zipentry.rawFileName()));
        default:
          return null;
      }
    }
  }

  /**
   * Called to get an exception message. Should never really need to be called.
   */
  public static 'getZipMessage(J)Ljava/lang/String;'(thread: JVMThread, jzfile: Long): JVMTypes.java_lang_String {
    return util.initString(thread.getBsCl(), "Something bad happened.");
  }

}

registerNatives({
  'java/util/concurrent/atomic/AtomicLong': java_util_concurrent_atomic_AtomicLong,
  'java/util/jar/JarFile': java_util_jar_JarFile,
  'java/util/logging/FileHandler': java_util_logging_FileHandler,
  'java/util/TimeZone': java_util_TimeZone,
  'java/util/zip/Adler32': java_util_zip_Adler32,
  'java/util/zip/CRC32': java_util_zip_CRC32,
  'java/util/zip/Deflater': java_util_zip_Deflater,
  'java/util/zip/Inflater': java_util_zip_Inflater,
  'java/util/zip/ZipFile': java_util_zip_ZipFile
});
