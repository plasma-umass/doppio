#!/usr/bin/env coffee

fs = require 'fs'
path = require 'path'
optimist = require 'optimist'
jvm = require '../src/jvm'
opcodes = require '../src/opcodes'
{RuntimeState} = require '../src/runtime'
natives = require '../src/natives'

setup_opcode_stats = ->
  # monkeypatch opcode execution
  op_stats = {}
  for num, op of opcodes.opcodes
    op_stats[op.name] = 0
    old_fn = op.execute
    op.execute = do (old_fn) ->
      (rs) ->
        op_stats[@name]++
        old_fn.call @, rs
  op_stats

setup_native_stats = ->
  # monkeypatch native and trapped calls
  native_stats = {}
  for sig, func of natives.native_methods
    native_stats[sig] = 0
    natives.native_methods[sig] = do (func, sig) ->
      (args...) ->
        native_stats[sig]++
        func args...
  for sig, func of natives.trapped_methods
    native_stats[sig] = 0
    natives.trapped_methods[sig] = do (func, sig) ->
      (args...) ->
        native_stats[sig]++
        func args...
  native_stats

print_usage = (stats) ->
  names = (name for name,count of stats)
  names.sort (a, b) -> stats[b] - stats[a]
  console.log stats[name], name for name in names

print_unused = (stats, stats_name) ->
  unused_count = 0
  for name, count of stats when count == 0
    unused_count++
    console.log name
  if unused_count > 0
    console.log "#{unused_count} #{stats_name} have yet to be tested."

run_tests = (test_classes, quiet) ->
  # set up the classpath and get the test dir
  doppio_dir = path.resolve __dirname, '..'
  # get the tests, if necessary
  if test_classes?.length > 0
    test_classes = (tc.replace(/\.class$/,'') for tc in test_classes)
  else
    test_dir = path.resolve doppio_dir, 'classes/test'
    test_classes = []
    for file in fs.readdirSync(test_dir) when path.extname(file) == '.java'
      test_classes.push "classes/test/#{path.basename(file, '.java')}"
  # set up the claspath
  jcl_dir = path.resolve doppio_dir, 'vendor/classes'
  jvm.classpath = [doppio_dir, jcl_dir]

  # run each class, reusing the same heap and string pool and class info
  rs = new RuntimeState((->), (->), jvm.read_classfile)
  for c in test_classes
    console.log "running #{c}..." unless quiet
    jvm.run_class(rs, c, [])
  return


if require.main == module
  {argv} = optimist
  optimist.usage '''
  Usage: $0 [class_file(s)]
  Optional flags:
    --print-usage
    -n, --natives
    -o, --opcodes
    -q, --quiet
    -h, --help
  '''
  return optimist.showHelp() if argv.help? or argv.h?
  do_opcodes = argv.o? or argv.opcodes?
  do_natives = argv.n? or argv.natives?

  unless do_opcodes or do_natives
    console.error 'Must select natives, opcodes, or both'
    return optimist.showHelp()

  op_stats = setup_opcode_stats() if do_opcodes
  native_stats = setup_native_stats() if do_natives
  run_tests(argv._, argv.q? or argv.quiet?)

  if argv['print-usage']?
    print_usage op_stats if do_opcodes
    print_usage native_stats if do_natives
  else
    print_unused op_stats, 'opcodes' if do_opcodes
    print_unused native_stats, 'native methods' if do_natives
