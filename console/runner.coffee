#!/usr/bin/env coffee
fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'
optimist = require 'optimist'
{argv} = optimist

optimist.usage('Usage: $0 [args for JVM] [--log=[0-10]|debug|error')

return optimist.showHelp() if argv.help

if argv.log == 'debug' or argv.log == 'error'
  util.log_level = util[argv.log.toUpperCase()]
else if argv.log? # assume a number
  util.log_level = argv.log + 0

read_binary_file = (filename) ->
  return null unless path.existsSync filename
  util.bytestr_to_array fs.readFileSync(filename, 'binary')

read_classfile = (cls) ->
  classpath = [ "#{__dirname}/../third_party/classes", "." ]
  for p in classpath
    data = read_binary_file "#{p}/#{cls}.class"
    return data if data?
  throw new Error "Could not find class: #{cls} in path: [#{classpath}]"

fname = argv._[0] or '/dev/stdin'
class_data = new ClassFile read_binary_file(fname)
java_cmd_args = (arg.toString() for arg in argv._[1..])

jvm.run class_data, console.log, read_classfile, java_cmd_args
