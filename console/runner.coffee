#!/usr/bin/env coffee
fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
logging = require '../src/logging'
methods = require '../src/methods'
runtime = require '../src/runtime'

"use strict"

run_profiled = (runner, rs, cname, hot=false) ->
  if hot
    runner()
  timings = {}
  call_counts = {}
  profiled_fn = (old_fn) -> ->
    method = rs.curr_frame().method
    caller = rs.meta_stack().get_caller(1).method
    method_sig = method.full_signature
    hash = "#{if caller? then caller.full_signature else "program"}|#{method_sig}"
    timings[hash] ?= 0
    call_counts[method_sig] ?= 0

    start = (new Date).getTime()
    old_fn.apply this, arguments
    end = (new Date).getTime()

    timings[hash] += end - start
    call_counts[method_sig]++

  methods.Method::run_bytecode = profiled_fn(methods.Method::run_bytecode)
  methods.Method::run_manually = profiled_fn(methods.Method::run_manually)

  runner()

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
  total_time = total_timings["#{cname}::main([Ljava/lang/String;)"]
  console.log "\nProfiler results: #{total_time} ms total"
  console.log ['total','self','calls','self ms/call','name'].join '\t'
  for entry in arr[0..30]
    avg = entry.self / entry.counts
    console.log "#{entry.total}\t#{entry.self}\t#{entry.counts}\t#{avg.toFixed 1}\t#{entry.name}"

stub = (obj, name, replacement, wrapped) ->
  old_fn = obj[name]
  try
    obj[name] = replacement
    wrapped()
  finally
    obj[name] = old_fn

extract_jar = (jar_path, main_class_name) ->
  AdmZip = require 'adm-zip'
  jar_name = path.basename jar_path, '.jar'
  fs.mkdirSync '/tmp/doppio' unless fs.existsSync '/tmp/doppio'
  tmpdir = "/tmp/doppio/#{jar_name}"
  fs.mkdirSync tmpdir unless fs.existsSync tmpdir
  new AdmZip(jar_path).extractAllTo tmpdir, true
  jvm.classpath.unshift tmpdir
  return tmpdir

find_main_class = (extracted_jar_dir) ->
  # find the main class in the manifest
  manifest_path = "#{extracted_jar_dir}/META-INF/MANIFEST.MF"
  manifest = fs.readFileSync manifest_path, 'utf8'
  for line in manifest.split '\n'
    match = line.match /Main-Class: (\S+)/
    return util.int_classname(match[1]) if match?
  return


if require.main == module
  optimist = require('optimist')
    .boolean(['count-logs','h','list-class-cache'])
    .alias({h: 'help'})
    .describe({
      classpath: 'JVM classpath, "path1:...:pathn"',
      jspath: 'compiled JS file classpath, "path1:...:pathn"',
      java: 'args for main function',
      log: 'log level, [0-10]|vtrace|trace|debug|error',
      profile: 'turn on profiler, --profile=hot for warm cache',
      jar: 'add JAR to classpath and run its Main-Class (if found)',
      'count-logs': 'count log messages instead of printing them',
      'skip-logs': 'number of log messages to skip before printing',
      'list-class-cache': 'list all of the loaded classes after execution',
      h: 'Show this usage'})
    .usage 'Usage: $0 /path/to/classfile [flags]'
  argv = optimist.argv
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

  for path_name in ['classpath', 'jspath']
    if argv[path_name]?
      jvm[path_name] = argv[path_name].split ':'
    else
      jvm[path_name] = ["."]

  jvm.classpath.push "#{__dirname}/../vendor/classes"

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
  java_cmd_args = (argv.java?.toString().trim().split /\s+/) or []

  if argv.jar?
    jar_dir = extract_jar argv.jar
    cname = find_main_class(jar_dir) unless cname?
    unless cname?
      console.error "No main class provided and no Main-Class found in #{argv.jar}"

  run = -> jvm.run_class rs, cname, java_cmd_args, null, argv.compile

  if argv.profile?
    run_profiled run, rs, cname, argv.hot
  else if argv['count-logs']
    count = 0
    stub console, 'log', (-> ++count), run
    console.log "console.log() was called a total of #{count} times."
  else if argv['skip-logs']? # avoid generating unnecessary log data
    count = parseInt argv['skip-logs'], 10
    old_fn = console.log
    stub console, 'log', (-> if --count == 0 then console.log = old_fn), run
  else
    run()

  if argv['list-class-cache']
    scriptdir = path.resolve(__dirname + "/..")
    for k in Object.keys rs.loaded_classes
      # Find where it was loaded from.
      file = k + ".class"
      for cpath in jvm.classpath
        fpath = cpath + '/' + file
        try
          if fs.statSync(fpath).isFile()
            fpath = path.resolve(fpath).substr(scriptdir.length+1)
            console.log(fpath)
            break
        catch e
          # Do nothing; iterate.
