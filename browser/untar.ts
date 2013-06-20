
declare var setImmediate;
import util = module('../src/util');

var nonAsyncCount = 0;

// modern browsers slow the event loop when tab is not in focus,
// so don't give up control! but guard against stack overflows, too.
function asyncExecute(fn: Function): void {
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
  var size = octal2num(header.slice(124, 124 + 11));
  var prefix = util.bytes2str(header.slice(345, 345 + 155), true);
  var fullname = fname;
  if (prefix)
    fullname = prefix + "/" + fname;
  var body = bytes.read(Math.ceil(size / 512) * 512);
  var file = body.slice(0, size);
  return [fullname, file];
}

function octal2num(bytes: number[]): number {
  var num = 0;
  var msd = bytes.length - 1;
  for (var idx = 0; idx < bytes.length; idx++) {
    var b = bytes[idx];
    var digit = parseInt(String.fromCharCode(b));
    num += digit * Math.pow(8, msd - idx);
  }
  return num;
}
