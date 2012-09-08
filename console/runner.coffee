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

  optimist.usage '''
  Usage: $0 /path/to/classfile
    --java=[args for JVM]
    [--log=[0-10]|debug|error]
    [--profile]
  '''

  return optimist.showHelp() if argv.help

  if argv.log == 'debug' or argv.log == 'error'
    util.log_level = util[argv.log.toUpperCase()]
  else if argv.log? # assume a number
    util.log_level = argv.log + 0

  cname = argv._[0]
  cname = cname[0...-6] if cname[-6..] is '.class'
  return optimist.showHelp() unless cname?

  stdout = process.stdout.write.bind process.stdout
  read_stdin = (n_bytes, resume) ->
    process.stdin.resume()
    process.stdin.once 'data', (data) ->
      process.stdin.pause()
      resume data

  if argv.profile
    timings = {}
    call_counts = {}
    profiled_fn = (old_fn) -> ->
      method = rs.curr_frame().method
      caller = rs.meta_stack().get_caller(1).method
      fn_sig = (fn) -> "#{fn.class_type.toClassString()}::#{fn.name}"
      method_name = fn_sig method
      hash = "#{if caller? then fn_sig caller else "program"}|#{method_name}"
      timings[hash] ?= 0
      call_counts[method_name] ?= 0

      start = (new Date).getTime()
      old_fn.call this, arguments...
      end = (new Date).getTime()

      timings[hash] += end - start
      call_counts[method_name]++

    methods.Method::run_bytecode = profiled_fn(methods.Method::run_bytecode)
    methods.Method::run_manually = profiled_fn(methods.Method::run_manually)

  java_cmd_args = (argv.java?.toString().split /\s+/) or []

  rs = new runtime.RuntimeState(stdout, read_stdin, exports.read_classfile)
  jvm.run_class rs, cname, java_cmd_args

  if argv.profile
    self_timings = {}
    total_timings = {}
    for k, v of timings
      [caller,method] = k.split "|"
      self_timings[method]  ?= 0
      self_timings[caller]  ?= 0
      total_timings[method] ?= 0
      self_timings[method]  += v
      self_timings[caller]  -= v
      total_timings[method] += v
    arr = (name: k, total: total_timings[k], self: v, counts:call_counts[k] for k, v of self_timings)
    arr.sort (a, b) -> b.self - a.self
    console.log ['total','self','calls','self ms/call','name'].join '\t'
    for entry in arr[0..30]
      avg = entry.self / entry.counts
      console.log "#{entry.total}\t#{entry.self}\t#{entry.counts}\t#{avg.toFixed 1}\t#{entry.name}"
