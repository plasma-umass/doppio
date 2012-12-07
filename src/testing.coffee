#!/usr/bin/env coffee

jvm = require './jvm'
{RuntimeState} = require './runtime'
util = require './util'
{disassemble} = require './disassembler'
ClassFile = require './ClassFile'
fs = node?.fs ? require 'fs'
path = node?.path ? require 'path'

"use strict"

root = exports ? window.testing ?= {}

root.find_test_classes = (doppio_dir) ->
  test_dir = path.resolve doppio_dir, 'classes/test'
  for file in fs.readdirSync(test_dir) when path.extname(file) == '.java'
    "classes/test/#{path.basename(file, '.java')}"
  # Note that the lack of return value here implies that the above is actually
  # a list comprehension. This is intended behavior.

root.run_tests = (test_classes, stdout, quiet, keep_going, callback) ->
  batch_mode = test_classes.length > 1
  doppio_dir = if node? then '/home/doppio/' else path.resolve __dirname, '..'
  # get the tests, if necessary
  if test_classes?.length > 0
    test_classes = (tc.replace(/\.class$/,'') for tc in test_classes)
  else
    test_classes = root.find_test_classes doppio_dir
  # set up the classpath
  jcl_dir = path.resolve doppio_dir, 'vendor/classes'
  jvm.classpath = [doppio_dir, jcl_dir]

  _runner = () ->
    if test_classes.length == 0
      if batch_mode
        quiet || stdout "All tests passed!\n"
      else
        quiet || stdout "Pass\n"
      return callback(false)
    test = test_classes.shift()
    quiet || stdout "testing #{test}...\n"
    if (disasm_diff = run_disasm_test(doppio_dir, test))?
      stdout "Failed disasm test #{test}:\n#{disasm_diff}\n"
      return callback(true) unless keep_going
    run_stdout_test doppio_dir, test, (diff) ->
      if diff?
        stdout "Failed output test #{test}:\n#{diff}\n"
        return callback(true) unless keep_going
      _runner()

  _runner()

# remove comments and blank lines, ignore specifics of float/double printing and whitespace
sanitize = (str) ->
  str.replace(/\/\/.*/g, '')
     .replace(/^\s*$[\n\r]+/mg, '')
     .replace(/(float|double)\t.*/g, '$1')
     .replace(/[ \t\r]+/g, ' ')
     .replace(/[ ]\n/g, '\n')
     .replace(/\[ \]/g, '[]')

run_disasm_test = (doppio_dir, test_class) ->
  test_path = path.resolve(doppio_dir, test_class)
  javap_disasm = sanitize(fs.readFileSync "#{test_path}.disasm", 'utf8')
  bytes_array = util.bytestr_to_array fs.readFileSync "#{test_path}.class", 'binary'
  doppio_disasm = sanitize disassemble new ClassFile bytes_array
  return cleandiff doppio_disasm, javap_disasm

run_stdout_test = (doppio_dir, test_class, callback) ->
  java_output = fs.readFileSync "#{path.resolve doppio_dir, test_class}.runout", 'utf8'
  doppio_output = ''
  stdout = (str) -> doppio_output += str
  rs = new RuntimeState stdout, (->), jvm.read_classfile
  jvm.run_class rs, test_class, [], ->
    callback cleandiff(doppio_output, java_output)

cleandiff = (our_str, their_str) ->
  our_lines = our_str.split /\n/
  their_lines = their_str.split /\n/
  [oidx,tidx] = [0,0]
  diff = []
  while oidx < our_lines.length and tidx < their_lines.length
    continue if our_lines[oidx++] == their_lines[tidx++]
    diff.push "D:#{our_lines[oidx-1]}\nJ:#{their_lines[tidx-1]}"
  for extra in our_lines[oidx..]
    diff.push "D:#{extra}"
  for extra in their_lines[tidx..]
    diff.push "J:#{extra}"
  return diff.join '\n' if diff.length > 0
