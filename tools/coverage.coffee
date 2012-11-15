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

run_all_tests = (quiet) ->
  # set up the classpath and get the test dir
  doppio_dir = path.resolve __dirname, '..'
  test_dir = path.resolve doppio_dir, 'test'
  jcl_dir = path.resolve doppio_dir, 'vendor/classes'
  jvm.classpath = [doppio_dir, jcl_dir]

  # run each class, reusing the same heap and string pool and class info
  rs = new RuntimeState((->), (->), jvm.read_classfile)
  for file in fs.readdirSync(test_dir) when path.extname(file) == '.java'
    c = "test/#{path.basename(file, '.java')}"
    console.log "running #{c}..." unless quiet
    jvm.run_class(rs, c, [])
  return

if require.main == module
  {argv} = optimist
  optimist.usage '''
  Usage: $0
  Optional flags:
    --print-usage
    -q, --quiet
    -h, --help
  '''
  return optimist.showHelp() if argv.help? or argv.h?

  op_stats = setup_opcode_stats()
  run_all_tests(argv.q? or argv.quiet?)

  if argv['print-usage']?
    print_usage op_stats
  else
    print_unused op_stats, 'opcodes'
