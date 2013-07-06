#!/usr/bin/env coffee

"use strict"

_ = require '../vendor/_.js'
fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
logging = require '../src/logging'
methods = require '../src/methods'
runtime = require '../src/runtime'
{BootstrapClassLoader} = require '../src/ClassLoader'

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

print_help = (option_descriptions) ->
  launcher = process.argv[0]
  script = require('path').relative process.cwd(), process.argv[1]
  console.log "Usage: #{launcher} #{script} [flags] /path/to/classfile [args for main()]\n"
  console.log option_descriptions

if require.main == module
  # note that optimist does not know how to parse quoted string parameters, so we must
  # place the arguments to the java program after '--' rather than as a normal flag value.
  optparse = require('../src/option_parser')
  optparse.describe
    standard:
      classpath:
        alias: 'cp'
        description: 'JVM classpath, "path1:...:pathN"'
        has_value: true
      D:
        description: 'set a system property, "name[=value]"'
      jar:
        description: 'add JAR to classpath and run its Main-Class (if found)',
        has_value: true
      help:
        alias: 'h'
        description: 'print this help message'
      X: 'print help on non-standard options'

    non_standard:
      log:
        description: 'log level, [0-10]|vtrace|trace|debug|error'
        has_value: true
      'count-logs': 'count log messages instead of printing them'
      'skip-logs':
        description: 'number of log messages to skip before printing'
        has_value: true
      'list-class-cache': 'list all of the loaded classes after execution'
      'show-nyi-natives': 'list any NYI native functions in loaded classes'
      'dump-state': 'write a "core dump" on unusual termination'
      benchmark: 'time execution, both hot and cold'
  argv = optparse.parse(process.argv)
  return print_help optparse.show_help() if argv.standard.help
  return print_help optparse.show_non_standard_help() if argv.standard.X

  logging.log_level =
    if argv.non_standard.log?
      if /[0-9]+/.test argv.non_standard.log
        argv.non_standard.log + 0
      else
        level = logging[argv.non_standard.log.toUpperCase()]
        throw 'Unrecognized log level: should be one of [0-10]|vtrace|trace|debug|error.' unless level?
        level
    else
      logging.ERROR

  jvm.show_NYI_natives = argv.non_standard['show-nyi-natives']
  jvm.dump_state = argv.non_standard['dump-state']

  if argv.standard.classpath?
    jvm.set_classpath "#{__dirname}/../vendor/classes", argv.standard.classpath
  else
    jvm.set_classpath "#{__dirname}/../vendor/classes", '.'

  _.extend jvm.system_properties, argv.properties

  cname = argv.className
  cname = cname[0...-6] if cname?[-6..] is '.class'
  return print_help optparse.show_help() unless cname? or argv.standard.jar?

  main_args = argv._

  stdout = process.stdout.write.bind process.stdout
  read_stdin = (resume) ->
    process.stdin.resume()
    process.stdin.once 'data', (data) ->
      process.stdin.pause()
      resume data

  bs_cl = new BootstrapClassLoader(jvm.read_classfile)
  rs = new runtime.RuntimeState(stdout, read_stdin, bs_cl)

  if argv.standard.jar?
    jar_dir = extract_jar argv.standard.jar
    cname = find_main_class(jar_dir)
    unless cname?
      console.error "No Main-Class found in #{argv.standard.jar}"

  run = (done_cb) -> jvm.run_class rs, cname, main_args, done_cb

  done_cb = switch
    when argv.non_standard['list-class-cache']
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
        return  # avoid accumulating results
    when argv.non_standard['count-logs']
      count = 0
      old_log = console.log
      console.log = -> ++count
      ->  # done_cb
        console.log = old_log
        console.log "console.log() was called a total of #{count} times."
    when argv.non_standard['skip-logs']?
      # avoid generating unnecessary log data
      count = parseInt argv.non_standard['skip-logs'], 10
      old_log = console.log
      console.log = -> if --count == 0 then console.log = old_log
      ->  # no special handling needed in done_cb
    when argv.non_standard['benchmark']
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
      # The default done_cb exits with a nonzero code if we failed.
      (success) -> process.exit !success

  process.on 'SIGINT', ->
    console.error 'Doppio caught SIGINT'
    rs.dump_state() if jvm.dump_state
    process.exit 0

  # finally set up. run it.
  run(done_cb)
