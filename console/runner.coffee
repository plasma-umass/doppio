#!/usr/bin/env coffee
fs = require 'fs'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'

read_binary_file = (filename) ->
  util.bytestr_to_array fs.readFileSync(filename, 'binary')

read_classfile = (cls) -> read_binary_file "third_party/classes/#{cls}.class"

# first two are 'coffee', 'scriptname.coffee'
fname = if process.argv.length > 2 then process.argv[2] else '/dev/stdin'
class_data = new ClassFile read_binary_file(fname)

jvm.run class_data, console.log, read_classfile, []
