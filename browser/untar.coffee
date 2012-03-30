root = this

util ?= require '../src/util'

root.untar = (bytes, cb, done_cb) ->
  total_len = bytes.length
  next_file = ->
    [path,body] = shift_file(bytes)
    percent = 1 - bytes.length / total_len
    cb percent, path, body
    if bytes[0] != 0
      asyncExecute next_file
    else
      done_cb?()
  asyncExecute next_file, 0

shift_file = (bytes) ->
  header = bytes.splice(0, 512)
  fname = util.bytes2str header[0...100]
  size = octal2num header[124...124+11]
  prefix = util.bytes2str header[345...345+155]
  fullname = if prefix then "#{prefix}/#{fname}" else fname

  body = bytes.splice(0, Math.ceil(size/512)*512)
  file = body.splice 0, size
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
  data = fs.readFileSync '/dev/stdin', 'binary'
  root.untar data, (path, file) ->
    console.log path, util.bytes2str file
