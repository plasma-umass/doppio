#!/usr/bin/env coffee

"use strict"

jvm = require './jvm'
{RuntimeState} = require './runtime'
util = require './util'
{disassemble} = require './disassembler'
{ReferenceClassData} = require './ClassData'
fs = node?.fs ? require 'fs'
path = node?.path ? require 'path'
{BootstrapClassLoader} = require './ClassLoader'

root = exports ? window.testing ?= {}

root.find_test_classes = (doppio_dir, cb) ->
  test_dir = path.resolve doppio_dir, 'classes/test'
  fs.readdir test_dir, (err, files) ->
    cb("classes/test/#{path.basename(file, '.java')}" for file in files when path.extname(file) == '.java')

root.run_tests = (test_classes, stdout, hide_diffs, quiet, keep_going, callback) ->
  doppio_dir = if node? then '/sys/' else path.resolve __dirname, '..'
  # set up the classpath
  jcl_dir = path.resolve doppio_dir, 'vendor/classes'
  jvm.set_classpath jcl_dir, doppio_dir

  xfail_file = path.resolve doppio_dir, 'classes/test/xfail.txt'
  fs.readFile xfail_file, 'utf-8', (err, contents) ->
    xfails = ("classes/test/#{failname}" for failname in contents.split '\n')
    # get the tests, if necessary
    if test_classes?.length > 0
      _runner((tc.replace(/\.class$/,'') for tc in test_classes), xfails)
    else
      root.find_test_classes doppio_dir, (tc) -> _runner(tc, xfails)

  _runner = (test_classes, xfails) ->
    if test_classes.length == 0
      quiet || keep_going || stdout "Pass\n"
      return callback(false)
    test = test_classes.shift()
    quiet || stdout "testing #{test}...\n"
    run_disasm_test doppio_dir, test, (disasm_diff) ->
      if disasm_diff?
        stdout "Failed disasm test #{test}\n"
        hide_diffs || stdout "#{disasm_diff}\n"
        return callback(true) unless keep_going
      run_stdout_test doppio_dir, test, (diff) ->
        if diff? ^ (test in xfails)
          if diff?
            stdout "Failed output test: #{test}\n"
            hide_diffs || stdout "#{diff}\n"
          else
            stdout "Expected failure passed: #{test}\n"
          return callback(true) unless keep_going
        _runner(test_classes, xfails)

# remove comments and blank lines, ignore specifics of float/double printing and whitespace
sanitize = (str) ->
  str.replace(/\/\/.*/g, '')
     .replace(/^\s*$[\n\r]+/mg, '')
     .replace(/(float|double)\t.*/g, '$1')
     .replace(/[ \t\r]+/g, ' ')
     .replace(/[ ]\n/g, '\n')
     .replace(/\[ \]/g, '[]')

run_disasm_test = (doppio_dir, test_class, callback) ->
  test_path = path.resolve(doppio_dir, test_class)
  fs.readFile "#{test_path}.disasm", 'utf8', (err, contents) ->
    javap_disasm = sanitize contents
    fs.readFile "#{test_path}.class", (err, buffer) ->
      doppio_disasm = sanitize disassemble new ReferenceClassData buffer
      callback cleandiff(doppio_disasm, javap_disasm)

run_stdout_test = (doppio_dir, test_class, callback) ->
  doppio_output = ''
  stdout = (str) -> doppio_output += str
  rs = new RuntimeState stdout, (->), new BootstrapClassLoader(jvm.read_classfile)
  fs.readFile "#{path.resolve doppio_dir, test_class}.runout", 'utf8', (err, java_output) ->
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

# unused for now
cleandiff_fancy = (our_str, their_str) ->
  our_lines = our_str.split /\n/
  their_lines = their_str.split /\n/
  if our_lines.length == 0
    return ("J:#{line}" for line in their_lines).join '\n'
  if their_lines.length == 0
    return ("D:#{line}" for line in our_lines).join '\n'
  # using something like Levenshtein distance to get the minimal diff
  dist = []
  cfrm = []  # comefrom path matrix: 1 = Up, 2 = Left, 3 = Diag, 4 = Diag-match
  for i in [0..their_lines.length] by 1
    dist.push (0 for j in [0..our_lines.length] by 1)
    cfrm.push (0 for j in [0..our_lines.length] by 1)
    dist[i][0] = i
    cfrm[i][0] = 1
  for j in [0..our_lines.length] by 1
    dist[0][j] = j
    cfrm[0][j] = 2
  # compute least-cost path
  for i in [1..their_lines.length] by 1
    for j in [1..our_lines.length] by 1
      if our_lines[j-1] == their_lines[i-1]
        dist[i][j] = dist[i-1][j-1]
        cfrm[i][j] = 4  # diag-match
      else
        dd = [dist[i-1][j], dist[i][j-1], dist[i-1][j-1]]
        d = Math.min dd...
        dist[i][j] = d + 1
        cfrm[i][j] = dd.indexOf(d) + 1
  i = their_lines.length
  j = our_lines.length
  # they match if the final cost is still zero
  return if dist[i][j] == 0
  diff = []
  until i == 0 and j == 0
    switch cfrm[i][j]
      when 1  # up
        diff.unshift "doppio{#{j}}:#{our_lines[j]}\njava  {#{i}}:#{their_lines[i--]}"
      when 2  # left
        diff.unshift "doppio{#{j}}:#{our_lines[j--]}\njava  {#{i}}:#{their_lines[i]}"
      when 3  # diag mismatch
        diff.unshift "doppio{#{j}}:#{our_lines[j--]}\njava  {#{i}}:#{their_lines[i--]}"
      when 4  # diag match
        i--
        j--
  return diff.join '\n'
