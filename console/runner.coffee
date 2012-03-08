#!/usr/bin/env coffee
fs = require 'fs'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'

read_binary_file = (filename) ->
  util.bytestr_to_array fs.readFileSync(filename, 'binary')

relpath = process.argv[1].replace(/\/[^\/]*$/, '')
read_classfile = (cls) -> read_binary_file "#{relpath}/../third_party/#{cls}.class"

# first two are 'coffee', 'scriptname.coffee'
if process.argv.length > 2
	fname = process.argv[2]
	args = process.argv.slice(3)
else
    fname = '/dev/stdin'
    args = process.argv.slice(2)

class_data = new ClassFile read_binary_file(fname)
jvm.run class_data, console.log, read_classfile, args
