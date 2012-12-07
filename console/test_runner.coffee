#!/usr/bin/env coffee
{print} = require 'util'
{run_tests} = require '../src/testing'

"use strict"

if module? and require?.main == module
  optimist = require('optimist')
    .boolean(['q','h','c'])
    .alias({h: 'help', q: 'quiet', c: 'continue'})
    .describe({
      q: 'Suppress in-progress test output',
      c: 'Keep going after test failure',
      h: 'Show this usage'})
    .usage 'Usage: $0 path/to/test [flags]'
  argv = optimist.argv
  return optimist.showHelp() if argv.help

  done_cb = (failed) -> process.exit failed
  run_tests argv._, print, argv.q, argv.c, done_cb