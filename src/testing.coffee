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

root.find_test_classes = (doppio_dir) ->
  test_dir = path.resolve doppio_dir, 'classes/test'
  for file in fs.readdirSync(test_dir) when path.extname(file) == '.java'
    "classes/test/#{path.basename(file, '.java')}"
  # Note that the lack of return value here implies that the above is actually
  # a list comprehension. This is intended behavior.

root.run_tests = (test_classes, stdout, hide_diffs, quiet, keep_going, callback) ->
  doppio_dir = if node? then '/home/doppio/' else path.resolve __dirname, '..'
  # get the tests, if necessary
  if test_classes?.length > 0
    test_classes = (tc.replace(/\.class$/,'') for tc in test_classes)
  else
    test_classes = root.find_test_classes doppio_dir
  # set up the classpath
  jcl_dir = path.resolve doppio_dir, 'vendor/classes'
  jvm.set_classpath jcl_dir, doppio_dir

  xfails =
    for failname in (fs.readFileSync 'classes/test/xfail.txt', 'utf-8').split '\n'
      "classes/test/#{failname}"

  _runner = () ->
    if test_classes.length == 0
      quiet || keep_going || stdout "Pass\n"
      return callback(false)
    test = test_classes.shift()
    quiet || stdout "testing #{test}...\n"
    if (disasm_diff = run_disasm_test(doppio_dir, test))?
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
  doppio_disasm = sanitize disassemble new ReferenceClassData bytes_array
  return cleandiff doppio_disasm, javap_disasm

run_stdout_test = (doppio_dir, test_class, callback) ->
  java_output = fs.readFileSync "#{path.resolve doppio_dir, test_class}.runout", 'utf8'
  doppio_output = ''
  stdout = (str) -> doppio_output += str
  rs = new RuntimeState stdout, (->), new BootstrapClassLoader(jvm.read_classfile)
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
