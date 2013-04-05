#!/usr/bin/env coffee
fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
logging = require '../src/logging'
methods = require '../src/methods'
runtime = require '../src/runtime'
{BootstrapClassLoader} = require '../src/ClassLoader'

"use strict"

run_profiled = (runner, rs, cname, hot=false) ->
  if hot
    runner()

  timings = {}
  call_counts = {}

  profiled_fn = (old_fn) -> ->
    method = rs.curr_frame().method
    caller = rs.meta_stack().get_caller(1).method
    method_sig = method.full_signature()
    hash = "#{if caller? then caller.full_signature() else "program"}|#{method_sig}"
    timings[hash] ?= 0
    call_counts[method_sig] ?= 0

    start = (new Date).getTime()
    old_fn.apply this, arguments
    end = (new Date).getTime()

    timings[hash] += end - start
    call_counts[method_sig]++


  methods.Method::run_bytecode = profiled_fn(methods.Method::run_bytecode)
  methods.Method::run_manually = profiled_fn(methods.Method::run_manually)

  runner (->
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
    total_time = total_timings["L#{cname};::main([Ljava/lang/String;)V"]

    console.log "\nProfiler results: #{total_time} ms total"
    console.log ['total','self','calls','self ms/call','name'].join '\t'
    for entry in arr[0..30]
      avg = entry.self / entry.counts
      console.log "#{entry.total}\t#{entry.self}\t#{entry.counts}\t#{avg.toFixed 1}\t#{entry.name}"
    )

stub = (obj, name, replacement, wrapped) ->
  old_fn = obj[name]
  try
    obj[name] = replacement
    wrapped()
  finally
    obj[name] = old_fn

extract_all_to = (files, dest_dir) ->
  for filepath, file of files
    filepath = path.join dest_dir, filepath
    if file.options.dir or filepath.slice(-1) is '/'
      fs.mkdirSync filepath unless fs.existsSync filepath
    else
      fs.writeFileSync filepath, file.data, 'binary'
  return

extract_jar = (jar_path, main_class_name) ->
  JSZip = require 'node-zip'
  unzipper = new JSZip(fs.readFileSync(jar_path, 'binary'), {base64: false, checkCRC32: true})
  jar_name = path.basename jar_path, '.jar'
  fs.mkdirSync '/tmp/doppio' unless fs.existsSync '/tmp/doppio'
  tmpdir = "/tmp/doppio/#{jar_name}"
  fs.mkdirSync tmpdir unless fs.existsSync tmpdir
  extract_all_to(unzipper.files, tmpdir)
  jvm.system_properties['java.class.path'].unshift tmpdir
  return tmpdir

find_main_class = (extracted_jar_dir) ->
  # find the main class in the manifest
  manifest_path = "#{extracted_jar_dir}/META-INF/MANIFEST.MF"
  manifest = fs.readFileSync manifest_path, 'utf8'
  for line in manifest.split '\n'
    match = line.match /Main-Class: (\S+)/
    return match[1].replace /\./g, '/' if match?
  return


if require.main == module
  # note that optimist does not know how to parse quoted string parameters, so we must
  # place the arguments to the java program after '--' rather than as a normal flag value.
  optimist = require('optimist')
    .boolean(['count-logs','h','list-class-cache','show-nyi-natives','dump-state'])
    .alias({h: 'help'})
    .describe({
      classpath: 'JVM classpath, "path1:...:pathn"',
      log: 'log level, [0-10]|vtrace|trace|debug|error',
      profile: 'turn on profiler, --profile=hot for warm cache',
      jar: 'add JAR to classpath and run its Main-Class (if found)',
      'jar-args': 'arguments to pass to the Main-Class of a jar',
      'count-logs': 'count log messages instead of printing them',
      'skip-logs': 'number of log messages to skip before printing',
      'list-class-cache': 'list all of the loaded classes after execution',
      'show-nyi-natives': 'list any NYI native functions in loaded classes',
      'dump-state': 'write a "core dump" on unusual termination',
      h: 'Show this usage'})
    .usage 'Usage: $0 /path/to/classfile [flags] -- [args for main()]'
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

  jvm.show_NYI_natives = argv['show-nyi-natives']
  jvm.dump_state = argv['dump-state']

  if argv.classpath?
    jvm.set_classpath "#{__dirname}/../vendor/classes", argv.classpath
  else
    jvm.set_classpath "#{__dirname}/../vendor/classes", '.'

  cname = argv._[0]
  cname = cname[0...-6] if cname?[-6..] is '.class'
  return optimist.showHelp() unless cname? or argv.jar?

  stdout = process.stdout.write.bind process.stdout
  read_stdin = (n_bytes, resume) ->
    process.stdin.resume()
    process.stdin.once 'data', (data) ->
      process.stdin.pause()
      resume data

  rs = new runtime.RuntimeState(stdout, read_stdin, new BootstrapClassLoader(jvm.read_classfile))

  if argv.jar?
    jar_dir = extract_jar argv.jar
    cname = find_main_class(jar_dir) unless cname?
    unless cname?
      console.error "No main class provided and no Main-Class found in #{argv.jar}"
    main_args = []
    if argv['jar-args']?
      main_args = require('shell-quote').parse(argv['jar-args'])
  else
    main_args = argv._[1..]

  run = (done_cb) -> jvm.run_class rs, cname, main_args, done_cb
  done_cb = ->
    if argv['list-class-cache']
      scriptdir = path.resolve(__dirname + "/..")
      for k in rs.get_bs_cl().get_loaded_class_list()
        k = k[1...-1]
        # Find where it was loaded from.
        file = k + ".class"
        for cpath in jvm.system_properties['java.class.path']
          fpath = cpath + '/' + file
          try
            if fs.statSync(fpath).isFile()
              fpath = path.resolve(fpath).substr(scriptdir.length+1)
              # Ensure the truncated path is valid. This ensures that the file
              # is in a subdirectory of "scriptdir"
              if fs.existsSync fpath
                console.log(fpath)
              break
          catch e
            # Do nothing; iterate.

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
    run(done_cb)
