import * as JVMTypes from '../../includes/JVMTypes';
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import Long = Doppio.VM.Long;
import ThreadStatus = Doppio.VM.Enums.ThreadStatus;
import * as fs from 'fs';
import * as BrowserFS from 'browserfs';
import FDState = Doppio.VM.FDState;
let BFSUtils = BrowserFS.BFSRequire('bfs_utils');

export default function (): any {
  class sun_nio_ch_FileChannelImpl {

    public static 'map0(IJJ)J'(thread: JVMThread, javaThis: JVMTypes.sun_nio_ch_FileChannelImpl, arg0: number, arg1: Long, arg2: Long): Long {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      // Satisfy TypeScript return type.
      return null;
    }

    public static 'unmap0(JJ)I'(thread: JVMThread, arg0: Long, arg1: Long): number {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      // Satisfy TypeScript return type.
      return 0;
    }

    public static 'position0(Ljava/io/FileDescriptor;J)J'(thread: JVMThread, javaThis: JVMTypes.sun_nio_ch_FileChannelImpl, fdObj: JVMTypes.java_io_FileDescriptor, offset: Long): Long {
      const fd = fdObj['java/io/FileDescriptor/fd'];
      let rv: number;
      if (offset.equals(Long.NEG_ONE)) {
        // Get current FD offset.
        rv = FDState.getPos(fd);
      } else {
        // Set FD offset.
        rv = offset.toNumber();
        FDState.setPos(fd, rv);
      }
      return Long.fromNumber(rv);
    }

    /**
     * this poorly-named method actually specifies the page size for mmap
     * This is the Mac name for sun/misc/Unsafe::pageSize. Apparently they
     * wanted to ensure page sizes can be > 2GB...
     */
    public static 'initIDs()J'(thread: JVMThread): Long {
      // Size of heap pages.
      return Long.fromNumber(4096);
    }

  }

  class sun_nio_ch_NativeThread {

    public static 'current()J'(thread: JVMThread): Long {
      // -1 means that we do not require signaling according to the
      // docs.
      return Long.fromNumber(-1);
    }

    public static 'signal(J)V'(thread: JVMThread, arg0: Long): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'init()V'(thread: JVMThread): void {
      // NOP
    }

  }

  class sun_nio_ch_Net {

    public static 'pollinValue()S'(thread: JVMThread): number {
      return 0;
    }

    public static 'polloutValue()S'(thread: JVMThread): number {
      return 0;
    }

    public static 'pollerrValue()S'(thread: JVMThread): number {
      return 0;
    }

    public static 'pollhupValue()S'(thread: JVMThread): number {
      return 0;
    }

    public static 'pollnvalValue()S'(thread: JVMThread): number {
      return 0;
    }

    public static 'pollconnValue()S'(thread: JVMThread): number {
      return 0;
    }

    public static 'isExclusiveBindAvailable()I'(thread: JVMThread): number {
      return -1;
    }

    public static 'isIPv6Available0()Z'(thread: JVMThread): boolean {
      return true;
    }

    public static 'socket0(ZZZZ)I'(thread: JVMThread): number {
      return 0;
    }

  }

  class sun_nio_ch_IOUtil {
    private static fdVal: number = 0;

    public static 'iovMax()I'(thread: JVMThread): number {
      // Maximum number of IOVectors supported. Let's punt and say zero.
      return 0;
    }

    public static 'setfdVal(Ljava/io/FileDescriptor;I)V'(thread: JVMThread, fdVal: number): void {
      sun_nio_ch_IOUtil.fdVal = fdVal;
    }

    public static 'fdVal(Ljava/io/FileDescriptor;)I'(thread: JVMThread): number {
      return sun_nio_ch_IOUtil.fdVal;
    }
  }

  class sun_nio_ch_FileDispatcherImpl {

    public static 'init()V'(thread: JVMThread): void {

    }

    public static 'read0(Ljava/io/FileDescriptor;JI)I'(thread: JVMThread, fdObj: JVMTypes.java_io_FileDescriptor, address: Long, len: number): void {
      const fd = fdObj["java/io/FileDescriptor/fd"],
        // read upto len bytes and store into mmap'd buffer at address
        addr = address.toNumber(),
        buf = thread.getJVM().getHeap().get_buffer(addr, len);
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.read(fd, buf, 0, len, FDState.getPos(fd), (err, bytesRead) => {
        if (err) {
          thread.throwNewException("Ljava/io/IOException;", 'Error reading file: ' + err);
        } else {
          FDState.incrementPos(fd, bytesRead);
          // Return -1 if we reached the end of the file.
          thread.asyncReturn(bytesRead === 0 ? -1 : bytesRead);
        }
      });
    }

    public static 'preClose0(Ljava/io/FileDescriptor;)V'(thread: JVMThread, arg0: JVMTypes.java_io_FileDescriptor): void {
      // NOP, I think the actual fs.close is called later. If not, NBD.
    }

    public static 'close0(Ljava/io/FileDescriptor;)V'(thread: JVMThread, fdObj: JVMTypes.java_io_FileDescriptor): void {
      const fd = fdObj["java/io/FileDescriptor/fd"];
      sun_nio_ch_FileDispatcherImpl['closeIntFD(I)V'](thread, fd);
      FDState.close(fd);
      fdObj["java/io/FileDescriptor/fd"] = -1;
    }

    public static 'size0(Ljava/io/FileDescriptor;)J'(thread: JVMThread, fdObj: JVMTypes.java_io_FileDescriptor): void {
      let fd = fdObj["java/io/FileDescriptor/fd"];
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.fstat(fd, (err, stats) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          thread.asyncReturn(Long.fromNumber(stats.size), null);
        }
      });
    }

    public static 'truncate0(Ljava/io/FileDescriptor;J)I'(thread: JVMThread, fdObj: JVMTypes.java_io_FileDescriptor, size: Long): void {
      let fd = fdObj["java/io/FileDescriptor/fd"];
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.ftruncate(fd, size.toNumber(), (err) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          // For some reason, this expects a return value.
          // Give it the success status code.
          thread.asyncReturn(0);
        }
      });
    }

    public static 'closeIntFD(I)V'(thread: JVMThread, fd: number): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.close(fd, (err) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          FDState.close(fd);
          thread.asyncReturn();
        }
      });
    }

    public static 'write0(Ljava/io/FileDescriptor;JI)I'(thread: JVMThread, fdObj: JVMTypes.java_io_FileDescriptor, addr: Long, len: number): void {
      const fd = fdObj["java/io/FileDescriptor/fd"];
      const heap = thread.getJVM().getHeap();
      const data = heap.get_buffer(addr.toNumber(), len);
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.write(fd, data, 0, len, FDState.getPos(fd), (err, numBytes) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          FDState.incrementPos(fd, numBytes);
          thread.asyncReturn(numBytes);
        }
      });
    }

  }

  class DirFd {
    private _listing: string[];
    private _pos: number = 0;
    constructor(listing: string[]) {
      this._listing = listing;
    }

    public next(): string {
      var next = this._listing[this._pos++];
      if (next === undefined) {
        next = null;
      }
      return next;
    }
  }

  class FDMap<T> {
    private static _nextFd = 1;
    private _map: {[fd: number]: T} = {};

    public newEntry(entry: T): number {
      var fd = FDMap._nextFd++;
      this._map[fd] = entry;
      return fd;
    }

    public removeEntry(thread: JVMThread, fd: number, exceptionType: string): void {
      if (this._map[fd]) {
        delete this._map[fd];
      } else {
        thread.throwNewException(exceptionType, `Invalid file descriptor: ${fd}`);
      }
    }

    public getEntry(thread: JVMThread, exceptionType: string, fd: number): T {
      var entry = this._map[fd];
      if (!entry) {
        thread.throwNewException(exceptionType, `Invalid file descriptor: ${fd}`);
        return null;
      } else {
        return entry;
      }
    }
  }

  const dirMap = new FDMap<DirFd>();

  function getStringFromHeap(thread: JVMThread, ptrLong: Long): string {
    var heap = thread.getJVM().getHeap(),
        ptr = ptrLong.toNumber(),
        len = 0;
    while (heap.get_signed_byte(ptr + len) !== 0) {
      len++;
    }
    return heap.get_buffer(ptr, len).toString();
  }

  /**
   * Converts a string into a C string stored in a JVM array.
   * No NULL terminator needed, since arrays have length.
   */
  function stringToByteArray(thread: JVMThread, str: string): JVMTypes.JVMArray<number> {
    if (!str) {
      return null;
    }
    // NULL terminate the string.
    const buff = new Buffer(str, 'utf8');
    const len = buff.length;
    const i8 = new Int8Array(len);
    for (let i = 0; i < len; i++) {
      i8[i] = buff.readInt8(i);
    }
    return util.newArrayFromData<number>(thread, thread.getBsCl(), '[B', <number[]><any> i8);
  }

  function convertError(thread: JVMThread, err: NodeJS.ErrnoException, cb: (err: JVMTypes.java_lang_Exception) => void): void {
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    if (err.code === 'ENOENT') {
      thread.getBsCl().initializeClass(thread, 'Ljava/nio/file/NoSuchFileException;', (noSuchFileException) => {
        const cons = (<ReferenceClassData<JVMTypes.java_nio_file_NoSuchFileException>> noSuchFileException).getConstructor(thread),
        rv = new cons(thread);
        rv['<init>(Ljava/lang/String;)V'](thread, [util.initString(thread.getBsCl(), err.path)], (e) => {
          thread.throwException(rv);
        });
      });
    } else if (err.code === 'EEXIST') {
      thread.getBsCl().initializeClass(thread, 'Ljava/nio/file/FileAlreadyExistsException;', (fileAlreadyExistsException) => {
        const cons = (<ReferenceClassData<JVMTypes.java_nio_file_FileAlreadyExistsException>> fileAlreadyExistsException).getConstructor(thread),
        rv = new cons(thread);
        rv['<init>(Ljava/lang/String;)V'](thread, [util.initString(thread.getBsCl(), err.path)], (e) => {
          cb(rv);
        });
      });
    } else {
      thread.getBsCl().initializeClass(thread, 'Lsun/nio/fs/UnixException;', (unixException) => {
        thread.getBsCl().initializeClass(thread, 'Lsun/nio/fs/UnixConstants;', (unixConstants) => {
            var cons = (<ReferenceClassData<JVMTypes.sun_nio_fs_UnixException>> unixException).getConstructor(thread),
              rv = new cons(thread),
              unixCons: typeof JVMTypes.sun_nio_fs_UnixConstants = <any> (<ReferenceClassData<JVMTypes.sun_nio_fs_UnixConstants>> unixConstants).getConstructor(thread),
              errCode: number = (<any> unixCons)[`sun/nio/fs/UnixConstants/${err.code}`];
            if (typeof(errCode) !== 'number') {
              errCode = -1;
            }
            rv['sun/nio/fs/UnixException/errno'] = errCode;
            rv['sun/nio/fs/UnixException/msg'] = util.initString(thread.getBsCl(), err.message);
            cb(rv);
        });
      });
    }
  }

  function convertStats(stats: fs.Stats, jvmStats: JVMTypes.sun_nio_fs_UnixFileAttributes): void {
    jvmStats['sun/nio/fs/UnixFileAttributes/st_mode'] = stats.mode;
    jvmStats['sun/nio/fs/UnixFileAttributes/st_ino'] = Long.fromNumber(stats.ino);
    jvmStats['sun/nio/fs/UnixFileAttributes/st_dev'] = Long.fromNumber(stats.dev);
    jvmStats['sun/nio/fs/UnixFileAttributes/st_rdev'] = Long.fromNumber(stats.rdev);
    jvmStats['sun/nio/fs/UnixFileAttributes/st_nlink'] = stats.nlink;
    jvmStats['sun/nio/fs/UnixFileAttributes/st_uid'] = stats.uid;
    jvmStats['sun/nio/fs/UnixFileAttributes/st_gid'] = stats.gid;
    jvmStats['sun/nio/fs/UnixFileAttributes/st_size'] = Long.fromNumber(stats.size);
    let atime = date2components(stats.atime),
      mtime = date2components(stats.mtime),
      ctime = date2components(stats.ctime);
    jvmStats['sun/nio/fs/UnixFileAttributes/st_atime_sec'] = Long.fromNumber(atime[0]);
    jvmStats['sun/nio/fs/UnixFileAttributes/st_atime_nsec'] = Long.fromNumber(atime[1]);
    jvmStats['sun/nio/fs/UnixFileAttributes/st_mtime_sec'] = Long.fromNumber(mtime[0]);
    jvmStats['sun/nio/fs/UnixFileAttributes/st_mtime_nsec'] = Long.fromNumber(mtime[1]);
    jvmStats['sun/nio/fs/UnixFileAttributes/st_ctime_sec'] = Long.fromNumber(ctime[0]);
    jvmStats['sun/nio/fs/UnixFileAttributes/st_ctime_nsec'] = Long.fromNumber(ctime[1]);
    jvmStats['sun/nio/fs/UnixFileAttributes/st_birthtime_sec'] = Long.fromNumber(Math.floor(stats.birthtime.getTime() / 1000));
  }

  let UnixConstants: typeof JVMTypes.sun_nio_fs_UnixConstants = null;
  function flagTest(flag: number, mask: number, value: number = mask): boolean {
    return (flag & mask) === value;
  }

  /**
   * Converts a numerical Unix open() flag to a NodeJS string open() flag.
   * Returns NULL upon failure; throws a UnixException on thread when that happens.
   */
  function flag2nodeflag(thread: JVMThread, flag: number): string {
    if (UnixConstants === null) {
      let UCCls = <ReferenceClassData<JVMTypes.sun_nio_fs_UnixConstants>> thread.getBsCl().getInitializedClass(thread, 'Lsun/nio/fs/UnixConstants;');
      if (UCCls === null) {
        thread.throwNewException("Ljava/lang/InternalError;", "UnixConstants is not initialized?");
        return null;
      }
      UnixConstants = <any> UCCls.getConstructor(thread);
    }

    const sync = flagTest(flag, UnixConstants['sun/nio/fs/UnixConstants/O_SYNC']) || flagTest(flag, UnixConstants['sun/nio/fs/UnixConstants/O_DSYNC']);
    const failIfExists = flagTest(flag, UnixConstants['sun/nio/fs/UnixConstants/O_EXCL'] | UnixConstants['sun/nio/fs/UnixConstants/O_CREAT']);
    const O_ACCMODE = 0x3;

    if (flagTest(flag, O_ACCMODE, UnixConstants['sun/nio/fs/UnixConstants/O_RDWR'])) {
      if (flagTest(flag, UnixConstants['sun/nio/fs/UnixConstants/O_APPEND'])) {
        // 'a+' - Open file for reading and appending. The file is created if it does not exist.
        // 'ax+' - Like 'a+' but fails if path exists.
        return failIfExists ? 'ax+' : 'a+';
      } else if (flagTest(flag, UnixConstants['sun/nio/fs/UnixConstants/O_CREAT'])) {
        // 'w+' - Open file for reading and writing. The file is created (if it does not exist) or truncated (if it exists).
        // 'wx+' - Like 'w+' but fails if path exists.
        return failIfExists ? 'wx+' : 'w+';
      } else {
        // 'r+' - Open file for reading and writing. An exception occurs if the file does not exist.
        // 'rs+' - Open file for reading and writing, telling the OS to open it synchronously.
        return sync ? 'rs+' : 'r+';
      }
    } else if (flagTest(flag, O_ACCMODE, UnixConstants['sun/nio/fs/UnixConstants/O_RDONLY'])) {
      // 'r' - Open file for reading. An exception occurs if the file does not exist.
      // 'rs' - Open file for reading in synchronous mode. Instructs the operating system to bypass the local file system cache.
      return sync ? 'rs' : 'r';
    } else if (flagTest(flag, O_ACCMODE, UnixConstants['sun/nio/fs/UnixConstants/O_WRONLY'])) {
      if (flagTest(flag, UnixConstants['sun/nio/fs/UnixConstants/O_APPEND'])) {
        // 'ax' - Like 'a' but fails if path exists.
        // 'a' - Open file for appending. The file is created if it does not exist.
        return failIfExists ? 'ax' : 'a';
      } else {
        // 'w' - Open file for writing. The file is created (if it does not exist) or truncated (if it exists).
        // 'wx' - Like 'w' but fails if path exists.
        return failIfExists ? 'wx' : 'w';
      }
    } else {
      thread.throwNewException('Lsun/nio/fs/UnixException;', `Invalid open flag: ${flag}.`);
      return null;
    }
  }

  function throwNodeError(thread: JVMThread, err: NodeJS.ErrnoException): void {
    convertError(thread, err, (convertedErr) => {
      thread.throwException(convertedErr);
    });
  }

  /**
   * Converts a Date object into [seconds, nanoseconds].
   */
  function date2components(date: Date): [number, number] {
    let dateInMs = date.getTime();
    return [Math.floor(dateInMs / 1000), (dateInMs % 1000) * 1000000];
  }

  class sun_nio_fs_UnixNativeDispatcher {

    public static 'getcwd()[B'(thread: JVMThread): JVMTypes.JVMArray<number> {
      return stringToByteArray(thread, process.cwd());
    }

    public static 'dup(I)I'(thread: JVMThread, arg0: number): number {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      return 0;
    }

    public static 'open0(JII)I'(thread: JVMThread, pathAddress: Long, flags: number, mode: number): number | void {
      // Essentially, convert open() args to fopen() args.
      let flagStr = flag2nodeflag(thread, flags);
      if (flagStr !== null) {
        thread.setStatus(ThreadStatus.ASYNC_WAITING);
        let pathStr = getStringFromHeap(thread, pathAddress);
        fs.open(pathStr, flagStr, mode, (err, fd) => {
          if (err) {
            throwNodeError(thread, err);
          } else {
            if (flagStr.indexOf('a') !== -1) {
              // Need to figure out size of file to set position.
              fs.fstat(fd, (err, stats) => {
                if (err) {
                  throwNodeError(thread, err);
                } else {
                  FDState.open(fd, stats.size);
                  thread.asyncReturn(fd);
                }
              });
            } else {
              FDState.open(fd, 0);
              thread.asyncReturn(fd);
            }
          }
        });
      } else {
        return -1;
      }
    }

    public static 'openat0(IJII)I'(thread: JVMThread, arg0: number, arg1: Long, arg2: number, arg3: number): number {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      return 0;
    }

    public static 'close(I)V'(thread: JVMThread, fd: number): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.close(fd, (err?) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          FDState.close(fd);
          thread.asyncReturn();
        }
      });
    }

    public static 'fopen0(JJ)J'(thread: JVMThread, pathAddress: Long, flagsAddress: Long): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      let pathStr = getStringFromHeap(thread, pathAddress);
      let flagsStr = getStringFromHeap(thread, flagsAddress);
      fs.open(pathStr, flagsStr, (err, fd) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          if (flagsStr.indexOf('a') !== -1) {
            // Need to figure out file size to update file position.
            fs.fstat(fd, (err, stats) => {
              if (err) {
                throwNodeError(thread, err);
              } else {
                FDState.open(fd, stats.size);
                thread.asyncReturn(Long.fromNumber(fd), null);
              }
            });
          } else {
            FDState.open(fd, 0);
            thread.asyncReturn(Long.fromNumber(fd), null);
          }
        }
      });
    }

    public static 'fclose(J)V'(thread: JVMThread, fdLong: Long): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      const fd = fdLong.toNumber();
      fs.close(fd, (err?) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          FDState.close(fd);
          thread.asyncReturn();
        }
      });
    }

    public static 'link0(JJ)V'(thread: JVMThread, arg0: Long, arg1: Long): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'unlink0(J)V'(thread: JVMThread, pathAddress: Long): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.unlink(getStringFromHeap(thread, pathAddress), (err) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          thread.asyncReturn();
        }
      });
    }

    public static 'unlinkat0(IJI)V'(thread: JVMThread, arg0: number, arg1: Long, arg2: number): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'mknod0(JIJ)V'(thread: JVMThread, arg0: Long, arg1: number, arg2: Long): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'rename0(JJ)V'(thread: JVMThread, oldAddr: Long, newAddr: Long): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.rename(getStringFromHeap(thread, oldAddr), getStringFromHeap(thread, newAddr), (err) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          thread.asyncReturn();
        }
      });
    }

    public static 'renameat0(IJIJ)V'(thread: JVMThread, arg0: number, arg1: Long, arg2: number, arg3: Long): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'mkdir0(JI)V'(thread: JVMThread, pathAddr: Long, mode: number): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.mkdir(getStringFromHeap(thread, pathAddr), mode, (err) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          thread.asyncReturn();
        }
      });
    }

    public static 'rmdir0(J)V'(thread: JVMThread, pathAddr: Long): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.rmdir(getStringFromHeap(thread, pathAddr), (err) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          thread.asyncReturn();
        }
      });
    }

    public static 'readlink0(J)[B'(thread: JVMThread, pathAddr: Long): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.readlink(getStringFromHeap(thread, pathAddr), (err, linkPath) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          thread.asyncReturn(stringToByteArray(thread, linkPath));
        }
      });
    }

    public static 'realpath0(J)[B'(thread: JVMThread, pathAddress: Long): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.realpath(getStringFromHeap(thread, pathAddress), (err, resolvedPath) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          thread.asyncReturn(stringToByteArray(thread, resolvedPath));
        }
      });
    }

    public static 'symlink0(JJ)V'(thread: JVMThread, arg0: Long, arg1: Long): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'stat0(JLsun/nio/fs/UnixFileAttributes;)V'(thread: JVMThread, pathAddress: Long, jvmStats: JVMTypes.sun_nio_fs_UnixFileAttributes): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.stat(getStringFromHeap(thread, pathAddress), (err, stats) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          convertStats(stats, jvmStats);
          thread.asyncReturn();
        }
      });
    }

    public static 'lstat0(JLsun/nio/fs/UnixFileAttributes;)V'(thread: JVMThread, pathAddress: Long, jvmStats: JVMTypes.sun_nio_fs_UnixFileAttributes): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.lstat(getStringFromHeap(thread, pathAddress), (err, stats) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          convertStats(stats, jvmStats);
          thread.asyncReturn();
        }
      });
    }

    public static 'fstat(ILsun/nio/fs/UnixFileAttributes;)V'(thread: JVMThread, fd: number, jvmStats: JVMTypes.sun_nio_fs_UnixFileAttributes): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.fstat(fd, (err, stats) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          convertStats(stats, jvmStats);
          thread.asyncReturn();
        }
      });
    }

    public static 'fstatat0(IJILsun/nio/fs/UnixFileAttributes;)V'(thread: JVMThread, arg0: number, arg1: Long, arg2: number, arg3: JVMTypes.sun_nio_fs_UnixFileAttributes): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'chown0(JII)V'(thread: JVMThread, arg0: Long, arg1: number, arg2: number): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'lchown0(JII)V'(thread: JVMThread, arg0: Long, arg1: number, arg2: number): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'fchown(III)V'(thread: JVMThread, arg0: number, arg1: number, arg2: number): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'chmod0(JI)V'(thread: JVMThread, arg0: Long, arg1: number): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'fchmod(II)V'(thread: JVMThread, arg0: number, arg1: number): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'utimes0(JJJ)V'(thread: JVMThread, pathAddress: Long, times0: Long, times1: Long): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      const p = getStringFromHeap(thread, pathAddress);
      const t0 = new Date(times0.toNumber());
      const t1 = new Date(times1.toNumber());
      fs.utimes(p, t0, t1, (err) => {
        // Ignore ENOTSUP errors; some BFS backends do not support this operation,
        // and ignoring the error isn't typically an issue.
        if (err && err.code !== 'ENOTSUP') {
          throwNodeError(thread, err);
        } else {
          thread.asyncReturn();
        }
      });
    }

    public static 'futimes(IJJ)V'(thread: JVMThread, fd: number, times0: Long, times1: Long): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      const t0 = new Date(times0.toNumber());
      const t1 = new Date(times1.toNumber());
      fs.futimes(fd, t0, t1, (err) => {
        // Ignore ENOTSUP errors; some BFS backends do not support this operation,
        // and ignoring the error isn't typically an issue.
        if (err && err.code !== 'ENOTSUP') {
          throwNodeError(thread, err);
        } else {
          thread.asyncReturn();
        }
      });
    }

    public static 'opendir0(J)J'(thread: JVMThread, ptr: Long): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      fs.readdir(getStringFromHeap(thread, ptr), (err, files) => {
        if (err) {
          convertError(thread, err, (errObj) => {
            thread.throwException(errObj);
          });
        } else {
          thread.asyncReturn(Long.fromNumber(dirMap.newEntry(new DirFd(files))), null);
        }
      });
    }

    public static 'fdopendir(I)J'(thread: JVMThread, arg0: number): Long {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      return null;
    }

    public static 'closedir(J)V'(thread: JVMThread, arg0: Long): void {
      dirMap.removeEntry(thread, arg0.toNumber(), 'Lsun/nio/fs/UnixException;');
    }

    public static 'readdir(J)[B'(thread: JVMThread, fd: Long): JVMTypes.JVMArray<number> {
      var dirFd = dirMap.getEntry(thread, 'Lsun/nio/fs/UnixException;', fd.toNumber());
      if (dirFd) {
        return stringToByteArray(thread, dirFd.next());
      }
    }

    public static 'read(IJI)I'(thread: JVMThread, fd: number, buf: Long, nbyte: number): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      let buff = thread.getJVM().getHeap().get_buffer(buf.toNumber(), nbyte);
      fs.read(fd, buff, 0, nbyte, FDState.getPos(fd), (err, bytesRead) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          FDState.incrementPos(fd, bytesRead);
          thread.asyncReturn(bytesRead);
        }
      });
    }

    public static 'write(IJI)I'(thread: JVMThread, fd: number, buf: Long, nbyte: number): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      let buff = thread.getJVM().getHeap().get_buffer(buf.toNumber(), nbyte);
      fs.write(fd, buff, 0, nbyte, FDState.getPos(fd), (err, bytesWritten) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          FDState.incrementPos(fd, bytesWritten);
          thread.asyncReturn(bytesWritten);
        }
      });
    }

    public static 'access0(JI)V'(thread: JVMThread, pathAddress: Long, arg1: number): void {
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      // TODO: Need to check specific flags
      const pathString = getStringFromHeap(thread, pathAddress);
      // TODO: fs.access() is better but not currently supported in browserfs: https://github.com/jvilk/BrowserFS/issues/128
      const checker = util.are_in_browser() ? fs.stat : fs.access;
      checker(pathString, (err, stat) => {
        if (err) {
          throwNodeError(thread, err);
        } else {
          thread.asyncReturn();
        }
      });
    }

    public static 'getpwuid(I)[B'(thread: JVMThread, arg0: number): JVMTypes.JVMArray<number> {
      // Make something up.
      return stringToByteArray(thread, 'doppio');
    }

    public static 'getgrgid(I)[B'(thread: JVMThread, arg0: number): JVMTypes.JVMArray<number> {
      // Make something up.
      return stringToByteArray(thread, 'doppio');
    }

    public static 'getpwnam0(J)I'(thread: JVMThread, arg0: Long): number {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      return 0;
    }

    public static 'getgrnam0(J)I'(thread: JVMThread, arg0: Long): number {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      return 0;
    }

    public static 'statvfs0(JLsun/nio/fs/UnixFileStoreAttributes;)V'(thread: JVMThread, arg0: Long, arg1: JVMTypes.sun_nio_fs_UnixFileStoreAttributes): void {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }

    public static 'pathconf0(JI)J'(thread: JVMThread, arg0: Long, arg1: number): Long {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      return null;
    }

    public static 'fpathconf(II)J'(thread: JVMThread, arg0: number, arg1: number): Long {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      return null;
    }

    public static 'strerror(I)[B'(thread: JVMThread, arg0: number): JVMTypes.JVMArray<number> {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
      return null;
    }

    public static 'init()I'(thread: JVMThread): number {
      return 0;
    }

  }

  return {
    'sun/nio/ch/FileChannelImpl': sun_nio_ch_FileChannelImpl,
    'sun/nio/ch/NativeThread': sun_nio_ch_NativeThread,
    'sun/nio/ch/IOUtil': sun_nio_ch_IOUtil,
    'sun/nio/ch/FileDispatcherImpl': sun_nio_ch_FileDispatcherImpl,
    'sun/nio/fs/UnixNativeDispatcher': sun_nio_fs_UnixNativeDispatcher
  };
};
