import {TriState} from './enums';
import assert = require('./assert');
import fs = require('fs');
import path = require('path');
import BrowserFS = require('browserfs');
import util = require('./util');
let BFSFS = BrowserFS.BFSRequire('fs');
let ZipFS = BrowserFS.FileSystem.ZipFS;

/**
 * Represents an item on the classpath. Used by the bootstrap classloader.
 */
export interface IClasspathItem {
  /**
   * Initialize this item on the classpath with the given classlist.
   * @param classes List of classes in pkg/path/Name format.
   */
  initializeWithClasslist(classes: string[]): void;
  /**
   * Initializes this item on the classpath. Asynchronous, as the classpath
   * item needs to populate its classlist.
   */
  initialize(cb: () => void): void;
  /**
   * Returns true if this classpath item has the given class.
   * Reference types only.
   * NOTE: Loading of said class is not guaranteed to succeed.
   * @param type Class name in pkg/path/Name format.
   * @returns True if it has the class, false if not, indeterminate if it
   *   cannot be determined synchronously.
   */
  hasClass(type: string): TriState;
  /**
   * Attempt to load the given class synchronously. Returns a buffer,
   * or returns NULL if unsuccessful.
   * @param type Class name in pkg/path/Name format.
   */
  tryLoadClassSync(type: string): Buffer;
  /**
   * Load a class with the given type (e.g. Ljava/lang/String;).
   * @param type Class name in pkg/path/Name format.
   */
  loadClass(type: string, cb: (err: Error, data?: Buffer) => void): void;
  /**
   * Get the path to this classpath item.
   */
  getPath(): string;
  /**
   * Stat a particular resource in the classpath.
   */
  statResource(p: string, cb: (e: Error, stat?: fs.Stats) => void): void
  /**
   * Read the given directory within the classpath item.
   */
  readdir(p: string, cb: (e: Error, list?: string[]) => void): void;
  /**
   * Tries to perform a readdir synchronously. Returns null if unsuccessful.
   */
  tryReaddirSync(p: string): string[];
  /**
   * Tries to perform a stat operation synchronously. Returns null if unsuccessful.
   */
  tryStatSync(p: string): fs.Stats;
}

/**
 * Contains shared classpath item functionality.
 */
export abstract class AbstractClasspathItem {
  // Contains the list of classes accessible from this classpath item.
  protected _classList: {[className: string]: boolean} = null;
  protected _path: string;

  constructor(path: string) {
    this._path = path;
  }

  public getPath(): string {
    return this._path;
  }

  public initializeWithClasslist(classes: string[]): void {
    assert(this._classList === null, `Initializing a classpath item twice!`);
    this._classList = {};
    let len = classes.length;
    for (let i = 0; i < len; i++) {
      this._classList[classes[i]] = true;
    }
  }

  public _hasClass(type: string): TriState {
    if (this._classList) {
      return this._classList[type] ? TriState.TRUE : TriState.FALSE;
    }
    return TriState.INDETERMINATE;
  }
}

/**
 * Represents a JAR file on the classpath.
 */
export class ClasspathJar extends AbstractClasspathItem implements IClasspathItem {
  private _fs = new BFSFS.FS();
  // Was the JAR file successfully read?
  // TRUE: JAR file is read and mounted in this._fs.
  // FALSE: JAR file could not be read.
  // INDETERMINATE: We have yet to try reading this JAR file.
  private _jarRead = TriState.INDETERMINATE;
  constructor(path: string) {
    super(path);
  }

  private _loadJar(cb: (e?: Error) => void): void {
    fs.readFile(this._path, (e, data) => {
      if (e) {
        this._jarRead = TriState.FALSE;
        cb(e);
      } else {
        try {
          this._fs.initialize(new ZipFS(data, path.basename(this._path)));
          this._jarRead = TriState.TRUE;
          cb();
        } catch (e) {
          this._jarRead = TriState.FALSE;
          cb(e);
        }
      }
    });
  }

  public initialize(cb: (e?: Error) => void): void {
    this._loadJar((err) => {
      if (err) {
        cb();
      } else {
        let pathStack: string[] = ['/'];
        let classlist: string[] = [];
        let fs = this._fs;
        while (pathStack.length > 0) {
          let p = pathStack.pop();
          try {
            let stat = fs.statSync(p);
            if (stat.isDirectory()) {
              let listing = fs.readdirSync(p);
              for (let i = 0; i < listing.length; i++) {
                pathStack.push(path.join(p, listing[i]));
              }
            } else if (path.extname(p) === '.class') {
              // Cut off initial / from absolute path.
              classlist.push(p.slice(1, p.length - 6));
            }
          } catch (e) {
            // Ignore filesystem error and proceed.
          }
        }
        this.initializeWithClasslist(classlist);
        cb();
      }
    });
  }

  public hasClass(type: string): TriState {
    if (this._jarRead === TriState.FALSE) {
      return TriState.FALSE;
    } else {
      return this._hasClass(type);
    }
  }

  public tryLoadClassSync(type: string): Buffer {
    if (this._jarRead === TriState.TRUE) {
      if (this.hasClass(type) === TriState.TRUE) {
        try {
          // NOTE: Path must be absolute, otherwise BrowserFS
          // will try to use process.cwd().
          return this._fs.readFileSync(`/${type}.class`);
        } catch (e) {
          return null;
        }
      } else {
        return null;
      }
    } else {
      // Must go the async route.
      return null;
    }
  }

  /**
   * Wrap an operation that depends on the jar being loaded.
   */
  private _wrapOp(op: () => void, failCb: (e: Error) => void): void {
    switch (this._jarRead) {
      case TriState.TRUE:
        op();
        break;
      case TriState.FALSE:
        setImmediate(() => failCb(new Error("Unable to load JAR file.")));
        break;
      default:
        this._loadJar(() => {
          this._wrapOp(op, failCb);
        });
        break;
    }
  }

  /**
   * Wrap a synchronous operation that depends on the jar being loaded.
   * Returns null if the jar isn't loaded, or if the operation fails.
   */
  private _wrapSyncOp<T>(op: () => T): T {
    if (this._jarRead === TriState.TRUE) {
      try {
        return op();
      } catch (e) {
        return null;
      }
    } else {
      return null;
    }
  }

  public loadClass(type: string, cb: (err: Error, data?: Buffer) => void): void {
    this._wrapOp(() => {
      // Path must be absolute to avoid relative path issues.
      this._fs.readFile(`/${type}.class`, cb);
    }, cb);
  }

  public statResource(p: string, cb: (err: Error, stats?: fs.Stats) => void): void {
    this._wrapOp(() => {
      this._fs.stat(p, cb);
    }, cb);
  }

  public readdir(p: string, cb: (e: Error, list?: string[]) => void): void {
    this._wrapOp(() => {
      this._fs.readdir(p, cb);
    }, cb);
  }

  public tryReaddirSync(p: string): string[] {
    return this._wrapSyncOp<string[]>(() => {
      return this._fs.readdirSync(p);
    });
  }

  public tryStatSync(p: string): fs.Stats {
    return this._wrapSyncOp<fs.Stats>(() => {
      return this._fs.statSync(p);
    });
  }
}

/**
 * Represents a folder on the classpath.
 */
export class ClasspathFolder extends AbstractClasspathItem implements IClasspathItem {
  constructor(path: string) {
    super(path);
  }

  public hasClass(type: string): TriState {
    return this._hasClass(type);
  }

  public initialize(cb: (e?: Error) => void): void {
    // NOP.
    setImmediate(cb);
  }

  public tryLoadClassSync(type: string): Buffer {
    try {
      return fs.readFileSync(path.resolve(this._path, `${type}.class`));
    } catch (e) {
      return null;
    }
  }

  public loadClass(type: string, cb: (err: Error, data?: Buffer) => void): void {
    fs.readFile(path.resolve(this._path, `${type}.class`), cb);
  }

  public statResource(p: string, cb: (err: Error, stats?: fs.Stats) => void): void {
    fs.stat(path.resolve(this._path, p), cb);
  }

  public readdir(p: string, cb: (e: Error, list?: string[]) => void): void {
    fs.readdir(path.resolve(this._path, p), cb);
  }

  public tryReaddirSync(p: string): string[] {
    try {
      return fs.readdirSync(path.resolve(this._path, p));
    } catch (e) {
      return null;
    }
  }

  public tryStatSync(p: string): fs.Stats {
    try {
      return fs.statSync(path.resolve(this._path, p));
    } catch (e) {
      return null;
    }
  }
}

/**
 * Represents a classpath item that cannot be found.
 */
export class ClasspathNotFound implements IClasspathItem {
  private _path: string;
  constructor(path: string) {
    this._path = path;
  }

  public getPath(): string {
    return this._path;
  }

  public hasClass(type: string): TriState {
    return TriState.FALSE;
  }

  public initialize(cb: (e?: Error) => void): void {
    setImmediate(cb);
  }

  public initializeWithClasslist(classlist: string[]): void {

  }

  public tryLoadClassSync(type: string): Buffer {
    return null;
  }

  private _notFoundError(cb: (err: Error) => void): void {
    setImmediate(() => {
      cb(new Error("Class cannot be found."));
    });
  }

  public loadClass(type: string, cb: (err: Error, data?: Buffer) => void): void {
    this._notFoundError(cb);
  }

  public statResource(p: string, cb: (err: Error, stats?: fs.Stats) => void): void {
    this._notFoundError(cb);
  }

  public readdir(p: string, cb: (e: Error, list?: string[]) => void): void {
    this._notFoundError(cb);
  }

  public tryReaddirSync(p: string): string[] {
    return null;
  }

  public tryStatSync(p: string): fs.Stats {
    return null;
  }
}

/**
 * Given a list of paths (which may or may not exist), produces a list of
 * classpath objects.
 *
 * @param paths Either the string contents of the classpath location, or an
 *   object literal with the path and its classlist.
 */
export function ClasspathFactory(paths: (string | {path: string; classlist: string[];})[], cb: (items: IClasspathItem[]) => void): void {
  let classpathItems: IClasspathItem[] = [];
  util.asyncForEach(paths, (p, nextItem) => {
    let actualPath: string, classlist: string[] = null;
    if (typeof p === "string") {
      actualPath = p;
    } else {
      actualPath = p.path;
      classlist = p.classlist;
    }
    fs.stat(actualPath, (err, stats) => {
      let cpItem: IClasspathItem;
      if (err) {
        cpItem = new ClasspathNotFound(actualPath);
      } else if (stats.isDirectory()) {
        cpItem = new ClasspathFolder(actualPath);
      } else {
        cpItem = new ClasspathJar(actualPath);
      }
      classpathItems.push(cpItem);
      if (classlist) {
        cpItem.initializeWithClasslist(classlist);
        nextItem();
      } else {
        cpItem.initialize(nextItem);
      }
    });
  }, (e?) => {
    cb(classpathItems);
  });
}
