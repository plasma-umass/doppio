#!/usr/bin/env coffee
fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'
methods = require '../src/methods'

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

  cname = argv._[0]
  stdout = process.stdout.write.bind process.stdout
  read_stdin = (n_bytes, resume) ->
    process.stdin.resume()
    process.stdin.once 'data', (data) ->
      process.stdin.pause()
      resume data

  if argv.profile
    timings = {}
    call_counts = {}
    old_fn = methods.Method::run_bytecode
    methods.Method::run_bytecode = do (old_fn) ->
      ->
        m = rs.curr_frame().method
        fn_name = "#{m.class_type.toClassString()}::#{m.name}"
        timings[fn_name] ?= 0
        call_counts[fn_name] ?= 0

        start = (new Date).getTime()
        old_fn.call this, arguments...
        end = (new Date).getTime()

        timings[fn_name] += end - start
        call_counts[fn_name]++

  java_cmd_args = (argv.java?.toString().split /\s+/) or []

  rs = new runtime.RuntimeState(stdout, read_stdin, exports.read_classfile)
  jvm.run_class rs, cname, java_cmd_args

  if argv.profile
    arr = (name: k, total: v, counts:call_counts[k] for k, v of timings)
    arr.sort (a, b) -> b.total - a.total
    for entry in arr[0..20]
      avg = entry.total / entry.counts
      console.log "#{entry.name}: #{entry.total}ms / #{entry.counts} = #{avg.toPrecision 5}ms"
