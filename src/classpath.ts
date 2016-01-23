import {TriState} from './enums';
import assert = require('./assert');
import fs = require('fs');
import path = require('path');
import BrowserFS = require('browserfs');
import util = require('./util');
// Type information only.
import TBFSFS from 'browserfs/dist/node/core/FS';
// Export so it can be returned from ClasspathJar.
export type TZipFS = BrowserFS.FileSystem.ZipFS;
let BFSFS = BrowserFS.BFSRequire('fs');
let ZipFS = BrowserFS.FileSystem.ZipFS;
export type MetaIndex = {[pkgName: string]: boolean | MetaIndex};

/**
 * Represents an item on the classpath. Used by the bootstrap classloader.
 */
export interface IClasspathItem {
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

function win2nix(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Represents a JAR file on the classpath.
 */
export abstract class AbstractClasspathJar {
  protected _fs = new BFSFS.FS();
  /**
   * Was the JAR file successfully read?
   * - TRUE: JAR file is read and mounted in this._fs.
   * - FALSE: JAR file could not be read.
   * - INDETERMINATE: We have yet to try reading this JAR file.
   */
  protected _jarRead = TriState.INDETERMINATE;
  protected _path: string;
  constructor(path: string) {
    this._path = path;
  }

  public getPath(): string { return this._path; }

  public loadJar(cb: (e?: Error) => void): void {
    if (this._jarRead !== TriState.TRUE) {
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
    } else {
      setImmediate(() => cb(this._jarRead === TriState.TRUE ? null : new Error("Failed to load JAR file.")));
    }
  }

  public abstract hasClass(type: string): TriState;

  public tryLoadClassSync(type: string): Buffer {
    if (this._jarRead === TriState.TRUE) {
      if (this.hasClass(type) !== TriState.FALSE) {
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
        this.loadJar(() => {
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
      this._fs.readdir(win2nix(p), cb);
    }, cb);
  }

  public tryReaddirSync(p: string): string[] {
    return this._wrapSyncOp<string[]>(() => {
      return this._fs.readdirSync(win2nix(p));
    });
  }

  public tryStatSync(p: string): fs.Stats {
    return this._wrapSyncOp<fs.Stats>(() => {
      return this._fs.statSync(win2nix(p));
    });
  }

  public getFS(): TZipFS {
    return <TZipFS> this._fs.getRootFS();
  }
}

/**
 * A JAR item on the classpath that is not in the meta index.
 */
export class UnindexedClasspathJar extends AbstractClasspathJar implements IClasspathItem {
  // Contains the list of classes accessible from this classpath item.
  private _classList: {[className: string]: boolean} = null;

  constructor(p: string) {
    super(p);
  }

  public hasClass(type: string): TriState {
    if (this._jarRead === TriState.FALSE) {
      return TriState.FALSE;
    } else {
      return this._hasClass(type);
    }
  }

  public _hasClass(type: string): TriState {
    if (this._classList) {
      return this._classList[type] ? TriState.TRUE : TriState.FALSE;
    }
    return TriState.INDETERMINATE;
  }

  /**
   * Initialize this item on the classpath with the given classlist.
   * @param classes List of classes in pkg/path/Name format.
   */
  public initializeWithClasslist(classes: string[]): void {
    assert(this._classList === null, `Initializing a classpath item twice!`);
    this._classList = {};
    let len = classes.length;
    for (let i = 0; i < len; i++) {
      this._classList[classes[i]] = true;
    }
  }

  public initialize(cb: (e?: Error) => void): void {
    this.loadJar((err) => {
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
}

/**
 * A JAR file on the classpath that is in the meta-index.
 */
export class IndexedClasspathJar extends AbstractClasspathJar implements IClasspathItem {
  private _metaIndex: MetaIndex;
  private _metaName: string;

  constructor(metaIndex: MetaIndex, p: string) {
    super(p);
    this._metaIndex = metaIndex;
    this._metaName = path.basename(p);
  }

  public initialize(cb: (e?: Error) => void): void {
    setImmediate(() => cb());
  }

  public hasClass(type: string): TriState {
    if (this._jarRead === TriState.FALSE) {
      return TriState.FALSE;
    } else {
      let pkgComponents = type.split('/');
      let search: MetaIndex = this._metaIndex;
      // Pop off class name.
      pkgComponents.pop();
      for (let i = 0; i < pkgComponents.length; i++) {
        let item = search[pkgComponents[i]];
        if (!item) {
          // item === undefined or false.
          return TriState.FALSE;
        } else if (item === true) {
          return TriState.INDETERMINATE;
        } else {
          // Must be an object.
          search = <any> item;
        }
      }
      // Assume meta-index is complete.
      return TriState.FALSE;
    }
  }
}

/**
 * Represents a folder on the classpath.
 */
export class ClasspathFolder implements IClasspathItem {
  private _path: string;
  constructor(path: string) {
    this._path = path;
  }

  public getPath(): string { return this._path; }

  public hasClass(type: string): TriState {
    return TriState.INDETERMINATE;
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

  public getPath(): string { return this._path; }

  public hasClass(type: string): TriState { return TriState.FALSE; }

  public initialize(cb: (e?: Error) => void): void { setImmediate(cb); }

  public initializeWithClasslist(classlist: string[]): void {}

  public tryLoadClassSync(type: string): Buffer { return null; }

  private _notFoundError(cb: (err: Error) => void): void { setImmediate(() => cb(new Error("Class cannot be found."))); }

  public loadClass(type: string, cb: (err: Error, data?: Buffer) => void): void { this._notFoundError(cb); }

  public statResource(p: string, cb: (err: Error, stats?: fs.Stats) => void): void { this._notFoundError(cb); }

  public readdir(p: string, cb: (e: Error, list?: string[]) => void): void { this._notFoundError(cb); }

  public tryReaddirSync(p: string): string[] { return null; }

  public tryStatSync(p: string): fs.Stats { return null; }
}

/**
 * Parse the meta index into a lookup table from package name (with slashes) to JAR file.
 * Returns a tuple of JAR files in the meta index and the meta index.
 */
function parseMetaIndex(metaIndex: string): {[jarFile: string]: MetaIndex} {
  let lines = metaIndex.split("\n");
  let rv: {[jarFile: string]: MetaIndex} = {};
  let currentJar: MetaIndex = null;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.length > 0) {
      switch (line[0]) {
        case '%':
        case '@':
          // Comment or resource-only JAR file.
          continue;
        case '!':
        case '#':
          // JAR file w/ classes.
          // Skip symbol and space.
          let jarName = line.slice(2);
          rv[jarName] = currentJar = {};
          break;
        default:
          // Package name. If it ends with /, then it's shared
          // amongst multiple JAR files.
          // We don't treat those separately, though, so standardize it.
          if (line[line.length - 1] === '/') {
            line = line.slice(0, line.length - 1);
          }
          let pkgComponents = line.split('/');
          let current = currentJar;
          let i: number;
          for (i = 0; i < pkgComponents.length - 1; i++) {
            let cmp = pkgComponents[i],
              next = current[cmp];
            if (!next) {
              current = current[cmp] = {};
            } else {
              // Invariant: You can't list a package and its subpackages
              // for same jar file. Thus, current[cmp] cannot be a boolean.
              current = <any> current[cmp];
            }
          }
          current[pkgComponents[i]] = true;
          break;
      }
    }
  }
  return rv;
}

/**
 * Given a list of paths (which may or may not exist), produces a list of
 * classpath objects.
 */
export function ClasspathFactory(javaHomePath: string, paths: string[], cb: (items: IClasspathItem[]) => void): void {
  let classpathItems: IClasspathItem[] = new Array<IClasspathItem>(paths.length),
    i: number = 0;

  fs.readFile(path.join(javaHomePath, 'lib', 'meta-index'), (err, data) => {
    let metaIndex: {[jarName: string]: MetaIndex} = {};
    if (!err) {
      metaIndex = parseMetaIndex(data.toString());
    }
    util.asyncForEach(paths, (p, nextItem) => {
      let pRelToHome = path.relative(`${javaHomePath}/lib`, p);
      fs.stat(p, (err, stats) => {
        let cpItem: IClasspathItem;
        if (err) {
          cpItem = new ClasspathNotFound(p);
        } else if (stats.isDirectory()) {
          cpItem = new ClasspathFolder(p);
        } else {
          if (metaIndex[pRelToHome]) {
            cpItem = new IndexedClasspathJar(metaIndex[pRelToHome], p);
          } else {
            cpItem = new UnindexedClasspathJar(p);
          }
        }
        classpathItems[i++] = cpItem;
        cpItem.initialize(nextItem);
      });
    }, (e?) => {
      cb(classpathItems);
    });
  })
}
