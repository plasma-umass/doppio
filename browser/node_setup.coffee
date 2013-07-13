"use strict"

# Doppio's custom 'require' function, which BFS monkey-patches.
window.require = (path, herp) ->
  # XXX: Hackfix for Ace Editor. The Ace Editor clobbers our require definiton,
  # but recalls it with an empty first argument.
  if herp? then path = herp
  [name, ext] = BrowserFS.node.path.basename(path).split '.'
  window[name] ?= {}

BrowserFS.install(window)

mfs = new BrowserFS.FileSystem.MountableFileSystem()
mfs.mount('/home', new BrowserFS.FileSystem.LocalStorage())
mfs.mount('/sys', new BrowserFS.FileSystem.XmlHttpRequest('browser/listings.json'))
BrowserFS.initialize(mfs)
window.node = BrowserFS.node
