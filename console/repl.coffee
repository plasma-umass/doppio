#!/usr/bin/env coffee
fs = require 'fs'
path = require 'path'
readline = require 'readline'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'
methods = require '../src/methods'

classpath = [ ".", "#{__dirname}/../third_party/classes" ]

exports.read_binary_file = (filename) ->
  return null unless path.existsSync filename
  util.bytestr_to_array fs.readFileSync(filename, 'binary')

exports.read_classfile = (cls) ->
  for p in classpath
    data = exports.read_binary_file "#{p}/#{cls}.class"
    return new ClassFile data if data?

repl_run = (rs, cname, args) ->
  cname = cname[0...-6] if cname[-6..] is '.class'
  args ?= []
  jvm.run_class rs, cname, args

if require.main == module
  optimist = require 'optimist'
  {argv} = optimist

  optimist.usage '''
  Usage: $0
  Optional flags:
    --classpath=[path1:...:pathn]
    --help
  '''

  return optimist.showHelp() if argv.help

  if argv.classpath?
    classpath = argv.classpath.split ':'
    classpath.push "#{__dirname}/../third_party/classes"

  stdout = process.stdout
  stdin = process.openStdin()

  write_stdout = stdout.write.bind process.stdout
  read_stdin = (n_bytes, resume) ->
    process.stdin.resume()
    process.stdin.once 'data', (data) ->
      process.stdin.pause()
      resume data

  rs = new runtime.RuntimeState(write_stdout, read_stdin, exports.read_classfile)

  repl = readline.createInterface stdin, stdout

  repl.on 'close', ->
    repl.output.write '\n'
    repl.input.destroy()
  repl.on 'line', (line) ->
    toks = line.split /\s+/
    if toks.length > 0
      repl_run rs, toks[0], toks[1..]
    repl.output.write '\n'
    repl.prompt()
  repl.setPrompt 'doppio> '
  repl.prompt()

