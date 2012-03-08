#!/usr/bin/env coffee
fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'
optimist = require 'optimist'
{argv} = optimist

optimist.usage('Usage: $0 [args for JVM] [--debug=debug|warn|error|none]')

return optimist.showHelp() if argv.help

read_binary_file = (filename) ->
  return null unless path.existsSync filename
  util.bytestr_to_array fs.readFileSync(filename, 'binary')

read_classfile = (cls) ->
  classpath = [ "#{__dirname}/../third_party/classes" ]
  classpath.push(path.dirname argv._[0]) if argv._[0]?
  for p in classpath
    data = read_binary_file "#{p}/#{cls}.class"
    return data if data?
  throw "Could not find class: #{cls} in path: [#{classpath}]"

# first two are 'coffee', 'scriptname.coffee'
fname = argv._[0] or '/dev/stdin'
class_data = new ClassFile read_binary_file(fname)

jvm.run class_data, console.log, read_classfile, argv._.slice(1), argv.debug
