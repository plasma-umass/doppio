#! /usr/bin/env coffee

fs = require 'fs'
path = require 'path'

symLinks = {}

rdSync = (dpath, tree, name) ->
  files = fs.readdirSync(dpath)
  for file in files
    # ignore non-essential directories / files
    continue if file in ['.git', 'node_modules']
    fpath = dpath + '/' + file
    try
      # Avoid infinite loops.
      lstat = fs.lstatSync(fpath)
      if lstat.isSymbolicLink()
        realdir = fs.readlinkSync(fpath)
        # Ignore if we've seen it before
        continue if symLinks[realdir]?
        symLinks[realdir] = 1

      fstat = fs.statSync(fpath)
      if fstat.isDirectory()
        tree[file] = child = {}
        rdSync(fpath, child, file)
      else
        tree[file] = null
    catch e
      # Ignore and move on.
  return tree

fs_listing = rdSync(process.cwd(), {}, '/')

process.on('exit', (-> console.log JSON.stringify(fs_listing)))
