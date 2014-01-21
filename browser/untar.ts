
declare var setImmediate;
import util = require('../src/util');

var nonAsyncCount = 0;

// modern browsers slow the event loop when tab is not in focus,
// so don't give up control! but guard against stack overflows, too.
export function asyncExecute(fn: Function): void {
  if ((typeof document !== "undefined" && document !== null) &&
      (document.hidden || document.msHidden) &&
      nonAsyncCount++ < 10000) {
    fn();
  } else {
    nonAsyncCount = 0;
    setImmediate(fn);
  }
}

export function untar(bytes: any, cb: Function, done_cb?: Function): void {
  function next_file(): void {
    var _ref1 = shift_file(bytes);
    var path : string = _ref1[0];
    var body = _ref1[1];
    var percent = bytes.pos() / bytes.size();
    cb(percent, path, body);
    if (bytes.peek() !== 0) {
      asyncExecute(next_file);
    } else if (typeof done_cb === "function") {
      done_cb();
    }
  }
  asyncExecute(next_file);
}

function shift_file(bytes: util.BytesArray): any[] {
  var header = bytes.read(512);
  var fname = util.bytes2str(header.slice(0, 100), true);
  var size = parseInt(util.bytes2str(header.slice(124, 124 + 11)), 8);
  var prefix = util.bytes2str(header.slice(345, 345 + 155), true);
  var fullname = fname;
  if (prefix)
    fullname = prefix + "/" + fname;
  var padding = Math.ceil(size / 512) * 512 - size;
  var file = bytes.slice(size);
  bytes.skip(padding);
  return [fullname, file];
}
