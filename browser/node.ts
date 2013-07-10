/// <reference path="../vendor/jquery.d.ts" />
var underscore = require('../vendor/_.js');

function basename(path: string): string {
  return path.split('/').pop();
}

/*
window['require'] = function(path: string, herp?: string): any {
  // XXX: Hackfix for Ace Editor. The Ace Editor clobbers our require definiton,
  // but recalls it with an empty first argument.
  if (herp != null) {
    path = herp;
  }
  var parts = basename(path).split('.');
  var name = parts[0];
  var ext = parts[1];
  if (window[name] == null) {
    window[name] = {};
  }
  return window[name];
}
*/

// IE9 and below only: Injects a VBScript function that converts the
// 'responseBody' attribute of an XMLHttpRequest into a bytestring.
// Credit: http://miskun.com/javascript/internet-explorer-and-binary-files-data-access/#comment-11
declare var IEBinaryToArray_ByteStr;
declare var IEBinaryToArray_ByteStr_Last;
function inject_vbscript(): void {
  document.write("<!-- IEBinaryToArray_ByteStr -->\r\n" +
    "<script type='text/vbscript'>\r\n" +
    "Function IEBinaryToArray_ByteStr(Binary)\r\n" +
    "   IEBinaryToArray_ByteStr = CStr(Binary)\r\n" +
    "End Function\r\n" +
    "Function IEBinaryToArray_ByteStr_Last(Binary)\r\n" +
    "   Dim lastIndex\r\n" +
    "   lastIndex = LenB(Binary)\r\n" +
    "   if lastIndex mod 2 Then\r\n" +
    "       IEBinaryToArray_ByteStr_Last = Chr( AscB( MidB( Binary, lastIndex, 1 ) ) )\r\n" +
    "   Else\r\n" +
    "       IEBinaryToArray_ByteStr_Last = " + '""' + "\r\n" +
    "   End If\r\n" +
    "End Function\r\n" +
    "</script>\r\n");
}

// Run once at JavaScript load time.
// XXX: our jquery definition is for 2.0.x, so we hack $.browser.
if ($['browser'].msie && !window['Blob']) {
  inject_vbscript();
}

// Converts 'responseBody' in IE into the equivalent 'responseText' that other
// browsers would generate.
function GetIEByteArray_ByteStr(IEByteArray): string {
  var rawBytes = IEBinaryToArray_ByteStr(IEByteArray);
  var lastChr = IEBinaryToArray_ByteStr_Last(IEByteArray);
  return rawBytes.replace(/[\s\S]/g, (function(match) {
    var v = match.charCodeAt(0);
    return String.fromCharCode(v & 0xff, v >> 8);
  })) + lastChr;
}

// Used for setImmediate.
// Using postMessage is *much* faster than using setTimeout(fn, 0).
// Credit for idea and example implementation goes to:
// http://dbaron.org/log/20100309-faster-timeouts
var timeouts = [];
var messageName = "zero-timeout-message";

// IE8 has postMessage, but it is synchronous. This function detects whether or
// not we can use postMessage as a means to reset the stack.
function canUsePostMessage(): boolean {
  if (!window.postMessage) {
    return false;
  }
  var postMessageIsAsync = true;
  var oldOnMessage = window.onmessage;
  window.onmessage = function() {
    return postMessageIsAsync = false;
  };
  window.postMessage('', '*');
  window.onmessage = oldOnMessage;
  return postMessageIsAsync;
};

var setZeroTimeout;
if (canUsePostMessage()) {
  setZeroTimeout = function(fn): void {
    timeouts.push(fn);
    window.postMessage(messageName, "*");
  };
  function handleMessage(event) {
    if (event.source === self && event.data === messageName) {
      if (event.stopPropagation) {
        event.stopPropagation();
      } else {
        event.cancelBubble = true;
      }
      if (timeouts.length > 0) {
        return timeouts.shift()();
      }
    }
  }
  if (window.addEventListener) {
    // IE10 and all modern browsers
    window.addEventListener('message', handleMessage, true);
  } else {
    // IE9???
    window.attachEvent('onmessage', handleMessage);
  }
} else {
  // Thanks to https://github.com/NobleJS/setImmediate for this hacky solution
  // to IE8.
  setZeroTimeout = function(fn) {
    return setTimeout(fn, 0);
    // Create a <script> element; its readystatechange event will be fired asynchronously once it is inserted
    // into the document. Do so, thus queuing up the task. Remember to clean up once it's been called.
    var scriptEl = window.document.createElement("script");
    scriptEl.onreadystatechange = function() {
      fn();
      scriptEl.onreadystatechange = null;
      scriptEl.parentNode.removeChild(scriptEl);
      scriptEl = null;
    };
    window.document.documentElement.appendChild(scriptEl);
  };
}

// Our 'file descriptor'.
class DoppioFile {
  public temp: boolean;

  public static fromJSON(path: string, rawData: string): DoppioFile {
    var data = JSON.parse(rawData);
    return new DoppioFile(path, data.data, data.mtime, false, data.mode);
  }

  constructor(public path: string, public data: string = '', public mtime?: number, public mod: boolean = false, public mode: number = 0x1a4) {
    if (mtime == null) {
      this.mtime = (new Date).getTime();
    }
  }

  public read(length?: number, pos?: number): string {
    if (length == null) {
      return this.data;
    }
    return this.data.substr(pos, length);
  }

  public write(newData: string, pos?: number): DoppioFile {
    this.mod = true;
    if ((pos != null) && pos < this.data.length) {
      this.data = this.data.slice(0, pos) + newData + this.data.slice(pos + newData.length);
    } else {
      this.data += newData;
    }
    return this;
  }

  public toJSON(): string {
    return JSON.stringify({
      data: this.data,
      mtime: this.mtime,
      mode: this.mode
    });
  }
}


// Helper object. Used by some FileSources to maintain an index of files.
class FileIndex {
  constructor(public index = {}) {}

  // Get subcomponents of the given path.
  private _subcomponents(path: string): string[] {
    var components = path.split('/');
    components.shift();  // Get rid of first slash.
    if (components.length === 1 && components[0] === '') {
      // Special case: Root
      return [];
    } else {
      return components;
    }
  }

  private _add_file(components: string[], fname: string, file: DoppioFile): void {
    var dir = this._mkdir(components);
    dir[fname] = file;
  }

  private _mkdir(components: string[]) {
    var cur_dir = this.index;
    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      if (cur_dir[c] == null) {
        cur_dir[c] = {};
      }
      cur_dir = cur_dir[c];
    }
    return cur_dir;
  }

  private _get(components: string[]): DoppioFile {
    var cur_dir = this.index;
    for (var i = 0; i < components.length; i++) {
      var c = components[i];
      if (!(c in cur_dir)) {
        return null;
      }
      cur_dir = cur_dir[c];
    }
    return <DoppioFile> cur_dir;
  }

  private _is_directory(obj): boolean {
    return (obj != null) && !(obj instanceof DoppioFile);
  }

  // Add the given file to the index. Implicitly creates directories if needed
  // and overwrites things without checking.
  public add_file(path: string, file: DoppioFile): void {
    var components = this._subcomponents(path);
    var fname = components.pop();
    this._add_file(components, fname, file);
  }

  // Retrieves the given file. Returns 'false' if the file does not exist, or if
  // it is a directory. Otherwise, returns the file (which may be null).
  public get_file(path: string): DoppioFile {
    var components = this._subcomponents(path);
    return this._get(components);
  }

  // Returns a directory listing, or null if the directory does not exist.
  public ls(path: string): string[] {
    var components = this._subcomponents(path);
    var dir = this._get(components);
    if (dir !== null && this._is_directory(dir)) {
      return Object.keys(dir);
    }
    return null;
  }

  // Makes the given directory. Implicitly creates needed subdirectories.
  public mkdir(path: string) {
    var components = this._subcomponents(path);
    this._mkdir(components);
  }

  // Returns the parent directory of path or false.
  public parent(path: string) {
    var components = this._subcomponents(path);
    components.pop();
    return this._get(components);
  }

  // Removes the given path, directory or not, from the index. This is a
  // recursive delete. Returns the paths to the files that were deleted if this
  // was a directory, otherwise returns true if a file was deleted, false if
  // the path did not exist.
  public rm(path: string): any {
    var components = this._subcomponents(path);
    var name = components.pop();
    var parent = this._get(components);
    if (parent != null) {
      if (name in parent) {
        var obj = parent[name];
        delete parent[name];
        if (this._is_directory(obj)) {
          return Object.keys(obj);
        }
        return true;
      }
    }
    return false;
  }
}

// Base class for a FileSource. Somewhat of a misnomer, as they are also sinks...
class FileSource {
  // Set to 'true' if this FileSource is redundant to another in some way.
  // This signals that it should be written to / deleted from, even if another
  // applicable source has an identical file or directory path
  public redundant_storage: boolean = false;

  constructor(public mnt_pt: string) {}

  // A handy method for sources that store/retrieve data using a relative file
  // name.
  public _trim_mnt_pt(path: string): string {
    return path.slice(this.mnt_pt.length);
  }

  public fetch(path: string): DoppioFile { return null; }
  public store(path: string, file: DoppioFile): any {}
  public rm(path: string): any {}
  public ls(path: string): any {}
  public mv(path1: string, path2: string, isFile?: boolean): any {}
  public mkdir(path1: string): any {}
}

// Composes multiple file sources into one file source. Prioritizes file sources
// in the order in which they are added.
class CompositedFileSource extends FileSource {
  private sources: { [_:string]: FileSource; };
  private mnt_pts: string[];

  constructor(mnt_pt: string, inpt_sources: FileSource[]) {
    super(mnt_pt);
    this.sources = {};
    this.mnt_pts = [];
    this.redundant_storage = false;
    for (var i = 0; i < inpt_sources.length; i++) {
      this.add_source(inpt_sources[i]);
    }
  }

  // Returns 'true' if the given path is in the given mount point.
  private _in_mnt_pt(path: string, mnt_pt: string): boolean {
    return mnt_pt === '/' || path === mnt_pt ||
      (path.slice(0, mnt_pt.length) === mnt_pt && path[mnt_pt.length] === '/');
  }

  private _get_applicable_sources(path: string): FileSource[] {
    var applicable = [];
    for (var i = 0; i < this.mnt_pts.length; i++) {
      var a_mnt_pt = this.mnt_pts[i];
      if (this._in_mnt_pt(path, a_mnt_pt)) {
        applicable.push(this.sources[a_mnt_pt]);
      }
    }
    return applicable;
  }

  public add_source(source: FileSource): void {
    this.sources[source.mnt_pt] = source;
    this.mnt_pts.push(source.mnt_pt);
    this.redundant_storage || (this.redundant_storage = source.redundant_storage);
  }

  public fetch(path: string): DoppioFile {
    var applicable = this._get_applicable_sources(path);
    for (var i = 0; i < applicable.length; i++) {
      var parent = applicable[i];
      var f = parent.fetch(path);
      if (f != null) {
        return f;
      }
    }
    return null;
  }

  public store(path: string, file: DoppioFile) {
    var applicable = this._get_applicable_sources(path);
    var stored = false;
    for (var i = 0; i < applicable.length; i++) {
      var source = applicable[i];
      if (!(stored && !source.redundant_storage)) {
        stored = source.store(path, file) || stored;
      }
    }
    return stored;
  }

  public rm(path: string) {
    var applicable = this._get_applicable_sources(path);
    var removed = false;
    for (var i = 0; i < applicable.length; i++) {
      var source = applicable[i];
      if (!(removed && !source.redundant_storage)) {
        removed = source.rm(path) || removed;
      }
    }
    return removed;
  }

  public ls(path: string) {
    var applicable = this._get_applicable_sources(path);
    // Initialize to 'null' so that we return 'null' if the path is not present
    // in any applicable FileSources. Note that 'null' != [], as the latter is
    // an existing-but-empty directory.
    var list = null;
    for (var i = 0; i < applicable.length; i++) {
      var source = applicable[i];
      var src_list = source.ls(path);
      if (src_list != null) {
        list = list != null ? underscore.union(list, src_list) : src_list;
      }
    }
    return list;
  }

  public mv(path1: string, path2: string, isFile: boolean = true) {
    var applicable = this._get_applicable_sources(path1);
    var moved = false;
    for (var i = 0; i < applicable.length; i++) {
      var source = applicable[i];
      moved = source.mv(path1, path2, isFile) || moved;
    }
    return moved;
  }

  public mkdir(path: string) {
    var applicable = this._get_applicable_sources(path);
    var dirmade = false;
    for (var i = 0; i < applicable.length; i++) {
      var source = applicable[i];
      dirmade || (dirmade = source.mkdir(path));
    }
    return dirmade;
  }
}

class LocalStorageSource extends FileSource {
  private index: FileIndex;

  constructor(mnt_pt: string) {
    super(mnt_pt);
    // Index of all files in LS.
    this.redundant_storage = true;
    this.index = new FileIndex();
    // Initialize index w/ LS files and directories.
    for (var i = 0; i < localStorage.length; ++i) {
      this.index.add_file(localStorage.key(i), null);
    }
  }

  public fetch(path: string): DoppioFile {
    var data = localStorage.getItem(path);
    if (data != null) {
      return DoppioFile.fromJSON(path, data);
    }
    return null;
  }

  public store(path: string, file: DoppioFile) {
    try {
      // XXX: Don't store if a temporary file.
      if (file.mod && !file.temp) {
        localStorage.setItem(path, file.toJSON());
      }
      this.index.add_file(path, file);
      return true;
    } catch (_error) {
      // Probably out of space.
      return false;
    }
  }

  public rm(path: string) {
    var listing = this.index.rm(path);
    if (typeof listing !== 'boolean') {
      for (var i = 0; i < listing.length; i++) {
        var itPath = path + '/' + listing[i];
        localStorage.removeItem(itPath);
      }
    } else if (localStorage.getItem(path) != null) {
      localStorage.removeItem(path);
    } else {
      return false;
    }
    return true;
  }

  public ls(path: string) {
    return this.index.ls(path);
  }

  public mv(path1: string, path2: string, isFile: boolean = true) {
    if (isFile) {
      var file1_obj = this.fetch(path1);
      if (!((file1_obj != null) && this.rm(path1))) {
        return false;
      }
      file1_obj.path = path2;
      // XXX: Bit of a hack.
      file1_obj.mod = true;
      this.store(path2, file1_obj);
    } else {
      var file1_ls = this.index.ls(path1);
      if (file1_ls == null) {
        return false;
      }
      // Make path2.
      this.index.mkdir(path2);
      // Move every file from p1 to p2.
      for (var i = 0; i < file1_ls.length; i++) {
        var f_name = file1_ls[i];
        this.mv(f_name, path2 + f_name.substr(path1.length), true);
      }
      // Delete p1.
      this.index.rm(path1);
    }
    return true;
  }

  public mkdir(path: string) {
    if (!this.index.parent(path)) {
      return false;
    }
    this.index.mkdir(path);
    return true;
  }
}

class WebserverSource extends FileSource {
  private index: FileIndex;

  constructor(mnt_pt: string, listings_path?: string) {
    super(mnt_pt);
    var idx_data = null;
    if (listings_path != null) {
      idx_data = this._download_file(listings_path);
    }
    this.index = new FileIndex(idx_data != null ? JSON.parse(idx_data) : undefined);
  }

  private _download_file(path: string) {
    // Ensure the file is in the index.
    if (this.index.get_file(this.mnt_pt + path) === null) {
      return null;
    }
    var data = null;
    var req;
    // The below code is complicated because we can't do a 'text' request in IE;
    // it truncates the response at the first NULL character.
    if (!$['browser'].msie) {
      $.ajax(path, {
        type: 'GET',
        dataType: 'text',
        async: false,
        beforeSend: (jqXHR) => jqXHR.overrideMimeType('text/plain; charset=x-user-defined'),
        success: (theData) => data = theData
      });
    } else if (window['Blob']) {
      // In IE10, we can do a 'blob' request to get a binary blob that we can
      // convert into a string.
      // jQuery's 'ajax' function does not support blob requests, so we're going
      // to use XMLHttpRequest directly.
      // Furthermore, the code below will *NOT* work in Firefox or Chrome, since
      // they do not allow synchronous blob or arraybuffer requests.
      req = new XMLHttpRequest();
      req.open('GET', path, false);
      req.responseType = 'arraybuffer';
      req.send();
      if (req.status === 200) {
        var typed_array = new Uint8Array(req.response);
        var arr = [];
        for (var i = 0; i < typed_array.length; i++) {
          arr.push(String.fromCharCode(typed_array[i]));
        }
        data = arr.join('');
      }
    } else {
      // In earlier versions of IE, we can retrieve the 'responseBody'
      // attribute of the response (which contains the *entire* response).
      // Since it's an unsigned array, JavaScript can't touch it, so we
      // pass it to VBScript code that can convert it into something
      // JavaScript can process.
      // Note that this approach also works in IE10 for x86 platforms, but
      // not for ARM platforms which do not have VBScript support.
      req = new XMLHttpRequest();
      req.open('GET', path, false);
      req.setRequestHeader("Accept-Charset", "x-user-defined");
      req.send();
      if (req.status === 200) {
        data = GetIEByteArray_ByteStr(req.responseBody);
      }
    }
    return data;
  }

  public fetch(path: string): DoppioFile {
    var f = this.index.get_file(path);
    if (f === null) {
      // File does not exist on the webserver according to the index, or has
      // been "deleted".
      return null;
    }
    // Fetch the file.
    var trim_path = this._trim_mnt_pt(path);
    var data = this._download_file(trim_path);
    if (data != null) {
      return new DoppioFile(path, data);
    } else {
      return null;
    }
  }

  public ls(path: string) {
    return this.index.ls(path);
  }

  // Deletions occur only on our index, to make the files 'invisible' to the
  // application.
  public rm(path: string) {
    return this.index.rm(path);
  }
}

// Wraps another FileSource and acts as its cache.
class CacheSource extends FileSource {
  private src: FileSource;
  private index: FileIndex;

  constructor(mnt_pt: string, src: FileSource) {
    super(mnt_pt);
    this.src = src;
    this.redundant_storage = src.redundant_storage;
    this.index = new FileIndex();
  }

  public fetch(path: string): DoppioFile {
    var f = this.index.get_file(path);
    if (f === null) {
      f = this.src.fetch(path);
      if (f != null) {
        this.index.add_file(path, f);
      }
    }
    return f;
  }

  public store(path: string, file: DoppioFile) {
    if (this.src.store(path, file)) {
      this.index.add_file(path, file);
      return true;
    }
    return false;
  }

  public rm(path: string) {
    if (this.src.rm(path)) {
      this.index.rm(path);
      return true;
    }
    return false;
  }

  public ls(path: string) {
    return this.src.ls(path);
  }

  public mkdir(path: string) {
    return this.src.mkdir(path);
  }

  public mv(file1: string, file2: string, isFile: boolean = true, ignoreSrc: boolean = false) {
    var success = ignoreSrc ? true : this.src.mv(file1, file2, isFile);
    if (isFile) {
      var f = this.index.get_file(file1);
      if (f) {
        f.path = file2;
        this.index.rm(file1);
        this.index.add_file(file2, f);
      }
    } else {
      var ls = this.index.ls(file1);
      for (var i = 0; i < ls.length; i++) {
        var f_name = ls[i];
        this.mv(f_name, file2 + f_name.substr(file1.length), true, true);
      }
      this.index.rm(file1);
    }
    return success;
  }
}

// Stores the File System's current state.
class FSState {
  private home : string;
  public pwd : string;
  private files : CacheSource;

  constructor() {
    // Files fetched from webserver are always represented internally as
    // relative to home.
    this.home = '/home/doppio';
    this.pwd = this.home;
    var lsfs : FileSource = new LocalStorageSource('/');
    var wsfs : FileSource = new WebserverSource('/home/doppio', '/browser/listings.json');
    var mainSource = new CompositedFileSource('/', [lsfs,wsfs]);
    this.files = new CacheSource('/', mainSource);
    // Slight cheat; ensures that / and /home exist.
    var f = new DoppioFile('/home/doppio/Hello.txt', "Welcome to Doppio!");
    f.mod = true;
    this.files.store('/home/doppio/Hello.txt', f);
  }

  // Canonicalizes the given path.
  public resolve(path: string): string {
    var components = path.split('/');
    var absolute = path[0] === '/';
    for (var idx = 0; idx < components.length; idx++) {
      var c = components[idx];
      if (c === '.') {
        components[idx] = '';
      }
      if (c === '~') {
        components[idx] = this.home;
      }
    }
    if (!absolute) {
      var parts = this.pwd.split('/');
      for (var j = parts.length - 1; j >= 0; j--) {
        components.unshift(parts[j]);
      }
    }
    for (var idx = 0; idx < components.length; idx++) {
      if (components[idx] !== '..') { continue; }
      var processed = false;
      var i = idx - 1;
      while (!processed) {
        if (i < 0) {
          processed = true;
        }
        if (components[i] !== '') {
          components[i] = '';
          components[idx] = '';
          processed = true;
        }
        i--;
      }
    }
    // remove repeated //s
    path = components.filter((c) => c != '').join('/');
    if (path[0] !== '/') {
      return '/' + path;
    }
    return path;
  }

  // Retrieves a file from the file system. Creates a new one if needed.
  // Mode is 'r' for read, 'w' for write+read, 'a' for append+read
  // Returns null if file does not exist.
  public open(path: string, mode: string = 'r'): DoppioFile {
    path = this.resolve(path);
    if (this.is_directory(path)) {
      return null;
    }
    if (mode === 'w') {
      // Start fresh.
      var f = new DoppioFile(path);
      // Ensure writeback when closed.
      f.mod = true;
      return f;
    }
    return this.files.fetch(path);
  }

  public close(file: DoppioFile) {
    this.files.store(file.path, file);
    file.mod = false;
  }

  public list(path: string) {
    return this.files.ls(this.resolve(path));
  }

  public is_file(path: string): boolean {
    return this.files.fetch(this.resolve(path)) != null;
  }

  public is_directory(path: string): boolean {
    return this.list(path) != null;
  }

  public rm(path: string, isDir: boolean = false) {
    path = this.resolve(path);
    if (this.is_directory(path) !== isDir) {
      return false;
    }
    return this.files.rm(path);
  }

  public chdir(dir: string): string {
    dir = this.resolve(dir);
    if (this.is_directory(dir)) {
      this.pwd = dir;
      return dir;
    }
    return null;
  }

  public mkdir(dir: string) {
    dir = this.resolve(dir);
    if (this.is_directory(dir) || this.is_file(dir)) {
      return false;
    }
    return this.files.mkdir(dir);
  }

  public mv(file1: string, file2: string) {
    file1 = this.resolve(file1);
    file2 = this.resolve(file2);
    return this.files.mv(file1, file2);
  }
}

// Currently a singleton.
var fs_state = new FSState();

/******************\
 * NODE EMULATION *
\******************/

class Stat {
  public static fromPath(path: string) {
    // XXX: Hack.
    if (path === '') {
      return null;
    }
    if (fs_state.is_directory(path)) {
      var stat = new Stat;
      stat.size = 1;
      stat.mtime = (new Date).getTime();
      stat.is_file = false;
      stat.mode = 0x1a4;  // XXX: Shhhh...
      return stat;
    } else {
      var file = fs_state.open(path, 'r');
      if (file == null) {
        return null;
      }
      return new Stat(file);
    }
  }

  private file: DoppioFile;
  private is_file: boolean;
  public size: number;
  public mtime: number;
  public mode: number;

  constructor(file?: DoppioFile) {
    this.file = file;
    if (this.file != null) {
      this.size = this.file.data.length;
      this.mtime = this.file.mtime;
      this.is_file = true;
      this.mode = this.file.mode;
    }
  }
  public isFile(): boolean {
    return this.is_file;
  }
  public isDirectory(): boolean {
    return !this.is_file;
  }
}

// This is a global in Node.JS
// TODO: assign it to the global namespace
class Buffer {
  private array : number[];

  // TODO: see if TypeScript has multiple dispatch?
  constructor(obj: any) {
    if (obj instanceof Array) {
      this.array = obj;
    } else {
      // assume that obj is a number
      this.array = new Array(obj);
    }
  }

  public readUInt8(i: number): number {
    // cast to unsigned byte
    return this.array[i] & 0xFF;
  }

  public readInt8(i: number): number {
    return this.array[i];
  }
}

// Node's filesystem API, implemented as a wrapper around FSState.
export var fs = {
  statSync: (path: string) => Stat.fromPath(path),
  stat: function(path: string, cb: Function) {
    var stat = fs.statSync(path);
    if (stat != null) {
      return cb(null, stat);
    } else {
      return cb(new Error("Invalid file: " + path), null);
    }
  },
  fstatSync: (fp) => new Stat(fp),
  openSync: function(path: string, mode: string): DoppioFile {
    // 'r' - Open file for reading. An exception occurs if the file does not exist.
    // 'w' - Open file for writing. The file is created (if it does not exist) or truncated (if it exists).
    // 'a' - Open file for appending. The file is created if it does not exist.
    // Normalize 'mode' to the three we care about
    if (mode.indexOf('w') >= 0) {
      mode = 'w';
    } else if (mode.indexOf('a') >= 0) {
      mode = 'a';
    } else {
      mode = 'r';
    }
    var f = fs_state.open(path, mode);
    if (f == null) {
      var err = new Error;
      err['code'] = 'ENOENT';
      throw err;
    }
    return f;
  },
  open: function(path: string, mode: any, cb?: Function) {
    if (cb == null) {
      cb = mode;
      mode = 'r';
    }
    try {
      var f = fs.openSync(path, mode);
      return cb(null, f);
    } catch (_error) {
      return cb(_error);
    }
  },
  readSync: function(fd, buf, offset, length, pos) {
    var data = fd.read(length, pos);
    for (var i = 0; i < data.length; i++) {
      buf.array[offset + i] = data.charCodeAt(i) & 0xFF;
    }
    return data.length;
  },
  readFileSync: function(path) {
    var f = fs_state.open(path, 'r');
    if (f == null) {
      throw "File does not exist.";
    }
    return f.data;
  },
  readFile: function(path, cb) {
    try {
      var data = fs.readFileSync(path);
      return cb(null, data);
    } catch (_error) {
      return cb(_error);
    }
  },
  // XXX: Temp option prevents writeback to permanent storage. This is not in the
  //      Node API, and is used as a way for the browser to create temp files.
  writeFileSync: function(path, data, encoding?: string, temp?: boolean) {
    var f = fs_state.open(path, 'w');
    f.temp = temp === true;
    f.write(data);
    return fs_state.close(f);
  },
  writeFile: function(path, data, cb) {
    return cb(null, fs.writeFileSync(path, data));
  },
  // TODO flush occasionally?
  // structure borrowed from the Node.js source
  writeSync: function(fd, buffer, offset, len, pos) {
    var str = '';
    if (buffer.readUInt8 != null) {
      for (var i = offset; i < offset + len; i++) {
        str += String.fromCharCode(buffer.readUInt8(i));
      }
    } else {
      // old-style API where buffer is a string
      str += buffer;
      pos = offset;
    }
    return fd.write(str, pos);
  },
  closeSync: (fd) => fs_state.close(fd),
  close: function(fd, cb) {
    fs_state.close(fd);
    return cb();
  },
  readdirSync: function(path: string) {
    var dir_contents = fs_state.list(path);
    if (!((dir_contents != null) && path !== '')) {
      throw "Could not read directory '" + path + "'";
    }
    return dir_contents;
  },
  readdir: function(path, cb) {
    try {
      var files = fs.readdirSync(path);
      return cb(null, files);
    } catch (_error) {
      return cb(_error);
    }
  },
  unlinkSync: function(path) {
    if (!fs_state.rm(path)) {
      throw "Could not unlink '" + path + "'";
    }
  },
  unlink: function(path, cb) {
    try {
      fs.unlinkSync(path);
      return cb();
    } catch (_error) {
      return cb(_error);
    }
  },
  rmdirSync: function(path) {
    if (!fs_state.rm(path, true)) {
      throw "Could not delete '" + path + "'";
    }
  },
  rmdir: function(path, cb) {
    try {
      fs.rmdirSync(path);
      return cb();
    } catch (_error) {
      return cb(_error);
    }
  },
  existsSync: (path) => path !== '' && (fs_state.is_file(path) || fs_state.is_directory(path)),
  exists: (path, cb) => cb(null, fs.existsSync(path)),
  mkdirSync: function(path) {
    if (!fs_state.mkdir(path)) {
      throw "Could not make directory " + path;
    }
  },
  mkdir: function(path, cb) {
    try {
      fs.mkdirSync(path);
      return cb();
    } catch (_error) {
      return cb(_error);
    }
  },
  renameSync: function(path1, path2) {
    if (!fs_state.mv(path1, path2)) {
      throw "Could not rename " + path1 + " to " + path2;
    }
  },
  rename: function(path1, path2, cb) {
    try {
      fs.renameSync(path1, path2);
      return cb();
    } catch (_error) {
      return cb(_error);
    }
  },
  // XXX: Does not work for directory permissions.
  chmodSync: function(path, access) {
    if (!fs_state.is_file(path)) {
      throw "File " + path + " does not exist.";
    }
    var f = fs_state.open(path, 'r');
    f.mod = true;
    f.mode = access;
    fs_state.close(f);
    return true;
  },
  chmod: function(path, access, cb) {
    try {
      var rv = fs.chmodSync(path, access);
      return cb(null, rv);
    } catch (_error) {
      return cb(_error);
    }
  },
  // XXX: this is a NOP, but it shouldn't be. We need to fix the way we stat files first
  utimesSync: function(path, atime, mtime) {},
  utimes: (path, atime, mtime, cb) => cb()
};

// Node's Path API
export var path = {
  normalize: (path) => fs_state.resolve(path),
  resolve: function(...parts: string[]) {
    return fs_state.resolve(parts.join('/'));
  },
  basename: function(path, ext) {
    var base = path.replace(/^.*[\/\\]/, '');
    if (ext != null && ext.length != null && base.slice(base.length - ext.length) === ext) {
      base = base.slice(0, base.length - ext.length);
    }
    return base;
  },
  extname: (path) => path.replace(/^.*(\..*)/, '$1')
};

export var process = {
  cwd: () => fs_state.pwd,
  chdir: function(dir: string): string {
    var absdir = fs_state.chdir(dir);
    if (absdir == null) {
      throw "Invalid directory";
    }
    return absdir;
  }
};

if (window.setImmediate == null) {
  window.setImmediate = setZeroTimeout;
}
