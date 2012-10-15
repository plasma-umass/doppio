#!/usr/bin/env coffee
fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/ClassFile'
methods = require '../src/methods'
runtime = require '../src/runtime'

classpath = [ ".", "#{__dirname}/../third_party/classes" ]

exports.read_binary_file = (filename) ->
  return null unless path.existsSync filename
  util.bytestr_to_array fs.readFileSync(filename, 'binary')

exports.read_classfile = (cls) ->
  for p in classpath
    data = exports.read_binary_file "#{p}/#{cls}.class"
    return new ClassFile data if data?

if require.main == module
  optimist = require 'optimist'
  {argv} = optimist

  optimist.usage '''
  Usage: $0 /path/to/classfile
  Optional flags:
    --classpath=[path1:...:pathn]
    --java=[args for JVM]
    --log=[0-10]|vtrace|trace|debug|error
    --profile
    --help
  '''

  return optimist.showHelp() if argv.help

  util.log_level =
    if argv.log?
      util[argv.log?.toUpperCase()] ? (argv.log? + 0)
    else
      util.ERROR

  if argv.classpath?
    classpath = argv.classpath.split ':'
    classpath.push "#{__dirname}/../third_party/classes"

  cname = argv._[0]
  cname = cname[0...-6] if cname[-6..] is '.class'
  return optimist.showHelp() unless cname?

  stdout = process.stdout.write.bind process.stdout
  read_stdin = (n_bytes, resume) ->
    process.stdin.resume()
    process.stdin.once 'data', (data) ->
      process.stdin.pause()
      resume data

  rs = new runtime.RuntimeState(stdout, read_stdin, exports.read_classfile)
  java_cmd_args = (argv.java?.toString().split /\s+/) or []

  if argv.profile
    if argv.profile is 'hot'
      jvm.run_class rs, cname, java_cmd_args
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

  jvm.run_class rs, cname, java_cmd_args, null, argv.compile

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
    console.log "\nProfiler results: #{total_timings["#{cname}::main"]} ms total"
    console.log ['total','self','calls','self ms/call','name'].join '\t'
    for entry in arr[0..30]
      avg = entry.self / entry.counts
      console.log "#{entry.total}\t#{entry.self}\t#{entry.counts}\t#{avg.toFixed 1}\t#{entry.name}"
