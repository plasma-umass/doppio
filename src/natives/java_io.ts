import runtime = require('../runtime');
import java_object = require('../java_object');
import logging = require('../logging');
import ClassData = require('../ClassData');
import gLong = require('../gLong');
import util = require('../util');
import exceptions = require('../exceptions');
import fs = require('fs');
import path = require('path');

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

  public static 'encoding()Ljava/lang/String;'(rs: runtime.RuntimeState): java_object.JavaObject {
    return null;
  }

  public static 'echo(Z)Z'(rs: runtime.RuntimeState, arg0: number): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'istty()Z'(rs: runtime.RuntimeState): boolean {
    return true;
  }

}

class java_io_FileDescriptor {

  public static 'sync()V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'initIDs()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class java_io_FileInputStream {

  public static 'open(Ljava/lang/String;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, filename: java_object.JavaObject): void {
    var filepath = filename.jvm2js_str();
    // TODO: actually look at the mode
    return rs.async_op(function (resume_cb, except_cb) {
      return fs.open(filepath, 'r', function (e, fd) {
        if (e != null) {
          if (e.code === 'ENOENT') {
            return except_cb(function () {
              return rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/FileNotFoundException;'), "" + filepath + " (No such file or directory)");
            });
          } else {
            return except_cb(function () {
              throw e;
            });
          }
        } else {
          var fd_obj = javaThis.get_field(rs, 'Ljava/io/FileInputStream;fd');
          fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', fd);
          javaThis.$pos = 0;
          return resume_cb();
        }
      });
    });
  }

  public static 'read()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    var fd_obj = javaThis.get_field(rs, "Ljava/io/FileInputStream;fd")
          var fd = fd_obj.get_field(rs, "Ljava/io/FileDescriptor;fd");
    if (-1 === fd) {
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class("Ljava/io/IOException;"), "Bad file descriptor");
    }
    if (0 !== fd) {
      // this is a real file that we've already opened
      rs.async_op(function (cb) {
        return fs.fstat(fd, function (err, stats) {
          var buf;
          return buf = new Buffer(stats.size), fs.read(fd, buf, 0, 1, javaThis.$pos, function (err, bytes_read) {
            return javaThis.$pos++, cb(0 === bytes_read ? -1 : buf.readUInt8(0));
          });
        });
      });
    }
    else {
      // reading from System.in, do it async
      rs.async_op(function (cb) {
        async_input(1, function (byte: NodeBuffer) {
          return cb(0 === byte.length ? -1 : byte.readUInt8(0));
        });
      });
    }
  }

  public static 'readBytes([BII)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, byte_arr: java_object.JavaArray, offset: number, n_bytes: number): void {
    var buf, pos;
    var fd_obj = javaThis.get_field(rs, "Ljava/io/FileInputStream;fd");
    var fd = fd_obj.get_field(rs, "Ljava/io/FileDescriptor;fd");
    if (-1 === fd)
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class("Ljava/io/IOException;"), "Bad file descriptor");
    if (0 !== fd) {
      // this is a real file that we've already opened
      pos = javaThis.$pos;
      buf = new Buffer(n_bytes);
      rs.async_op(function (cb) {
        return fs.read(fd, buf, 0, n_bytes, pos, function (err, bytes_read) {
          var i, _i;
          if (null != err) return cb(-1); // XXX: should check this
          // not clear why, but sometimes node doesn't move the
          // file pointer, so we do it here ourselves.
          for (javaThis.$pos += bytes_read, i = _i = 0; bytes_read > _i; i = _i += 1) byte_arr.array[offset + i] = buf.readInt8(i);
          return cb(0 === bytes_read && 0 !== n_bytes ? -1 : bytes_read);
        });
      });
    }
    else {
      // reading from System.in, do it async
      rs.async_op(function (cb) {
        async_input(n_bytes, function (bytes: NodeBuffer) {
          var b, idx, _i, _len;
          for (idx = _i = 0, _len = bytes.length; _len > _i; idx = ++_i) b = bytes.readUInt8(idx), byte_arr.array[offset + idx] = b;
          return cb(bytes.length === 0 ? -1 : bytes.length);
        });
      });
    }
  }

  public static 'skip(J)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, n_bytes: gLong): void {
    var fd_obj = javaThis.get_field(rs, "Ljava/io/FileInputStream;fd");
    var fd = fd_obj.get_field(rs, "Ljava/io/FileDescriptor;fd");
    if (-1 === fd)
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class("Ljava/io/IOException;"), "Bad file descriptor");
    if (0 !== fd) {
      rs.async_op(function (cb) {
        return fs.fstat(fd, function (err, stats) {
          var bytes_left, to_skip;
          return bytes_left = stats.size - javaThis.$pos, to_skip = Math.min(n_bytes.toNumber(), bytes_left),
            javaThis.$pos += to_skip, cb(gLong.fromNumber(to_skip), null);
        });
      });
    }
    else {
      // reading from System.in, do it async
      rs.async_op(function (cb) {
        async_input(n_bytes.toNumber(), function (bytes) {
          // we don't care about what the input actually was
          return cb(gLong.fromNumber(bytes.length), null);
        });
      });
    }
  }

  public static 'available()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): number {
    var fd_obj = javaThis.get_field(rs, "Ljava/io/FileInputStream;fd"),
      fd = fd_obj.get_field(rs, "Ljava/io/FileDescriptor;fd");

    if (fd === -1) {
      rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class("Ljava/io/IOException;"), "Bad file descriptor");
    } else if (fd === 0) {
      // no buffering for stdin (if fd is 0)
      return 0;
    } else {
      rs.async_op(function (cb) {
        return fs.fstat(fd, function (err, stats) {
          return cb(stats.size - javaThis.$pos);
        });
      });
    }
  }

  public static 'initIDs()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'close0()V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    var fd_obj = javaThis.get_field(rs, 'Ljava/io/FileInputStream;fd'),
      fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
    return rs.async_op(function (resume_cb, except_cb) {
      return fs.close(fd, function (err?: ErrnoException) {
        if (err) {
          return except_cb(function () {
            return rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), err.message);
          });
        } else {
          fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', -1);
          return resume_cb();
        }
      });
    });
  }

}

class java_io_FileOutputStream {

  public static 'open(Ljava/lang/String;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, fname: java_object.JavaObject): void {
    rs.async_op(function (resume_cb) {
      fs.open(fname.jvm2js_str(), 'w', function (err, fd) {
        var fd_obj = javaThis.get_field(rs, 'Ljava/io/FileOutputStream;fd');
        fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', fd);
        javaThis.$pos = 0;
        return resume_cb();
      });
    });
  }

  public static 'openAppend(Ljava/lang/String;)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, fname: java_object.JavaObject): void {
    rs.async_op((resume_cb) => {
      fs.open(fname.jvm2js_str(), 'a', (err, fd) => {
        var fd_obj = javaThis.get_field(rs, 'Ljava/io/FileOutputStream;fd');
        fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', fd);
        fs.fstat(fd, (err, stats) => {
          javaThis.$pos = stats.size;
          return resume_cb();
        });
      });
    });
  }

  public static 'write(I)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'writeBytes([BII)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, bytes: java_object.JavaArray, offset: number, len: number): void {
    var buf: NodeBuffer, fd, fd_obj;
    fd_obj = javaThis.get_field(rs, 'Ljava/io/FileOutputStream;fd');
    fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
    if (fd === -1) {
      rs.java_throw(<ClassData.ReferenceClassData>rs.get_bs_class('Ljava/io/IOException;'), "Bad file descriptor");
    }
    if (fd !== 1 && fd !== 2) {
      // normal file
      buf = new Buffer(bytes.array);
      rs.async_op(function (cb) {
        fs.write(fd, buf, offset, len, javaThis.$pos, function (err, num_bytes) {
          javaThis.$pos += num_bytes;
          return cb();
        });
      });
      return;
    }

    var output: string = util.chars2js_str(bytes, offset, len);
    if (fd === 1) {
      process.stdout.write(output);
    } else if (fd === 2) {
      process.stderr.write(output);
    }
    if (util.are_in_browser()) {
      // For the browser implementation -- the DOM doesn't get repainted
      // unless we give the event loop a chance to spin.
      return rs.async_op(function (cb) {
        return cb();
      });
    }
  }

  public static 'close0()V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    var fd_obj = javaThis.get_field(rs, 'Ljava/io/FileOutputStream;fd'),
      fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
    return rs.async_op(function (resume_cb, except_cb) {
      return fs.close(fd, function (err?: ErrnoException) {
        if (err) {
          return except_cb(function () {
            return rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), err.message);
          });
        } else {
          fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', -1);
          return resume_cb();
        }
      });
    });
  }

  public static 'initIDs()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class java_io_FileSystem {

  public static 'getFileSystem()Ljava/io/FileSystem;'(rs: runtime.RuntimeState): any {
    // TODO: avoid making a new FS object each time this gets called? seems to happen naturally in java/io/File...
    var my_sf = rs.curr_frame(),
      cdata = <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/ExpiringCache;'),
      cache1 = new java_object.JavaObject(rs, cdata),
      cache2 = new java_object.JavaObject(rs, cdata),
      cache_init = cdata.method_lookup(rs, '<init>()V');
    rs.push2(cache1, cache2);
    cache_init.setup_stack(rs);
    my_sf.runner = function () {
      // XXX: don't use get_property if we don't want to make java/lang/String objects
      cache_init.setup_stack(rs);
      return my_sf.runner = function () {
        var system_properties = rs.jvm_state.system_properties;
        var rv = new java_object.JavaObject(rs, <ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/UnixFileSystem;'), {
          'Ljava/io/UnixFileSystem;cache': cache1,
          'Ljava/io/UnixFileSystem;javaHomePrefixCache': cache2,
          'Ljava/io/UnixFileSystem;slash': system_properties['file.separator'].charCodeAt(0),
          'Ljava/io/UnixFileSystem;colon': system_properties['path.separator'].charCodeAt(0),
          'Ljava/io/UnixFileSystem;javaHome': rs.init_string(system_properties['java.home'], true)
        });
        rs.meta_stack().pop();
        return rs.push(rv);
      };
    };
    throw exceptions.ReturnException;
  }

}

class java_io_ObjectInputStream {

  public static 'bytesToFloats([BI[FII)V'(rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number, arg2: java_object.JavaArray, arg3: number, arg4: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'bytesToDoubles([BI[DII)V'(rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number, arg2: java_object.JavaArray, arg3: number, arg4: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'latestUserDefinedLoader()Ljava/lang/ClassLoader;'(rs: runtime.RuntimeState): java_object.JavaClassLoaderObject {
    // Returns the first non-null class loader (not counting class loaders
    //  of generated reflection implementation classes) up the execution stack,
    //  or null if only code from the null class loader is on the stack.
    return null; //  XXX: actually check for class loaders on the stack
  }

}

class java_io_ObjectOutputStream {

  public static 'floatsToBytes([FI[BII)V'(rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number, arg2: java_object.JavaArray, arg3: number, arg4: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'doublesToBytes([DI[BII)V'(rs: runtime.RuntimeState, arg0: java_object.JavaArray, arg1: number, arg2: java_object.JavaArray, arg3: number, arg4: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

class java_io_ObjectStreamClass {

  public static 'initNative()V'(rs: runtime.RuntimeState): void {
    // NOP
  }

  public static 'hasStaticInitializer(Ljava/lang/Class;)Z'(rs: runtime.RuntimeState, jco: java_object.JavaClassObject): boolean {
    // check if cls has a <clinit> method
    return jco.$cls.get_method('<clinit>()V') != null;
  }

}

class java_io_RandomAccessFile {

  public static 'open(Ljava/lang/String;I)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, filename: java_object.JavaObject, mode: number): void {
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
    rs.async_op((resume_cb, except_cb) => {
      fs.open(filepath, mode_str, (e, fd) => {
        if (e != null) {
          // XXX: BrowserFS hack. BFS doesn't support the code attribute
          // on errors yet.
          if (e.code === 'ENOENT' || true) {
            return except_cb(function () {
              return rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/FileNotFoundException;'), "Could not open file " + filepath);
            });
          } else {
            return except_cb(function () {
              throw e;
            });
          }
        } else {
          var fd_obj = javaThis.get_field(rs, 'Ljava/io/RandomAccessFile;fd');
          fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', fd);
          javaThis.$pos = 0;
          return resume_cb();
        }
      });
    });
  }

  public static 'read()I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): number {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return 0;
  }

  public static 'readBytes([BII)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, byte_arr: java_object.JavaArray, offset: number, len: number): void {
    var fd_obj = javaThis.get_field(rs, "Ljava/io/RandomAccessFile;fd"),
      fd = fd_obj.get_field(rs, "Ljava/io/FileDescriptor;fd"),
      buf = new Buffer(len);
    rs.async_op(function (cb) {
      fs.read(fd, buf, 0, len, javaThis.$pos, function (err, bytes_read) {
        var i: number;
        if (null != err) return cb(-1); // XXX: should check this
        for (i = 0; bytes_read > i; i++)
          byte_arr.array[offset + i] = buf.readInt8(i);
        return javaThis.$pos += bytes_read, cb(0 === bytes_read && 0 !== len ? -1 : bytes_read);
      });
    });
  }

  public static 'write(I)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: number): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'writeBytes([BII)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, byte_arr: java_object.JavaArray, offset: number, len: number): void {
    var fd_obj = javaThis.get_field(rs, "Ljava/io/RandomAccessFile;fd"),
      fd = fd_obj.get_field(rs, "Ljava/io/FileDescriptor;fd"),
      buf = new Buffer(byte_arr.array);
    rs.async_op(function (cb) {
      fs.write(fd, buf, offset, len, javaThis.$pos, function (err, num_bytes) {
        javaThis.$pos += num_bytes;
        cb();
      });
    });
  }

  public static 'getFilePointer()J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): gLong {
    return gLong.fromNumber(javaThis.$pos);
  }

  public static 'seek(J)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, pos: gLong): void {
    javaThis.$pos = pos.toNumber();
  }

  public static 'length()J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    var fd_obj = javaThis.get_field(rs, 'Ljava/io/RandomAccessFile;fd'),
      fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
    rs.async_op(function (cb) {
      fs.fstat(fd, function (err, stats) {
        cb(gLong.fromNumber(stats.size), null);
      });
    });
  }

  public static 'setLength(J)V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: gLong): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'initIDs()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

  public static 'close0()V'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject): void {
    var fd_obj = javaThis.get_field(rs, 'Ljava/io/RandomAccessFile;fd'),
      fd = fd_obj.get_field(rs, 'Ljava/io/FileDescriptor;fd');
    return rs.async_op((resume_cb, except_cb) => {
      return fs.close(fd, (err?: ErrnoException) => {
        if (err) {
          return except_cb(() => {
            return rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), err.message);
          });
        } else {
          fd_obj.set_field(rs, 'Ljava/io/FileDescriptor;fd', -1);
          return resume_cb();
        }
      });
    });
  }

}

class java_io_UnixFileSystem {

  public static 'canonicalize0(Ljava/lang/String;)Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, jvm_path_str: java_object.JavaObject): java_object.JavaObject {
    var js_str = jvm_path_str.jvm2js_str();
    return rs.init_string(path.resolve(path.normalize(js_str)));
  }

  public static 'getBooleanAttributes0(Ljava/io/File;)I'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    var filepath = file.get_field(rs, 'Ljava/io/File;path');
    rs.async_op((resume_cb) => {
      stat_file(filepath.jvm2js_str(), (stats) => {
        if (stats == null) {
          return resume_cb(0);
        } else if (stats.isFile()) {
          return resume_cb(3);
        } else if (stats.isDirectory()) {
          return resume_cb(5);
        } else {
          return resume_cb(1);
        }
      });
    });
  }

  public static 'checkAccess(Ljava/io/File;I)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file: java_object.JavaObject, access: number): void {
    var filepath = file.get_field(rs, 'Ljava/io/File;path');
    rs.async_op((resume_cb) => {
      stat_file(filepath.jvm2js_str(), (stats) => {
        if (stats == null) {
          return resume_cb(false);
        } else {
          // XXX: Assuming we're owner/group/other. :)
          // Shift access so it's present in owner/group/other.
          // Then, AND with the actual mode, and check if the result is above 0.
          // That indicates that the access bit we're looking for was set on
          // one of owner/group/other.
          var mask = access | (access << 3) | (access << 6);
          return resume_cb((stats.mode & mask) > 0);
        }
      });
    });
  }

  public static 'getLastModifiedTime(Ljava/io/File;)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    var filepath = file.get_field(rs, 'Ljava/io/File;path').jvm2js_str();
    rs.async_op(function (resume_cb) {
      stat_file(filepath, function (stats) {
        if (stats == null) {
          resume_cb(gLong.ZERO, null);
        } else {
          resume_cb(gLong.fromNumber(stats.mtime.getTime()), null);
        }
      });
    });
  }

  public static 'getLength(Ljava/io/File;)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    var filepath = file.get_field(rs, 'Ljava/io/File;path');
    rs.async_op((resume_cb) => {
      fs.stat(filepath.jvm2js_str(), (err, stat) => {
        resume_cb(gLong.fromNumber(err != null ? 0 : stat.size), null);
      });
    });
  }

  public static 'setPermission(Ljava/io/File;IZZ)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file: java_object.JavaObject, access: number, enable: number, owneronly: number): void {
    // Access is equal to one of the following static fields:
    // * FileSystem.ACCESS_READ (0x04)
    // * FileSystem.ACCESS_WRITE (0x02)
    // * FileSystem.ACCESS_EXECUTE (0x01)
    // These are conveniently identical to their Unix equivalents, which
    // we have to convert to for Node.
    // XXX: Currently assuming that the above assumption holds across JCLs.
    var filepath = (file.get_field(rs, 'Ljava/io/File;path')).jvm2js_str();
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
    rs.async_op((resume_cb) => {
      // Fetch existing permissions on file.
      stat_file(filepath, (stats) => {
        if (stats == null) {
          resume_cb(false);
        } else {
          var existing_access = stats.mode;
          // Apply mask.
          access = enable ? existing_access | access : existing_access & access;
          // Set new permissions.
          fs.chmod(filepath, access, function (err?: ErrnoException) {
            resume_cb(err != null ? false : true);
          });
        }
      });
    });
  }

  public static 'createFileExclusively(Ljava/lang/String;Z)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, path: java_object.JavaObject, arg1: number): void {
    var filepath = path.jvm2js_str();
    rs.async_op((resume_cb, except_cb) => {
      stat_file(filepath, (stat) => {
        if (stat != null) {
          resume_cb(false);
        } else {
          fs.open(filepath, 'w', (err, fd) => {
            if (err != null) {
              except_cb(() => {
                rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), err.message);
              });
            } else {
              fs.close(fd, (err?: ErrnoException) => {
                if (err != null) {
                  except_cb(() => {
                    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/io/IOException;'), err.message);
                  });
                } else {
                  resume_cb(true);
                }
              });
            }
          });
        }
      });
    });
  }

  public static 'delete0(Ljava/io/File;)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    // Delete the file or directory denoted by the given abstract
    // pathname, returning true if and only if the operation succeeds.
    // If file is a directory, it must be empty.
    var filepath = (file.get_field(rs, 'Ljava/io/File;path')).jvm2js_str();
    rs.async_op(function (resume_cb, except_cb) {
      stat_file(filepath, function (stats) {
        if (stats == null) {
          resume_cb(false);
        } else if (stats.isDirectory()) {
          fs.readdir(filepath, function (err, files) {
            if (files.length > 0) {
              resume_cb(false);
            } else {
              fs.rmdir(filepath, function (err?: ErrnoException) {
                resume_cb(true);
              });
            }
          });
        } else {
          fs.unlink(filepath, function (err?: ErrnoException) {
            resume_cb(true);
          });
        }
      });
    });
  }

  public static 'list(Ljava/io/File;)[Ljava/lang/String;'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    var filepath = file.get_field(rs, 'Ljava/io/File;path');
    rs.async_op(function (resume_cb) {
      fs.readdir(filepath.jvm2js_str(), function (err, files) {
        if (err != null) {
          resume_cb(null);
        } else {
          resume_cb(new java_object.JavaArray(rs, <ClassData.ArrayClassData> rs.get_bs_class('[Ljava/lang/String;'), (() => {
            var i: number, len = files.length,
              results: java_object.JavaObject[] = [];
            for (i = 0; i < len; i++) {
              results.push(rs.init_string(files[i]));
            }
            return results;
          })()));
        }
      });
    });
  }

  public static 'createDirectory(Ljava/io/File;)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    var filepath = (file.get_field(rs, 'Ljava/io/File;path')).jvm2js_str();
    // Already exists.
    rs.async_op((resume_cb) => {
      stat_file(filepath, (stat) => {
        if (stat != null) {
          resume_cb(false);
        } else {
          fs.mkdir(filepath, (err?: ErrnoException) => {
            resume_cb(err != null ? false : true);
          });
        }
      });
    });
  }

  public static 'rename0(Ljava/io/File;Ljava/io/File;)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file1: java_object.JavaObject, file2: java_object.JavaObject): void {
    var file1path = (file1.get_field(rs, 'Ljava/io/File;path')).jvm2js_str(),
      file2path = (file2.get_field(rs, 'Ljava/io/File;path')).jvm2js_str();
    rs.async_op((resume_cb) => {
      fs.rename(file1path, file2path, (err?: ErrnoException) => {
        resume_cb(err != null ? false : true);
      });
    });
  }

  public static 'setLastModifiedTime(Ljava/io/File;J)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file: java_object.JavaObject, time: gLong): void {
    var mtime = time.toNumber(),
      atime = (new Date).getTime(),
      filepath = file.get_field(rs, 'Ljava/io/File;path').jvm2js_str();
    rs.async_op((resume_cb) => {
      fs.utimes(filepath, atime, mtime, (err?: ErrnoException) => {
        resume_cb(true);
      });
    });
  }

  public static 'setReadOnly(Ljava/io/File;)Z'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, file: java_object.JavaObject): void {
    // We'll be unsetting write permissions.
    // Leading 0o indicates octal.
    var filepath = (file.get_field(rs, 'Ljava/io/File;path')).jvm2js_str(),
      mask = ~0x92;
    rs.async_op((resume_cb) => {
      stat_file(filepath, (stats) => {
        if (stats == null) {
          resume_cb(false);
        } else {
          fs.chmod(filepath, stats.mode & mask, (err?: ErrnoException) => {
            resume_cb(err != null ? false : true);
          });
        }
      });
    });
  }

  public static 'getSpace(Ljava/io/File;I)J'(rs: runtime.RuntimeState, javaThis: java_object.JavaObject, arg0: java_object.JavaObject, arg1: number): gLong {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'initIDs()V'(rs: runtime.RuntimeState): void {
    rs.java_throw(<ClassData.ReferenceClassData> rs.get_bs_class('Ljava/lang/UnsatisfiedLinkError;'), 'Native method not implemented.');
  }

}

({
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
})
