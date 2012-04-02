#! /usr/bin/env coffee

fs = require 'fs'
child_process = require 'child_process'

fs.watchFile 'browser/doppio.html', (curr, prev) ->
  return unless curr.mtime > prev.mtime
  console.log 'Rebuilding index.html...'
  child_process.spawn 'cpp', ['-P', 'browser/doppio.html', 'index.html']
