import JVMTypes = require('../../includes/JVMTypes');
import * as Doppio from '../doppiojvm';
import JVMThread = Doppio.VM.Threading.JVMThread;
import ReferenceClassData = Doppio.VM.ClassFile.ReferenceClassData;
import logging = Doppio.Debug.Logging;
import util = Doppio.VM.Util;
import Long = Doppio.VM.Long;
import ThreadStatus = Doppio.VM.Enums.ThreadStatus;
import fs = require('fs');
declare var registerNatives: (defs: any) => void;

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

  public static 'transferTo0(IJJI)J'(thread: JVMThread, javaThis: JVMTypes.sun_nio_ch_FileChannelImpl, arg0: number, arg1: Long, arg2: Long, arg3: number): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    // Satisfy TypeScript return type.
    return null;
  }

  public static 'position0(Ljava/io/FileDescriptor;J)J'(thread: JVMThread, javaThis: JVMTypes.sun_nio_ch_FileChannelImpl, fd: JVMTypes.java_io_FileDescriptor, offset: Long): Long {
    return Long.fromNumber(offset.equals(Long.NEG_ONE) ? fd.$pos : fd.$pos = offset.toNumber());
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

class sun_nio_ch_IOUtil {

  public static 'iovMax()I'(thread: JVMThread): number {
    // Maximum number of IOVectors supported. Let's punt and say zero.
    return 0;
  }

}

class sun_nio_ch_FileDispatcherImpl {

  public static 'init()V'(thread: JVMThread): void {

  }

  public static 'read0(Ljava/io/FileDescriptor;JI)I'(thread: JVMThread, fdObj: JVMTypes.java_io_FileDescriptor, address: Long, len: number): void {
    var fd = fdObj["java/io/FileDescriptor/fd"],
      // read upto len bytes and store into mmap'd buffer at address
      addr = address.toNumber(),
      buf = new Buffer(len);
    thread.setStatus(ThreadStatus.ASYNC_WAITING);
    fs.read(fd, buf, 0, len, 0, (err, bytesRead) => {
      if (err) {
        thread.throwNewException("Ljava/io/IOException;", 'Error reading file: ' + err);
      } else {
        var i: number, heap = thread.getJVM().getHeap();
        for (i = 0; i < bytesRead; i++) {
          heap.set_byte(addr + i, buf.readUInt8(i));
        }
        thread.asyncReturn(bytesRead);
      }
    });
  }

  public static 'preClose0(Ljava/io/FileDescriptor;)V'(thread: JVMThread, arg0: JVMTypes.java_io_FileDescriptor): void {
    // NOP, I think the actual fs.close is called later. If not, NBD.
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

var dirMap = new FDMap<DirFd>(),
  fileMap = new FDMap<number>();

function getStringFromHeap(thread: JVMThread, ptrLong: Long): string {
  var heap = thread.getJVM().getHeap(),
      ptr = ptrLong.toNumber(),
      len = 0;
  while (heap.get_signed_byte(ptr + len) !== 0) {
    len++;
  }
  return heap.get_buffer(ptr, len).toString();
}

function stringToByteArray(thread: JVMThread, str: string): JVMTypes.JVMArray<number> {
  if (!str) {
    return null;
  }

  var buff = new Buffer(str, 'utf8'), len = buff.length,
    arr = util.newArray<number>(thread, thread.getBsCl(), '[B', len + 1),
    i: number;
  for (i = 0; i < len; i++) {
    arr.array[i] = buff.readUInt8(i);
  }
  arr.array[len] = 0;
  return arr;
}

function convertError(thread: JVMThread, err: NodeJS.ErrnoException, cb: (err: JVMTypes.sun_nio_fs_UnixException) => void): void {
  thread.setStatus(ThreadStatus.ASYNC_WAITING);
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

class sun_nio_fs_UnixNativeDispatcher {

  public static 'getcwd()[B'(thread: JVMThread): JVMTypes.JVMArray<number> {
    var buff = new Buffer(`${process.cwd()}\0`, 'utf8'), len = buff.length,
      rv = util.newArray<number>(thread, thread.getBsCl(), '[B', len),
      i: number;

    for (i = 0; i < len; i++) {
      rv.array[i] = buff.readInt8(i);
    }

    return rv;
  }

  public static 'dup(I)I'(thread: JVMThread, arg0: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return 0;
  }

  public static 'open0(JII)I'(thread: JVMThread, arg0: Long, arg1: number, arg2: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return 0;
  }

  public static 'openat0(IJII)I'(thread: JVMThread, arg0: number, arg1: Long, arg2: number, arg3: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return 0;
  }

  public static 'close(I)V'(thread: JVMThread, arg0: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'fopen0(JJ)J'(thread: JVMThread, arg0: Long, arg1: Long): Long {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return null;
  }

  public static 'fclose(J)V'(thread: JVMThread, arg0: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'link0(JJ)V'(thread: JVMThread, arg0: Long, arg1: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'unlink0(J)V'(thread: JVMThread, arg0: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'unlinkat0(IJI)V'(thread: JVMThread, arg0: number, arg1: Long, arg2: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'mknod0(JIJ)V'(thread: JVMThread, arg0: Long, arg1: number, arg2: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'rename0(JJ)V'(thread: JVMThread, arg0: Long, arg1: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'renameat0(IJIJ)V'(thread: JVMThread, arg0: number, arg1: Long, arg2: number, arg3: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'mkdir0(JI)V'(thread: JVMThread, arg0: Long, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'rmdir0(J)V'(thread: JVMThread, arg0: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'readlink0(J)[B'(thread: JVMThread, arg0: Long): JVMTypes.JVMArray<number> {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return null;
  }

  public static 'realpath0(J)[B'(thread: JVMThread, arg0: Long): JVMTypes.JVMArray<number> {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return null;
  }

  public static 'symlink0(JJ)V'(thread: JVMThread, arg0: Long, arg1: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'stat0(JLsun/nio/fs/UnixFileAttributes;)V'(thread: JVMThread, arg0: Long, arg1: JVMTypes.sun_nio_fs_UnixFileAttributes): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'lstat0(JLsun/nio/fs/UnixFileAttributes;)V'(thread: JVMThread, arg0: Long, arg1: JVMTypes.sun_nio_fs_UnixFileAttributes): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'fstat(ILsun/nio/fs/UnixFileAttributes;)V'(thread: JVMThread, arg0: number, arg1: JVMTypes.sun_nio_fs_UnixFileAttributes): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
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

  public static 'utimes0(JJJ)V'(thread: JVMThread, arg0: Long, arg1: Long, arg2: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'futimes(IJJ)V'(thread: JVMThread, arg0: number, arg1: Long, arg2: Long): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
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

  public static 'read(IJI)I'(thread: JVMThread, arg0: number, arg1: Long, arg2: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return 0;
  }

  public static 'write(IJI)I'(thread: JVMThread, arg0: number, arg1: Long, arg2: number): number {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return 0;
  }

  public static 'access0(JI)V'(thread: JVMThread, arg0: Long, arg1: number): void {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
  }

  public static 'getpwuid(I)[B'(thread: JVMThread, arg0: number): JVMTypes.JVMArray<number> {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return null;
  }

  public static 'getgrgid(I)[B'(thread: JVMThread, arg0: number): JVMTypes.JVMArray<number> {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    return null;
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

registerNatives({
  'sun/nio/ch/FileChannelImpl': sun_nio_ch_FileChannelImpl,
  'sun/nio/ch/NativeThread': sun_nio_ch_NativeThread,
  'sun/nio/ch/IOUtil': sun_nio_ch_IOUtil,
  'sun/nio/ch/FileDispatcherImpl': sun_nio_ch_FileDispatcherImpl,
  'sun/nio/fs/UnixNativeDispatcher': sun_nio_fs_UnixNativeDispatcher
});
