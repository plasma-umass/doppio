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
    .boolean(['count-logs','h','list-class-cache','show-nyi-natives',
      'dump-state','benchmark'])
    .alias({h: 'help'})
    .describe({
      D: 'system properties, key=value, comma-separated',
      benchmark: 'time execution, both hot and cold',
      classpath: 'JVM classpath, "path1:...:pathn"',
      log: 'log level, [0-10]|vtrace|trace|debug|error',
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

  if argv.D?
    for prop in argv.D.split ','
      [key,value] = prop.split '='
      jvm.system_properties[key.trim()] = value.trim()


  cname = argv._[0]
  cname = cname[0...-6] if cname?[-6..] is '.class'
  return optimist.showHelp() unless cname? or argv.jar?

  stdout = process.stdout.write.bind process.stdout
  read_stdin = (resume) ->
    process.stdin.resume()
    process.stdin.once 'data', (data) ->
      process.stdin.pause()
      resume data

  bs_cl = new BootstrapClassLoader(jvm.read_classfile)
  rs = new runtime.RuntimeState(stdout, read_stdin, bs_cl)

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

  done_cb = switch
    when argv['list-class-cache']
      ->  # done_cb
        scriptdir = path.resolve(__dirname + "/..")
        for k in rs.get_bs_cl().get_loaded_class_list(true)
          # Find where it was loaded from.
          file = "#{k}.class"
          for cpath in jvm.system_properties['java.class.path']
            fpath = cpath + file
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
    when argv['count-logs']
      count = 0
      old_log = console.log
      console.log = -> ++count
      ->  # done_cb
        console.log = old_log
        console.log "console.log() was called a total of #{count} times."
    when argv['skip-logs']?
      # avoid generating unnecessary log data
      count = parseInt argv['skip-logs'], 10
      old_log = console.log
      console.log = -> if --count == 0 then console.log = old_log
      ->  # no special handling needed in done_cb
    when argv['benchmark']
      console.log 'Starting cold-cache run...'
      cold_start = (new Date).getTime()
      ->  # done_cb runs it again, for hot cache timing
        mid_point = (new Date).getTime()
        console.log 'Starting hot-cache run...'
        # Reset runtime state.
        rs = new runtime.RuntimeState(stdout, read_stdin, bs_cl)
        run ->
          finished = (new Date).getTime()
          console.log "Timing:\n\t#{mid_point-cold_start} ms cold\n\t#{finished-mid_point} ms hot"
    else
      # default done_cb is a no-op
      ->

  process.on 'SIGINT', ->
    console.error 'Doppio caught SIGINT'
    rs.dump_state() if jvm.dump_state
    process.exit 0

  # finally set up. run it.
  run(done_cb)
