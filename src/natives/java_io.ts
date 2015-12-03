import fs = require('fs');
import path = require('path');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import ThreadStatus = Doppio.VM.Enums.ThreadStatus;
import Long = Doppio.VM.Long;
import assert = Doppio.Debug.Assert;
import JVMTypes = require('../../includes/JVMTypes');
declare var registerNatives: (defs: any) => void;

function throwNodeError(thread: JVMThread, err: NodeJS.ErrnoException): void {
  let type = "Ljava/io/IOException;";
  if (err.code === "ENOENT") {
    type = 'Ljava/io/FileNotFoundException;';
  }
  thread.throwNewException(type, err.message);
}

/**
 * Provide buffering for the underlying input function, returning at most
 * n_bytes of data.
 */
function async_input(n_bytes: number, resume: (data: Buffer) => void): void {
  // Try to read n_bytes from stdin's buffer.
  var read = function (nBytes: number): NodeBuffer {
    // XXX: Returns a Buffer, but DefinitelyTyped says string|Buffer.
    var bytes = <Buffer> process.stdin.read(nBytes);
    if (bytes === null) {
      // We might have asked for too many bytes. Retrieve the entire stream
      // buffer.
      bytes = <Buffer> process.stdin.read();
    }
    // \0 => EOF.
    if (bytes !== null && bytes.length === 1 && bytes.readUInt8(0) === 0) {
      bytes = new Buffer(0);
    }
    return bytes;
  }, bytes: NodeBuffer = read(n_bytes);

  if (bytes === null) {
    // No input available. Wait for further input.
    process.stdin.once('readable', function (data: NodeBuffer) {
      var bytes = read(n_bytes);
      if (bytes === null) {
        bytes = new Buffer(0);
      }
      resume(bytes);
    });
  } else {
    // Reset stack depth and resume with the given data.
    setImmediate(function () { resume(bytes); });
  }
}

function statFile(fname: string, cb: (stat: fs.Stats) => void): void {
  fs.stat(fname, (err, stat) => {
    if (err != null) {
      cb(null);
    } else {
      cb(stat);
    }
  });
}

class java_io_Console {

  public static 'encoding()Ljava/lang/String;'(thread: JVMThread): JVMTypes.java_lang_String {
    return null;
  }

  public static 'echo(Z)Z'(thread: JVMThread, echoOn: boolean): boolean {
    var echoOff: boolean = !echoOn;
    (<any> process.stdin).setRawMode(echoOff);
    return echoOff;
  }

  public static 'istty()Z'(thread: JVMThread): boolean {
    return (<any> process.stdout).isTTY;
  }

}

class java_io_FileDescriptor {

  public static 'sync()V'(thread: JVMThread, javaThis: JVMTypes.java_io_FileDescriptor): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'initIDs()V'(thread: JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_io_FileInputStream {

  public static 'open0(Ljava/lang/String;)V'(thread: JVMThread, javaThis: JVMTypes.java_io_FileInputStream, filename: JVMTypes.java_lang_String): void {
    var filepath = filename.toString();
    // TODO: actually look at the mode
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.open(filepath, 'r', function (e, fd) {
      if (e != null) {
        if (e.code === 'ENOENT') {
          thread.throwNewException('Ljava/io/FileNotFoundException;', "" + filepath + " (No such file or directory)");
        } else {
          thread.throwNewException('Ljava/lang/InternalError', 'Internal JVM error: ' +  e);
        }
      } else {
        var fdObj = javaThis['java/io/FileInputStream/fd'];
        fdObj['java/io/FileDescriptor/fd'] = fd;
        fdObj.$pos = 0;
        thread.asyncReturn();
      }
    });
  }

  public static 'read0()I'(thread: JVMThread, javaThis: JVMTypes.java_io_FileInputStream): void {
    var fdObj = javaThis["java/io/FileInputStream/fd"],
      fd = fdObj["java/io/FileDescriptor/fd"];
    if (-1 === fd) {
      thread.throwNewException("Ljava/io/IOException;", "Bad file descriptor");
    } else if (0 !== fd) {
      // this is a real file that we've already opened
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      var buf = new Buffer(1);
      fs.read(fd, buf, 0, 1, fdObj.$pos, (err, bytes_read) => {
        if (err) {
          return throwNodeError(thread, err);
        }
        fdObj.$pos++;
        thread.asyncReturn(0 === bytes_read ? -1 : buf.readUInt8(0));
      });
    } else {
      // reading from System.in, do it async
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      async_input(1, (byte: NodeBuffer) => {
        thread.asyncReturn(0 === byte.length ? -1 : byte.readUInt8(0));
      });
    }
  }

  public static 'readBytes([BII)I'(thread: JVMThread, javaThis: JVMTypes.java_io_FileInputStream, byteArr: JVMTypes.JVMArray<number>, offset: number, nBytes: number): number {
    var buf: Buffer, pos: number,
      fdObj = javaThis["java/io/FileInputStream/fd"],
      fd = fdObj["java/io/FileDescriptor/fd"];

    if (offset + nBytes > byteArr.array.length) {
      thread.throwNewException('Ljava/lang/IndexOutOfBoundsException;', "");
      return;
    }

    if (nBytes === 0) {
      return 0;
    } else if (-1 === fd) {
      thread.throwNewException("Ljava/io/IOException;", "Bad file descriptor");
    } else if (0 !== fd) {
      // this is a real file that we've already opened
      pos = fdObj.$pos;
      buf = new Buffer(nBytes);
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.read(fd, buf, 0, nBytes, pos, (err, bytesRead) => {
        if (null != err) {
          throwNodeError(thread, err);
        } else {
          // not clear why, but sometimes node doesn't move the
          // file pointer, so we do it here ourselves.
          fdObj.$pos += bytesRead;
          for (let i = 0; i < bytesRead; i++) {
            byteArr.array[offset + i] = buf.readInt8(i);
          }
          thread.asyncReturn(0 === bytesRead ? -1 : bytesRead);
        }
      });
    } else {
      // reading from System.in, do it async
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      async_input(nBytes, (bytes: NodeBuffer) => {
        var b: number, idx: number;
        for (idx = 0; idx < bytes.length; idx++) {
          b = bytes.readUInt8(idx);
          byteArr.array[offset + idx] = b;
        }
        thread.asyncReturn(bytes.length === 0 ? -1 : bytes.length);
      });
    }
  }

  public static 'skip(J)J'(thread: JVMThread, javaThis: JVMTypes.java_io_FileInputStream, nBytes: Long): void {
    var fdObj = javaThis["java/io/FileInputStream/fd"];
    var fd = fdObj["java/io/FileDescriptor/fd"];
    if (-1 === fd) {
      thread.throwNewException("Ljava/io/IOException;", "Bad file descriptor");
    } else if (0 !== fd) {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.fstat(fd, (err, stats) => {
        if (err) {
          return throwNodeError(thread, err);
        }
        var bytesLeft = stats.size - fdObj.$pos,
          toSkip = Math.min(nBytes.toNumber(), bytesLeft);
        fdObj.$pos += toSkip;
        thread.asyncReturn(Long.fromNumber(toSkip), null);
      });
    } else {
      // reading from System.in, do it async
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      async_input(nBytes.toNumber(), (bytes) => {
        // we don't care about what the input actually was
        thread.asyncReturn(Long.fromNumber(bytes.length), null);
      });
    }
  }

  public static 'available()I'(thread: JVMThread, javaThis: JVMTypes.java_io_FileInputStream): number {
    var fdObj = javaThis["java/io/FileInputStream/fd"],
      fd = fdObj["java/io/FileDescriptor/fd"];

    if (fd === -1) {
      thread.throwNewException("Ljava/io/IOException;", "Bad file descriptor");
    } else if (fd === 0) {
      // no buffering for stdin (if fd is 0)
      return 0;
    } else {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.fstat(fd, (err, stats) => {
        if (err) {
          return throwNodeError(thread, err);
        }
        thread.asyncReturn(stats.size - fdObj.$pos);
      });
    }
  }

  public static 'initIDs()V'(thread: JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'close0()V'(thread: JVMThread, javaThis: JVMTypes.java_io_FileInputStream): void {
    var fdObj = javaThis['java/io/FileInputStream/fd'],
      fd = fdObj['java/io/FileDescriptor/fd'];
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.close(fd, (err?: NodeJS.ErrnoException) => {
      if (err) {
        throwNodeError(thread, err);
      } else {
        fdObj['java/io/FileDescriptor/fd'] = -1;
        thread.asyncReturn();
      }
    });
  }

}

class java_io_FileOutputStream {
  /**
   * Opens a file, with the specified name, for overwriting or appending.
   * @param name name of file to be opened
   * @param append whether the file is to be opened in append mode
   */
  public static 'open0(Ljava/lang/String;Z)V'(thread: JVMThread, javaThis: JVMTypes.java_io_FileOutputStream, name: JVMTypes.java_lang_String, append: number): void {
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.open(name.toString(), append ? 'a' : 'w', (err, fd) => {
      if (err) {
        return throwNodeError(thread, err);
      }
      var fdObj = javaThis['java/io/FileOutputStream/fd'];
      fdObj['java/io/FileDescriptor/fd'] = fd;
      fs.fstat(fd, (err, stats) => {
        fdObj.$pos = stats.size;
        thread.asyncReturn();
      });
    });
  }

  /**
   * Writes the specified byte to this file output stream.
   *
   * @param   b   the byte to be written.
   * @param   append   {@code true} if the write operation first
   *     advances the position to the end of file
   */
  public static 'write(IZ)V'(thread: JVMThread, javaThis: JVMTypes.java_io_FileOutputStream, b: number, append: number): void {
    // HACK: Avoid reimplementing below for single byte case.
    java_io_FileOutputStream['writeBytes([BIIZ)V'](thread, javaThis, <any> {array: [b]}, 0, 1, append);
  }

  /**
   * Writes a sub array as a sequence of bytes.
   * @param b the data to be written
   * @param off the start offset in the data
   * @param len the number of bytes that are written
   * @param append {@code true} to first advance the position to the
   *     end of file
   * @exception IOException If an I/O error has occurred.
   */
  public static 'writeBytes([BIIZ)V'(thread: JVMThread, javaThis: JVMTypes.java_io_FileOutputStream, bytes: JVMTypes.JVMArray<number>, offset: number, len: number, append: number): void {
    var buf: Buffer = new Buffer(bytes.array),
      fdObj = javaThis['java/io/FileOutputStream/fd'],
      fd = fdObj['java/io/FileDescriptor/fd'];
    if (fd === -1) {
      thread.throwNewException('Ljava/io/IOException;', "Bad file descriptor");
    } else if (fd !== 1 && fd !== 2) {
      // normal file
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.write(fd, buf, offset, len, fdObj.$pos, (err, numBytes) => {
        if (err) {
          return throwNodeError(thread, err);
        }
        fdObj.$pos += numBytes;
        thread.asyncReturn();
      });
    } else {
      // The string is in UTF-8 format. But now we need to convert them to UTF-16 to print 'em out. :(
      var output: string = buf.toString("utf8", offset, offset + len);
      if (fd === 1) {
        process.stdout.write(output);
      } else if (fd === 2) {
        process.stderr.write(output);
      }
      // For the browser implementation -- the DOM doesn't get repainted
      // unless we give the event loop a chance to spin.
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      setImmediate(() => {
        thread.asyncReturn();
      });
    }
  }

  public static 'close0()V'(thread: JVMThread, javaThis: JVMTypes.java_io_FileOutputStream): void {
    var fdObj = javaThis['java/io/FileOutputStream/fd'],
      fd = fdObj['java/io/FileDescriptor/fd'];
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.close(fd, (err?: NodeJS.ErrnoException) => {
      if (err) {
        return throwNodeError(thread, err);
      } else {
        fdObj['java/io/FileDescriptor/fd'] = -1;
        thread.asyncReturn();
      }
    });
  }

  public static 'initIDs()V'(thread: JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_io_ObjectInputStream {

  public static 'bytesToFloats([BI[FII)V'(thread: JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: JVMTypes.JVMArray<number>, arg3: number, arg4: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'bytesToDoubles([BI[DII)V'(thread: JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: JVMTypes.JVMArray<number>, arg3: number, arg4: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_io_ObjectOutputStream {

  public static 'floatsToBytes([FI[BII)V'(thread: JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: JVMTypes.JVMArray<number>, arg3: number, arg4: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'doublesToBytes([DI[BII)V'(thread: JVMThread, arg0: JVMTypes.JVMArray<number>, arg1: number, arg2: JVMTypes.JVMArray<number>, arg3: number, arg4: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_io_ObjectStreamClass {

  public static 'initNative()V'(thread: JVMThread): void {
    // NOP
  }

  public static 'hasStaticInitializer(Ljava/lang/Class;)Z'(thread: JVMThread, jco: JVMTypes.java_lang_Class): boolean {
    // check if cls has a <clinit> method
    return jco.$cls.getMethod('<clinit>()V') !== null;
  }

}

class java_io_RandomAccessFile {

  public static 'open0(Ljava/lang/String;I)V'(thread: JVMThread, javaThis: JVMTypes.java_io_RandomAccessFile, filename: JVMTypes.java_lang_String, mode: number): void {
    var filepath = filename.toString(),
      rafStatics = <typeof JVMTypes.java_io_RandomAccessFile> (<ReferenceClassData<JVMTypes.java_io_RandomAccessFile>> javaThis.getClass()).getConstructor(thread),
      modeStr: string;
    switch (mode) {
      case rafStatics["java/io/RandomAccessFile/O_RDONLY"]:
        modeStr = 'r';
        break;
      case rafStatics["java/io/RandomAccessFile/O_RDWR"]:
        modeStr = 'r+';
        break;
      case rafStatics["java/io/RandomAccessFile/O_SYNC"]:
      case rafStatics["java/io/RandomAccessFile/O_DSYNC"]:
        modeStr = 'rs+';
        break;
    }
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.open(filepath, modeStr, (e, fd) => {
      if (e) {
        return throwNodeError(thread, e);
      } else {
        var fdObj = javaThis['java/io/RandomAccessFile/fd'];
        fdObj['java/io/FileDescriptor/fd'] = fd;
        fdObj.$pos = 0;
        thread.asyncReturn();
      }
    });
  }

  /**
   * Reads a byte of data from this file. The byte is returned as an
   * integer in the range 0 to 255 ({@code 0x00-0x0ff}). This
   * method blocks if no input is yet available.
   * <p>
   * Although {@code RandomAccessFile} is not a subclass of
   * {@code InputStream}, this method behaves in exactly the same
   * way as the {@link InputStream#read()} method of
   * {@code InputStream}.
   *
   * @return     the next byte of data, or {@code -1} if the end of the
   *             file has been reached.
   * @exception  IOException  if an I/O error occurs. Not thrown if
   *                          end-of-file has been reached.
   */
  public static 'read0()I'(thread: JVMThread, javaThis: JVMTypes.java_io_RandomAccessFile): void {
    var fdObj = javaThis["java/io/RandomAccessFile/fd"],
      fd = fdObj["java/io/FileDescriptor/fd"],
      buf = new Buffer(1);
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.read(fd, buf, 0, 1, fdObj.$pos, function (err, bytesRead) {
      if (err) {
        return throwNodeError(thread, err);
      } else {
        fdObj.$pos += bytesRead;
        // Read as uint, since return value is unsigned.
        thread.asyncReturn(bytesRead === 0 ? -1 : buf.readUInt8(0));
      }
    });
  }

  public static 'readBytes([BII)I'(thread: JVMThread, javaThis: JVMTypes.java_io_RandomAccessFile, byte_arr: JVMTypes.JVMArray<number>, offset: number, len: number): void {
    var fdObj = javaThis["java/io/RandomAccessFile/fd"],
      fd = fdObj["java/io/FileDescriptor/fd"],
      buf = new Buffer(len);
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.read(fd, buf, 0, len, fdObj.$pos, function (err, bytesRead) {
      if (err) {
        return throwNodeError(thread, err);
      } else {
        for (let i = 0; i < bytesRead; i++) {
          byte_arr.array[offset + i] = buf.readInt8(i);
        }
        fdObj.$pos += bytesRead;
        thread.asyncReturn(0 === bytesRead && 0 !== len ? -1 : bytesRead);
      }
    });
  }

  public static 'write0(I)V'(thread: JVMThread, javaThis: JVMTypes.java_io_RandomAccessFile, value: number): void {
    let fdObj = javaThis["java/io/RandomAccessFile/fd"];
    let fd = fdObj["java/io/FileDescriptor/fd"];
    let data = new Buffer(1);
    data.writeInt8(value, 0);

    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.write(fd, data, 0, 1, fdObj.$pos, (err, numBytes) => {
      if (err) {
        return throwNodeError(thread, err);
      }

      fdObj.$pos += numBytes;
      thread.asyncReturn();
    });
  }

  public static 'writeBytes([BII)V'(thread: JVMThread, javaThis: JVMTypes.java_io_RandomAccessFile, byteArr: JVMTypes.JVMArray<number>, offset: number, len: number): void {
    var fdObj = javaThis["java/io/RandomAccessFile/fd"],
      fd = fdObj["java/io/FileDescriptor/fd"],
      buf = new Buffer(byteArr.array);
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.write(fd, buf, offset, len, fdObj.$pos, (err, numBytes) => {
      if (err) {
        return throwNodeError(thread, err);
      }
      fdObj.$pos += numBytes;
      thread.asyncReturn();
    });
  }

  public static 'getFilePointer()J'(thread: JVMThread, javaThis: JVMTypes.java_io_RandomAccessFile): Long {
    return Long.fromNumber(javaThis['java/io/RandomAccessFile/fd'].$pos);
  }

  public static 'seek0(J)V'(thread: JVMThread, javaThis: JVMTypes.java_io_RandomAccessFile, pos: Long): void {
    javaThis['java/io/RandomAccessFile/fd'].$pos = pos.toNumber();
  }

  public static 'length()J'(thread: JVMThread, javaThis: JVMTypes.java_io_RandomAccessFile): void {
    var fdObj = javaThis['java/io/RandomAccessFile/fd'],
      fd = fdObj['java/io/FileDescriptor/fd'];
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.fstat(fd, (err, stats) => {
      if (err) {
        return throwNodeError(thread, err);
      }
      thread.asyncReturn(Long.fromNumber(stats.size), null);
    });
  }

  public static 'setLength(J)V'(thread: JVMThread, javaThis: JVMTypes.java_io_RandomAccessFile, arg0: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'initIDs()V'(thread: JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'close0()V'(thread: JVMThread, javaThis: JVMTypes.java_io_RandomAccessFile): void {
    var fdObj = javaThis['java/io/RandomAccessFile/fd'],
      fd = fdObj['java/io/FileDescriptor/fd'];
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.close(fd, (err?: NodeJS.ErrnoException) => {
      if (err) {
        return throwNodeError(thread, err);
      } else {
        fdObj['java/io/FileDescriptor/fd'] = -1;
        thread.asyncReturn();
      }
    });
  }

}

class java_io_UnixFileSystem {

  public static 'canonicalize0(Ljava/lang/String;)Ljava/lang/String;'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, jvmPathStr: JVMTypes.java_lang_String): JVMTypes.java_lang_String {
    var jsStr = jvmPathStr.toString();
    return util.initString(thread.getBsCl(), path.resolve(path.normalize(jsStr)));
  }

  public static 'getBooleanAttributes0(Ljava/io/File;)I'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File): void {
    var filepath = file['java/io/File/path'],
      fileSystem = <typeof JVMTypes.java_io_FileSystem> (<ReferenceClassData<JVMTypes.java_io_FileSystem>> thread.getBsCl().getInitializedClass(thread, 'Ljava/io/FileSystem;')).getConstructor(thread);

    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    statFile(filepath.toString(), (stats) => {
      // Returns 0 if file does not exist, or any other error occurs.
      var rv: number = 0;
      if (stats !== null) {
        rv |= fileSystem['java/io/FileSystem/BA_EXISTS'];
        if (stats.isFile()) {
          rv |= fileSystem['java/io/FileSystem/BA_REGULAR'];
        } else if (stats.isDirectory()) {
          rv |= fileSystem['java/io/FileSystem/BA_DIRECTORY'];
        }
      }
      thread.asyncReturn(rv);
    });
  }

  public static 'checkAccess(Ljava/io/File;I)Z'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File, access: number): void {
    var filepath = file['java/io/File/path'];
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    statFile(filepath.toString(), (stats) => {
      if (stats == null) {
        thread.asyncReturn(0);
      } else {
        // XXX: Assuming we're owner/group/other. :)
        // Shift access so it's present in owner/group/other.
        // Then, AND with the actual mode, and check if the result is above 0.
        // That indicates that the access bit we're looking for was set on
        // one of owner/group/other.
        var mask = access | (access << 3) | (access << 6);
        thread.asyncReturn((stats.mode & mask) > 0 ? 1 : 0);
      }
    });
  }

  public static 'getLastModifiedTime(Ljava/io/File;)J'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File): void {
    var filepath = file['java/io/File/path'];
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    statFile(filepath.toString(), function (stats) {
      if (stats == null) {
        thread.asyncReturn(Long.ZERO, null);
      } else {
        thread.asyncReturn(Long.fromNumber(stats.mtime.getTime()), null);
      }
    });
  }

  public static 'getLength(Ljava/io/File;)J'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File): void {
    var filepath = file['java/io/File/path'];
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.stat(filepath.toString(), (err, stat) => {
      thread.asyncReturn(err != null ? Long.ZERO : Long.fromNumber(stat.size), null);
    });
  }

  public static 'setPermission(Ljava/io/File;IZZ)Z'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File, access: number, enable: number, owneronly: number): void {
    // Access is equal to one of the following static fields:
    // * FileSystem.ACCESS_READ (0x04)
    // * FileSystem.ACCESS_WRITE (0x02)
    // * FileSystem.ACCESS_EXECUTE (0x01)
    // These are conveniently identical to their Unix equivalents, which
    // we have to convert to for Node.
    // XXX: Currently assuming that the above assumption holds across JCLs.
    var filepath = file['java/io/File/path'].toString();
    if (owneronly) {
      // Shift it 6 bits over into the 'owner' region of the access mode.
      access <<= 6;
    } else {
      // Clone it into the 'owner' and 'group' regions.
      access |= (access << 6) | (access << 3);
    }
    if (!enable) {
      // Do an invert and we'll AND rather than OR.
      access = ~access;
    }
    // Returns true on success, false on failure.
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    // Fetch existing permissions on file.
    statFile(filepath, (stats: fs.Stats) => {
      if (stats == null) {
        thread.asyncReturn(0);
      } else {
        var existing_access = stats.mode;
        // Apply mask.
        access = enable ? existing_access | access : existing_access & access;
        // Set new permissions.
        fs.chmod(filepath, access, (err?: NodeJS.ErrnoException) => {
          thread.asyncReturn(err != null ? 0 : 1);
        });
      }
    });
  }

  public static 'createFileExclusively(Ljava/lang/String;)Z'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, path: JVMTypes.java_lang_String): void {
    var filepath = path.toString();
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    statFile(filepath, (stat) => {
      if (stat != null) {
        thread.asyncReturn(0);
      } else {
        fs.open(filepath, 'w', (err, fd) => {
          if (err != null) {
            thread.throwNewException('Ljava/io/IOException;', err.message);
          } else {
            fs.close(fd, (err?: NodeJS.ErrnoException) => {
              if (err != null) {
                thread.throwNewException('Ljava/io/IOException;', err.message);
              } else {
                thread.asyncReturn(1);
              }
            });
          }
        });
      }
    });
  }

  public static 'delete0(Ljava/io/File;)Z'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File): void {
    // Delete the file or directory denoted by the given abstract
    // pathname, returning true if and only if the operation succeeds.
    // If file is a directory, it must be empty.
    var filepath = file['java/io/File/path'].toString();
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    statFile(filepath, (stats) => {
      if (stats == null) {
        thread.asyncReturn(0);
      } else if (stats.isDirectory()) {
        fs.readdir(filepath, (err, files) => {
          if (files.length > 0) {
            thread.asyncReturn(0);
          } else {
            fs.rmdir(filepath, (err?: NodeJS.ErrnoException) => {
              thread.asyncReturn(1);
            });
          }
        });
      } else {
        fs.unlink(filepath, (err?: NodeJS.ErrnoException) => {
          thread.asyncReturn(1);
        });
      }
    });
  }

  public static 'list(Ljava/io/File;)[Ljava/lang/String;'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File): void {
    var filepath = file['java/io/File/path'],
      bsCl = thread.getBsCl();
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.readdir(filepath.toString(), (err, files) => {
      if (err != null) {
        thread.asyncReturn(null);
      } else {
        thread.asyncReturn(util.newArrayFromData<JVMTypes.java_lang_String>(thread, thread.getBsCl(), '[Ljava/lang/String;', files.map((file: string) => util.initString(thread.getBsCl(), file))));
      }
    });
  }

  public static 'createDirectory(Ljava/io/File;)Z'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File): void {
    var filepath = file['java/io/File/path'].toString();
    // Already exists.
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    statFile(filepath, (stat) => {
      if (stat != null) {
        thread.asyncReturn(0);
      } else {
        fs.mkdir(filepath, (err?: NodeJS.ErrnoException) => {
          thread.asyncReturn(err != null ? 0 : 1);
        });
      }
    });
  }

  public static 'rename0(Ljava/io/File;Ljava/io/File;)Z'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file1: JVMTypes.java_io_File, file2: JVMTypes.java_io_File): void {
    var file1path = file1['java/io/File/path'].toString(),
      file2path = file2['java/io/File/path'].toString();
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.rename(file1path, file2path, (err?: NodeJS.ErrnoException) => {
      thread.asyncReturn(err != null ? 0 : 1);
    });
  }

  public static 'setLastModifiedTime(Ljava/io/File;J)Z'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File, time: Long): void {
    var mtime = time.toNumber(),
      atime = (new Date).getTime(),
      filepath = file['java/io/File/path'].toString();
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.utimes(filepath, atime, mtime, (err?: NodeJS.ErrnoException) => {
      thread.asyncReturn(1);
    });
  }

  public static 'setReadOnly(Ljava/io/File;)Z'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File): void {
    // We'll be unsetting write permissions.
    // Leading 0o indicates octal.
    var filepath = file['java/io/File/path'].toString(),
      mask = ~0x92;
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    statFile(filepath, (stats) => {
      if (stats == null) {
        thread.asyncReturn(0);
      } else {
        fs.chmod(filepath, stats.mode & mask, (err?: NodeJS.ErrnoException) => {
          thread.asyncReturn(err != null ? 0 : 1);
        });
      }
    });
  }

  public static 'getSpace(Ljava/io/File;I)J'(thread: JVMThread, javaThis: JVMTypes.java_io_UnixFileSystem, file: JVMTypes.java_io_File, arg1: number): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'initIDs()V'(thread: JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

registerNatives({
  'java/io/Console': java_io_Console,
  'java/io/FileDescriptor': java_io_FileDescriptor,
  'java/io/FileInputStream': java_io_FileInputStream,
  'java/io/FileOutputStream': java_io_FileOutputStream,
  'java/io/ObjectInputStream': java_io_ObjectInputStream,
  'java/io/ObjectOutputStream': java_io_ObjectOutputStream,
  'java/io/ObjectStreamClass': java_io_ObjectStreamClass,
  'java/io/RandomAccessFile': java_io_RandomAccessFile,
  'java/io/UnixFileSystem': java_io_UnixFileSystem
});
