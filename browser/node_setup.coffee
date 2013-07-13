"use strict"

# Doppio's custom 'require' function, which BFS monkey-patches.
window.require = (path, herp) ->
  # XXX: Hackfix for Ace Editor. The Ace Editor clobbers our require definiton,
  # but recalls it with an empty first argument.
  if herp? then path = herp
  [name, ext] = BrowserFS.node.path.basename(path).split '.'
  window[name] ?= {}

BrowserFS.install(window)
BrowserFS.initialize(new BrowserFS.FileSystem.InMemory())
window.node = BrowserFS.node
