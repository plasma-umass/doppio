#!/usr/bin/env coffee

fs = require 'fs'
{spawn} = require 'child_process'
optimist = require 'optimist'
{argv} = optimist
util = require '../src/util'
ClassFile = require '../src/ClassFile'
compiler = require '../src/compiler'

optimist.usage '''
  Usage: $0 /path/to/Source.java
    --force
  '''
fname = argv._[0]
return optimist.showHelp() if argv.help or not fname

cname = (fname.split '.')[0...-1].join '.'

compile_js = ->
  bytes_array = util.bytestr_to_array fs.readFileSync("#{cname}.class", 'binary')
  class_data = new ClassFile bytes_array
  fs.writeFileSync "#{cname}.js", compiler.compile class_data

modified_time = (fs.statSync fname).mtime
if argv.force or not fs.existsSync("#{cname}.class") or
   modified_time > (fs.statSync "#{cname}.class").mtime
  javac = spawn 'javac', [fname]
  javac.stdout.on 'data', (data) -> console.log data
  javac.stderr.on 'data', (data) -> console.error data
  javac.on 'exit', (code) ->
    return unless code is 0
    compile_js()
else
  compile_js()
