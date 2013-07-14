"use strict"

root = this

util = require '../src/util'

asyncExecute = this.asyncExecute ? (require './util').asyncExecute

root.untar = (bytes, cb, done_cb) ->
  next_file = ->
    [path,body] = shift_file(bytes)
    percent = bytes.pos() / bytes.size()
    cb percent, path, body
    if bytes.peek() != 0
      asyncExecute next_file
    else
      done_cb?()
  asyncExecute next_file

shift_file = (bytes) ->
  header = bytes.read(512)
  fname = util.bytes2str header[0...100], true
  size = octal2num header[124...124+11]
  prefix = util.bytes2str header[345...345+155], true
  fullname = if prefix then "#{prefix}/#{fname}" else fname
  padding = Math.ceil(size/512)*512 - size
  file = bytes.slice(size)
  bytes.skip padding
  [fullname, file]

octal2num = (bytes) ->
  num = 0
  msd = bytes.length - 1
  for b, idx in bytes
    digit = parseInt String.fromCharCode b
    num += digit * Math.pow 8, (msd - idx)
  num

if module? and not module.parent
  fs = require 'fs'
  data = new util.BytesArray fs.readFileSync('/dev/stdin')
  root.untar data, (percent, path, file) ->
    console.log path
