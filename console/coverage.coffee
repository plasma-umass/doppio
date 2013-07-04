#!/usr/bin/env coffee

fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
opcodes = require '../src/opcodes'
{RuntimeState} = require '../src/runtime'
{BootstrapClassLoader} = require '../src/ClassLoader'
natives = require '../src/natives'
testing = require '../src/testing'

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
  names = (name for name of stats)
  names.sort (a, b) -> stats[b] - stats[a]
  console.log stats[name], name for name in names
  return

print_unused = (stats, stats_name) ->
  unused_count = 0
  for name, count of stats when count == 0
    unused_count++
    console.log name
  if unused_count > 0
    console.log "#{unused_count} #{stats_name} have yet to be tested."

run_tests = (test_classes, stdout, quiet, callback) ->
  doppio_dir = if node? then '/home/doppio/' else path.resolve __dirname, '..'
  # get the tests, if necessary
  if test_classes?.length > 0
    test_classes = (tc.replace(/\.class$/,'') for tc in test_classes)
  else
    test_classes = testing.find_test_classes doppio_dir
  # set up the classpath
  jcl_dir = path.resolve doppio_dir, 'vendor/classes'
  jvm.set_classpath jcl_dir, doppio_dir

  _runner = () ->
    return callback() if test_classes.length == 0
    test = test_classes.shift()
    quiet || stdout "running #{test}...\n"
    rs = new RuntimeState((->), (->), new BootstrapClassLoader(jvm.read_classfile))
    jvm.run_class rs, test, [], _runner

  _runner()


if require.main == module
  {print} = require 'util'
  optimist = require('optimist')
    .boolean(['n','o','q','h'])
    .alias({n: 'natives', o: 'opcodes', q: 'quiet', p: 'print-usage', h: 'help'})
    .describe({
      n: 'Cover native functions',
      o: 'Cover opcodes',
      q: 'Suppress in-progress output',
      p: 'Print all usages, not just unused'
      h: 'Show usage'})
    .usage 'Usage: $0 [class_file(s)]'
  argv = optimist.argv
  return optimist.showHelp() if argv.help

  unless argv.opcodes or argv.natives
    console.error 'Must select natives, opcodes, or both'
    return optimist.showHelp()

  op_stats = setup_opcode_stats() if argv.opcodes
  native_stats = setup_native_stats() if argv.natives
  run_tests argv._, print, argv.quiet, ->
    if argv['print-usage']?
      print_usage op_stats if argv.opcodes
      print_usage native_stats if argv.natives
    else
      print_unused op_stats, 'opcodes' if argv.opcodes
      print_unused native_stats, 'native methods' if argv.natives
