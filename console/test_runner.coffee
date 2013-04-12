#!/usr/bin/env coffee

"use strict"

{print} = require 'util'
{run_tests} = require '../src/testing'

makefile_test = (argv) ->
  path = require 'path'
  fs = require 'fs'
  failpath = path.resolve __dirname, '../classes/test/failures.txt'
  done_cb = (failed) ->
    print (if failed then '✗' else '✓')
    fs.writeSync(outfile, '\n') if failed
    fs.closeSync(outfile)
  outfile = fs.openSync failpath, 'a'
  stdout = (str) -> fs.writeSync(outfile, str)
  run_tests argv._, stdout, false, true, argv.c, done_cb

regular_test = (argv) ->
  done_cb = (failed) -> process.exit failed
  run_tests argv._, print, not argv.diff, argv.q, argv.c, done_cb

if module? and require?.main == module
  optimist = require('optimist')
    .boolean(['q','h','c','makefile','diff'])
    .default({diff: true})
    .alias({h: 'help', q: 'quiet', c: 'continue'})
    .describe({
      q: 'Suppress in-progress test output',
      diff: 'Show failed test diff output',
      c: 'Keep going after test failure',
      # --makefile is only used from the makefile
      h: 'Show this usage'})
    .usage 'Usage: $0 path/to/test [flags]'
  argv = optimist.argv
  return optimist.showHelp() if argv.help

  if argv.makefile then makefile_test(argv) else regular_test(argv)
