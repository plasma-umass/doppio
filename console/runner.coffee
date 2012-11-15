#!/usr/bin/env coffee
fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
logging = require '../src/logging'
methods = require '../src/methods'
runtime = require '../src/runtime'

"use strict"

run_profiled = (rs, cname, java_cmd_args, hot=false) ->
  if hot
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

  jvm.run_class rs, cname, java_cmd_args

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

extract_jar = (jar_path, main_class_name) ->
  AdmZip = require 'adm-zip'
  jar_name = path.basename jar_path, '.jar'
  fs.mkdirSync '/tmp/doppio' unless fs.existsSync '/tmp/doppio'
  tmpdir = "/tmp/doppio/#{jar_name}"
  fs.mkdirSync tmpdir unless fs.existsSync tmpdir
  new AdmZip(jar_path).extractAllTo tmpdir, true
  jvm.classpath.unshift tmpdir
  return main_class_name if main_class_name?
  # find the main class in the manifest
  manifest = fs.readFileSync "#{tmpdir}/META-INF/MANIFEST.MF", 'utf8'
  for line in manifest.split '\n'
    match = line.match /Main-Class: (\S+)/
    return util.int_classname(match[1]) if match?
  console.error "No main class provided and no Main-Class found in #{jar_path}"


if require.main == module
  optimist = require 'optimist'
  {argv} = optimist

  optimist.usage '''
  Usage: $0 /path/to/classfile [flags]
  Optional flags:
    --classpath=[path1:...:pathn]
    --java=[args for JVM]
    --log=[0-10]|vtrace|trace|debug|error
    --profile
    --jar=[path to JAR file]
    --help
  '''

  return optimist.showHelp() if argv.help

  logging.log_level =
    if argv.log?
      if /[0-9]+/.test argv.log
        argv.log + 0
      else
        level = logging[argv.log?.toUpperCase()]
        throw 'Unrecognized log level: should be one of [0-10]|vtrace|trace|debug|error.' unless level?
        level
    else
      logging.ERROR

  if argv.classpath?
    jvm.classpath = argv.classpath.split ':'
    jvm.classpath.push "#{__dirname}/../vendor/classes"
  else
    jvm.classpath = [ ".", "#{__dirname}/../vendor/classes" ]

  cname = argv._[0]
  cname = cname[0...-6] if cname?[-6..] is '.class'
  return optimist.showHelp() unless cname? or argv.jar?

  stdout = process.stdout.write.bind process.stdout
  read_stdin = (n_bytes, resume) ->
    process.stdin.resume()
    process.stdin.once 'data', (data) ->
      process.stdin.pause()
      resume data

  rs = new runtime.RuntimeState(stdout, read_stdin, jvm.read_classfile)
  java_cmd_args = (argv.java?.toString().split /\s+/) or []

  if argv.jar?
    cname = extract_jar argv.jar, cname
    return unless cname?  # couldn't find the main class in the manifest

  if argv.profile?
    run_profiled rs, cname, java_cmd_args, argv.hot
  else
    jvm.run_class rs, cname, java_cmd_args, null, argv.compile
