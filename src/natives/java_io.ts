import threading = require('../threading');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import ClassLoader = require('../ClassLoader');
import gLong = require('../gLong');
import util = require('../util');
import enums = require('../enums');
import methods = require('../methods');
import fs = require('fs');
import path = require('path');
declare var registerNatives: (defs: any) => void;

/**
 * Provide buffering for the underlying input function, returning at most
 * n_bytes of data.
 */
function async_input(n_bytes: number, resume: (NodeBuffer) => void): void {
  // Try to read n_bytes from stdin's buffer.
  var read = function (n_bytes: number): NodeBuffer {
    var bytes = process.stdin.read(n_bytes);
    if (bytes === null) {
      // We might have asked for too many bytes. Retrieve the entire stream
      // buffer.
      bytes = process.stdin.read();
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

function stat_file(fname: string, cb: (stat: fs.Stats) => void): void {
  fs.stat(fname, (err, stat) => {
    if (err != null) {
      cb(null);
    } else {
      cb(stat);
    }
  });
}

class java_io_Console {

  public static 'encoding()Ljava/lang/String;'(thread: threading.JVMThread): java_object.JavaObject {
    return null;
  }

  public static 'echo(Z)Z'(thread: threading.JVMThread, arg0: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'istty()Z'(thread: threading.JVMThread): boolean {
    return true;
  }

}

class java_io_FileDescriptor {

  public static 'sync()V'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'initIDs()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_io_FileInputStream {

  public static 'open(Ljava/lang/String;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, filename: java_object.JavaObject): void {
    var filepath = filename.jvm2js_str();
    // TODO: actually look at the mode
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.open(filepath, 'r', function (e, fd) {
      if (e != null) {
        if (e.code === 'ENOENT') {
          thread.throwNewException('Ljava/io/FileNotFoundException;', "" + filepath + " (No such file or directory)");
        } else {
          thread.throwNewException('Ljava/lang/Error', 'Internal JVM error: ' +  e);
        }
      } else {
        var fd_obj = javaThis.get_field(thread, 'Ljava/io/FileInputStream;fd');
        fd_obj.set_field(thread, 'Ljava/io/FileDescriptor;fd', fd);
        javaThis.$pos = 0;
        thread.asyncReturn();
      }
    });
  }

  public static 'read()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    var fd_obj = javaThis.get_field(thread, "Ljava/io/FileInputStream;fd")
          var fd = fd_obj.get_field(thread, "Ljava/io/FileDescriptor;fd");
    if (-1 === fd) {
      thread.throwNewException("Ljava/io/IOException;", "Bad file descriptor");
    } else if (0 !== fd) {
      // this is a real file that we've already opened
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      fs.fstat(fd, (err, stats) => {
        var buf = new Buffer(stats.size);
        fs.read(fd, buf, 0, 1, javaThis.$pos, (err, bytes_read) => {
          javaThis.$pos++;
          thread.asyncReturn(0 === bytes_read ? -1 : buf.readUInt8(0));
        });
      });
    } else {
      // reading from System.in, do it async
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      async_input(1, (byte: NodeBuffer) => {
        thread.asyncReturn(0 === byte.length ? -1 : byte.readUInt8(0));
      });
    }
  }

  public static 'readBytes([BII)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, byte_arr: java_object.JavaArray, offset: number, n_bytes: number): void {
    var buf, pos;
    var fd_obj = javaThis.get_field(thread, "Ljava/io/FileInputStream;fd");
    var fd = fd_obj.get_field(thread, "Ljava/io/FileDescriptor;fd");
    if (-1 === fd) {
      thread.throwNewException("Ljava/io/IOException;", "Bad file descriptor");
    } else if (0 !== fd) {
      // this is a real file that we've already opened
      pos = javaThis.$pos;
      buf = new Buffer(n_bytes);
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      fs.read(fd, buf, 0, n_bytes, pos, (err, bytes_read) => {
        var i: number;
        if (null != err) {
          thread.asyncReturn(-1); // XXX: should check this
        } else {
          // not clear why, but sometimes node doesn't move the
          // file pointer, so we do it here ourselves.
          javaThis.$pos += bytes_read;
          for (i = 0; i < bytes_read; i++) {
            byte_arr.array[offset + i] = buf.readInt8(i);
          }
          thread.asyncReturn(0 === bytes_read && 0 !== n_bytes ? -1 : bytes_read);
        }
      });
    } else {
      // reading from System.in, do it async
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      async_input(n_bytes, (bytes: NodeBuffer) => {
        var b, idx: number;
        for (idx = 0; idx < bytes.length; idx++) {
          b = bytes.readUInt8(idx);
          byte_arr.array[offset + idx] = b;
        }
        thread.asyncReturn(bytes.length === 0 ? -1 : bytes.length);
      });
    }
  }

  public static 'skip(J)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, n_bytes: gLong): void {
    var fd_obj = javaThis.get_field(thread, "Ljava/io/FileInputStream;fd");
    var fd = fd_obj.get_field(thread, "Ljava/io/FileDescriptor;fd");
    if (-1 === fd) {
      thread.throwNewException("Ljava/io/IOException;", "Bad file descriptor");
    } else if (0 !== fd) {
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      fs.fstat(fd, (err, stats) => {
        var bytes_left = stats.size - javaThis.$pos,
          to_skip = Math.min(n_bytes.toNumber(), bytes_left);
        javaThis.$pos += to_skip;
        thread.asyncReturn(gLong.fromNumber(to_skip), null);
      });
    } else {
      // reading from System.in, do it async
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      async_input(n_bytes.toNumber(), (bytes) => {
        // we don't care about what the input actually was
        thread.asyncReturn(gLong.fromNumber(bytes.length), null);
      });
    }
  }

  public static 'available()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    var fd_obj = javaThis.get_field(thread, "Ljava/io/FileInputStream;fd"),
      fd = fd_obj.get_field(thread, "Ljava/io/FileDescriptor;fd");

    if (fd === -1) {
      thread.throwNewException("Ljava/io/IOException;", "Bad file descriptor");
    } else if (fd === 0) {
      // no buffering for stdin (if fd is 0)
      return 0;
    } else {
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      fs.fstat(fd, (err, stats) => {
        thread.asyncReturn(stats.size - javaThis.$pos);
      });
    }
  }

  public static 'initIDs()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'close0()V'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    var fd_obj = javaThis.get_field(thread, 'Ljava/io/FileInputStream;fd'),
      fd = fd_obj.get_field(thread, 'Ljava/io/FileDescriptor;fd');
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.close(fd, (err?: NodeJS.ErrnoException) => {
      if (err) {
        thread.throwNewException('Ljava/io/IOException;', err.message);
      } else {
        fd_obj.set_field(thread, 'Ljava/io/FileDescriptor;fd', -1);
        thread.asyncReturn();
      }
    });
  }

}

class java_io_FileOutputStream {

  public static 'open(Ljava/lang/String;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, fname: java_object.JavaObject): void {
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.open(fname.jvm2js_str(), 'w', (err, fd) => {
      var fd_obj = javaThis.get_field(thread, 'Ljava/io/FileOutputStream;fd');
      fd_obj.set_field(thread, 'Ljava/io/FileDescriptor;fd', fd);
      javaThis.$pos = 0;
      thread.asyncReturn();
    });
  }

  public static 'openAppend(Ljava/lang/String;)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, fname: java_object.JavaObject): void {
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.open(fname.jvm2js_str(), 'a', (err, fd) => {
      var fd_obj = javaThis.get_field(thread, 'Ljava/io/FileOutputStream;fd');
      fd_obj.set_field(thread, 'Ljava/io/FileDescriptor;fd', fd);
      fs.fstat(fd, (err, stats) => {
        javaThis.$pos = stats.size;
        thread.asyncReturn();
      });
    });
  }

  public static 'write(I)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'writeBytes([BII)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number): void {
    var buf: NodeBuffer, fd, fd_obj;
    fd_obj = javaThis.get_field(thread, 'Ljava/io/FileOutputStream;fd');
    fd = fd_obj.get_field(thread, 'Ljava/io/FileDescriptor;fd');
    if (fd === -1) {
      thread.throwNewException('Ljava/io/IOException;', "Bad file descriptor");
    } else if (fd !== 1 && fd !== 2) {
      // normal file
      buf = new Buffer(bytes.array);
      thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
      fs.write(fd, buf, offset, len, javaThis.$pos, (err, num_bytes) => {
        javaThis.$pos += num_bytes;
        thread.asyncReturn();
      });
    } else {
      // stdout or stderr
      var output: string = util.chars2js_str(bytes, offset, len);
      if (fd === 1) {
        process.stdout.write(output);
      } else if (fd === 2) {
        process.stderr.write(output);
      }
      if (util.are_in_browser()) {
        // For the browser implementation -- the DOM doesn't get repainted
        // unless we give the event loop a chance to spin.
        thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
        setImmediate(() => thread.asyncReturn());
      }
    }
  }

  public static 'close0()V'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    var fd_obj = javaThis.get_field(thread, 'Ljava/io/FileOutputStream;fd'),
      fd = fd_obj.get_field(thread, 'Ljava/io/FileDescriptor;fd');
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.close(fd, (err?: NodeJS.ErrnoException) => {
      if (err) {
        thread.throwNewException('Ljava/io/IOException;', err.message);
      } else {
        fd_obj.set_field(thread, 'Ljava/io/FileDescriptor;fd', -1);
        thread.asyncReturn();
      }
    });
  }

  public static 'initIDs()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_io_FileSystem {

  public static 'getFileSystem()Ljava/io/FileSystem;'(thread: threading.JVMThread): void {
    // First run! Construct the file system.
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);

    var bsCl = thread.getBsCl();
    // Create the UnixFileSystem object.
    bsCl.initializeClass(thread, 'Ljava/io/UnixFileSystem;', (ufsClass: ClassData.ReferenceClassData) => {
      var ufsObj = new java_object.JavaObject(ufsClass),
        ufsInit = ufsClass.method_lookup(thread, '<init>()V');
      thread.runMethod(ufsInit, [ufsObj], (e?, rv?) => {
        if (e) {
          thread.throwException(e);
        } else {
          // Rewrite the native method.
          thread.getThreadPool().getJVM().registerNative('java/io/FileSystem', 'getFileSystem()Ljava/io/FileSystem;', (thread: threading.JVMThread): java_object.JavaObject => {
            return ufsObj;
          });
          thread.asyncReturn(ufsObj);
        }
      });
    });
  }

}

class java_io_ObjectInputStream {

  public static 'bytesToFloats([BI[FII)V'(thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number, arg2: java_object.JavaArray, arg3: number, arg4: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'bytesToDoubles([BI[DII)V'(thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number, arg2: java_object.JavaArray, arg3: number, arg4: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  /**
   * Returns the first non-null class loader (not counting class loaders
   * of generated reflection implementation classes) up the execution stack,
   * or null if only code from the null class loader is on the stack.
   */
  public static 'latestUserDefinedLoader()Ljava/lang/ClassLoader;'(thread: threading.JVMThread): ClassLoader.JavaClassLoaderObject {
    var stackTrace = thread.getStackTrace(), i: number, method: methods.Method,
      bsCl = thread.getBsCl(), loader: ClassLoader.ClassLoader;
    for (i = 0; i < stackTrace.length; i++) {
      loader = stackTrace[i].method.cls.loader;
      if (loader !== bsCl) {
        return (<ClassLoader.CustomClassLoader> loader).getLoaderObject();
      }
    }
    return null;
  }

}

class java_io_ObjectOutputStream {

  public static 'floatsToBytes([FI[BII)V'(thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number, arg2: java_object.JavaArray, arg3: number, arg4: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'doublesToBytes([DI[BII)V'(thread: threading.JVMThread, arg0: java_object.JavaArray, arg1: number, arg2: java_object.JavaArray, arg3: number, arg4: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

class java_io_ObjectStreamClass {

  public static 'initNative()V'(thread: threading.JVMThread): void {
    // NOP
  }

  public static 'hasStaticInitializer(Ljava/lang/Class;)Z'(thread: threading.JVMThread, jco: java_object.JavaClassObject): boolean {
    // check if cls has a <clinit> method
    return jco.$cls.get_method('<clinit>()V') != null;
  }

}

class java_io_RandomAccessFile {

  public static 'open(Ljava/lang/String;I)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, filename: java_object.JavaObject, mode: number): void {
    var filepath = filename.jvm2js_str(),
      mode_str: string;
    switch (mode) {
      case 1:
        mode_str = 'r';
        break;
      case 2:
        mode_str = 'r+';
        break;
      case 4:
      case 8:
        mode_str = 'rs+';
        break;
    }
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.open(filepath, mode_str, (e, fd) => {
      if (e != null) {
        thread.throwNewException('Ljava/io/FileNotFoundException;', "Could not open file " + filepath + ": " + e);
      } else {
        var fd_obj = javaThis.get_field(thread, 'Ljava/io/RandomAccessFile;fd');
        fd_obj.set_field(thread, 'Ljava/io/FileDescriptor;fd', fd);
        javaThis.$pos = 0;
        thread.asyncReturn();
      }
    });
  }

  public static 'read()I'(thread: threading.JVMThread, javaThis: java_object.JavaObject): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'readBytes([BII)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, byte_arr: java_object.JavaArray, offset: number, len: number): void {
    var fd_obj = javaThis.get_field(thread, "Ljava/io/RandomAccessFile;fd"),
      fd = fd_obj.get_field(thread, "Ljava/io/FileDescriptor;fd"),
      buf = new Buffer(len);
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.read(fd, buf, 0, len, javaThis.$pos, function (err, bytes_read) {
      var i: number;
      if (err != null) {
        thread.throwNewException('Ljava/io/IOException;', 'Erorr reading file: ' + err);
      } else {
        for (i = 0; i < bytes_read; i++) {
          byte_arr.array[offset + i] = buf.readInt8(i);
        }
        javaThis.$pos += bytes_read;
        thread.asyncReturn(0 === bytes_read && 0 !== len ? -1 : bytes_read);
      }
    });
  }

  public static 'write(I)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'writeBytes([BII)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, byte_arr: java_object.JavaArray, offset: number, len: number): void {
    var fd_obj = javaThis.get_field(thread, "Ljava/io/RandomAccessFile;fd"),
      fd = fd_obj.get_field(thread, "Ljava/io/FileDescriptor;fd"),
      buf = new Buffer(byte_arr.array);
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.write(fd, buf, offset, len, javaThis.$pos, (err, num_bytes) => {
      javaThis.$pos += num_bytes;
      thread.asyncReturn();
    });
  }

  public static 'getFilePointer()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): gLong {
    return gLong.fromNumber(javaThis.$pos);
  }

  public static 'seek(J)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, pos: gLong): void {
    javaThis.$pos = pos.toNumber();
  }

  public static 'length()J'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    var fd_obj = javaThis.get_field(thread, 'Ljava/io/RandomAccessFile;fd'),
      fd = fd_obj.get_field(thread, 'Ljava/io/FileDescriptor;fd');
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.fstat(fd, (err, stats) => {
      thread.asyncReturn(gLong.fromNumber(stats.size), null);
    });
  }

  public static 'setLength(J)V'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: gLong): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'initIDs()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'close0()V'(thread: threading.JVMThread, javaThis: java_object.JavaObject): void {
    var fd_obj = javaThis.get_field(thread, 'Ljava/io/RandomAccessFile;fd'),
      fd = fd_obj.get_field(thread, 'Ljava/io/FileDescriptor;fd');
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.close(fd, (err?: NodeJS.ErrnoException) => {
      if (err) {
        thread.throwNewException('Ljava/io/IOException;', err.message);
      } else {
        fd_obj.set_field(thread, 'Ljava/io/FileDescriptor;fd', -1);
        thread.asyncReturn();
      }
    });
  }

}

class java_io_UnixFileSystem {

  public static 'canonicalize0(Ljava/lang/String;)Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, jvm_path_str: java_object.JavaObject): java_object.JavaObject {
    var js_str = jvm_path_str.jvm2js_str();
    return java_object.initString(thread.getBsCl(), path.resolve(path.normalize(js_str)));
  }

  public static 'getBooleanAttributes0(Ljava/io/File;)I'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    var filepath = file.get_field(thread, 'Ljava/io/File;path');
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    stat_file(filepath.jvm2js_str(), (stats) => {
      if (stats == null) {
        thread.asyncReturn(0);
      } else if (stats.isFile()) {
        thread.asyncReturn(3);
      } else if (stats.isDirectory()) {
        thread.asyncReturn(5);
      } else {
        thread.asyncReturn(1);
      }
    });
  }

  public static 'checkAccess(Ljava/io/File;I)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file: java_object.JavaObject, access: number): void {
    var filepath = file.get_field(thread, 'Ljava/io/File;path');
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    stat_file(filepath.jvm2js_str(), (stats) => {
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

  public static 'getLastModifiedTime(Ljava/io/File;)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    var filepath = file.get_field(thread, 'Ljava/io/File;path').jvm2js_str();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    stat_file(filepath, function (stats) {
      if (stats == null) {
        thread.asyncReturn(gLong.ZERO, null);
      } else {
        thread.asyncReturn(gLong.fromNumber(stats.mtime.getTime()), null);
      }
    });
  }

  public static 'getLength(Ljava/io/File;)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    var filepath = file.get_field(thread, 'Ljava/io/File;path');
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.stat(filepath.jvm2js_str(), (err, stat) => {
      thread.asyncReturn(gLong.fromNumber(err != null ? 0 : stat.size), null);
    });
  }

  public static 'setPermission(Ljava/io/File;IZZ)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file: java_object.JavaObject, access: number, enable: number, owneronly: number): void {
    // Access is equal to one of the following static fields:
    // * FileSystem.ACCESS_READ (0x04)
    // * FileSystem.ACCESS_WRITE (0x02)
    // * FileSystem.ACCESS_EXECUTE (0x01)
    // These are conveniently identical to their Unix equivalents, which
    // we have to convert to for Node.
    // XXX: Currently assuming that the above assumption holds across JCLs.
    var filepath = (file.get_field(thread, 'Ljava/io/File;path')).jvm2js_str();
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
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    // Fetch existing permissions on file.
    stat_file(filepath, (stats) => {
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

  public static 'createFileExclusively(Ljava/lang/String;Z)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, path: java_object.JavaObject, arg1: number): void {
    var filepath = path.jvm2js_str();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    stat_file(filepath, (stat) => {
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

  public static 'delete0(Ljava/io/File;)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    // Delete the file or directory denoted by the given abstract
    // pathname, returning true if and only if the operation succeeds.
    // If file is a directory, it must be empty.
    var filepath = (file.get_field(thread, 'Ljava/io/File;path')).jvm2js_str();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    stat_file(filepath, (stats) => {
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

  public static 'list(Ljava/io/File;)[Ljava/lang/String;'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    var filepath = file.get_field(thread, 'Ljava/io/File;path'),
      bsCl = thread.getBsCl();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.readdir(filepath.jvm2js_str(), (err, files) => {
      if (err != null) {
        thread.asyncReturn(null);
      } else {
        thread.asyncReturn(new java_object.JavaArray(<ClassData.ArrayClassData> bsCl.getInitializedClass(thread, '[Ljava/lang/String;'), (() => {
          var i: number, len = files.length,
            results: java_object.JavaObject[] = [];
          for (i = 0; i < len; i++) {
            results.push(java_object.initString(bsCl, files[i]));
          }
          return results;
        })()));
      }
    });
  }

  public static 'createDirectory(Ljava/io/File;)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    var filepath = (file.get_field(thread, 'Ljava/io/File;path')).jvm2js_str();
    // Already exists.
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    stat_file(filepath, (stat) => {
      if (stat != null) {
        thread.asyncReturn(0);
      } else {
        fs.mkdir(filepath, (err?: NodeJS.ErrnoException) => {
          thread.asyncReturn(err != null ? 0 : 1);
        });
      }
    });
  }

  public static 'rename0(Ljava/io/File;Ljava/io/File;)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file1: java_object.JavaObject, file2: java_object.JavaObject): void {
    var file1path = (file1.get_field(thread, 'Ljava/io/File;path')).jvm2js_str(),
      file2path = (file2.get_field(thread, 'Ljava/io/File;path')).jvm2js_str();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.rename(file1path, file2path, (err?: NodeJS.ErrnoException) => {
      thread.asyncReturn(err != null ? 0 : 1);
    });
  }

  public static 'setLastModifiedTime(Ljava/io/File;J)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file: java_object.JavaObject, time: gLong): void {
    var mtime = time.toNumber(),
      atime = (new Date).getTime(),
      filepath = file.get_field(thread, 'Ljava/io/File;path').jvm2js_str();
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    fs.utimes(filepath, atime, mtime, (err?: NodeJS.ErrnoException) => {
      thread.asyncReturn(1);
    });
  }

  public static 'setReadOnly(Ljava/io/File;)Z'(thread: threading.JVMThread, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    // We'll be unsetting write permissions.
    // Leading 0o indicates octal.
    var filepath = (file.get_field(thread, 'Ljava/io/File;path')).jvm2js_str(),
      mask = ~0x92;
    thread.setStatus(enums.ThreadStatus.ASYNC_WAITING);
    stat_file(filepath, (stats) => {
      if (stats == null) {
        thread.asyncReturn(0);
      } else {
        fs.chmod(filepath, stats.mode & mask, (err?: NodeJS.ErrnoException) => {
          thread.asyncReturn(err != null ? 0 : 1);
        });
      }
    });
  }

  public static 'getSpace(Ljava/io/File;I)J'(thread: threading.JVMThread, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): gLong {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'initIDs()V'(thread: threading.JVMThread): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

}

registerNatives({
  'java/io/Console': java_io_Console,
  'java/io/FileDescriptor': java_io_FileDescriptor,
  'java/io/FileInputStream': java_io_FileInputStream,
  'java/io/FileOutputStream': java_io_FileOutputStream,
  'java/io/FileSystem': java_io_FileSystem,
  'java/io/ObjectInputStream': java_io_ObjectInputStream,
  'java/io/ObjectOutputStream': java_io_ObjectOutputStream,
  'java/io/ObjectStreamClass': java_io_ObjectStreamClass,
  'java/io/RandomAccessFile': java_io_RandomAccessFile,
  'java/io/UnixFileSystem': java_io_UnixFileSystem
});
