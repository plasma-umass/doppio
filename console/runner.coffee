#!/usr/bin/env coffee
fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'

read_binary_file = (filename) ->
  return null unless path.existsSync filename
  util.bytestr_to_array fs.readFileSync(filename, 'binary')

read_classfile = (cls) ->
  classpath = [ "third_party/classes" ]
  classpath.push(path.dirname process.argv[2]) if process.argv[2]?
  for p in classpath
    data = read_binary_file "#{p}/#{cls}.class"
    return data if data?

# first two are 'coffee', 'scriptname.coffee'
fname = if process.argv.length > 2 then process.argv[2] else '/dev/stdin'
class_data = new ClassFile read_binary_file(fname)

jvm.run class_data, console.log, read_classfile, []
