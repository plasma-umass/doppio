#!/usr/bin/env coffee
fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'

exports.read_binary_file = (filename) ->
  return null unless path.existsSync filename
  util.bytestr_to_array fs.readFileSync(filename, 'binary')

exports.read_classfile = (cls) ->
  classpath = [ ".", "#{__dirname}/../third_party/classes" ]
  for p in classpath
    data = exports.read_binary_file "#{p}/#{cls}.class"
    return new ClassFile data if data?

if require.main == module
  optimist = require 'optimist'
  {argv} = optimist

  optimist.usage('Usage: $0 /path/to/classfile --java=[args for JVM] [--log=[0-10]|debug|error]')

  return optimist.showHelp() if argv.help

  if argv.log == 'debug' or argv.log == 'error'
    util.log_level = util[argv.log.toUpperCase()]
  else if argv.log? # assume a number
    util.log_level = argv.log + 0

  fname = argv._[0] or '/dev/stdin'
  class_data = new ClassFile exports.read_binary_file fname
  stdout = process.stdout.write.bind process.stdout
  read_stdin = (n_bytes, resume) ->
    buffer = []
    stdin = process.openStdin()
    tty = require('tty')
    tty.setRawMode true  # so we can catch EOF and single keystrokes
    stdin.on 'keypress', (str,key) ->
      b = str.charCodeAt(0)  # TODO: unicode?
      buffer.push b
      if buffer.length is n_bytes or b is 4  # 04 -> EOF
        stdin.removeAllListeners 'keypress'
        tty.setRawMode false  # important! otherwise, we won't be able to send ctrl-c to the process
        resume buffer
        process.exit 0  # a bit of a hack: stdin is open, so it doesn't want to exit normally

  java_cmd_args = (argv.java?.split /\s+/) or []

  rs = new runtime.RuntimeState(stdout, read_stdin, exports.read_classfile)
  jvm.run_class rs, class_data, java_cmd_args
