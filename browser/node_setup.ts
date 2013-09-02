"use strict";

declare var BrowserFS;

// Doppio's custom 'require' function, which BFS monkey-patches.
//window['require'] = function(path, herp) {
  // XXX: Hackfix for Ace Editor. The Ace Editor clobbers our require definiton,
  // but recalls it with an empty first argument.
//  if (herp != null) {
//    path = herp;
//  }
//  var name = BrowserFS.node.path.basename(path).split('.', 1)[0];
//  return window[name] != null ? window[name] : window[name] = {};
//};

BrowserFS.install(window);

var mfs = new BrowserFS.FileSystem.MountableFileSystem();
mfs.mount('/tmp', new BrowserFS.FileSystem.InMemory());
mfs.mount('/demo', new BrowserFS.FileSystem.LocalStorage());
mfs.mount('/sys', new BrowserFS.FileSystem.XmlHttpRequest('browser/listings.json'));
BrowserFS.initialize(mfs);

export var node = BrowserFS.node;
if (!node.fs.existsSync('/demo')) {
  node.fs.mkdirSync('/demo');
}
node.fs.mkdirSync('/tmp');
node.process.chdir('/demo');
