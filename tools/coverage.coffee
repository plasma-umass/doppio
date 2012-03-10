#!/usr/bin/env coffee

fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'
runner = require '../console/runner'
opcodes = require '../src/opcodes'

# monkeypatch opcode parsing

used_set = {}

for num, op of opcodes.opcodes
  op.execute = ((old_fn) ->
    (rs) ->
      used_set[@name] = true
      old_fn.call @, rs
  )(op.execute)

util.log_level = 0
test_dir = "#{__dirname}/../test"
files = fs.readdirSync test_dir

for file in files when path.extname(file) == '.java'
  classfile = "#{path.basename file, '.java'}.class"
  console.log "Running #{classfile}..."
  class_data = new ClassFile runner.read_binary_file "#{test_dir}/#{classfile}"
  jvm.run class_data, (->), runner.read_classfile, []

unused_count = 0
for i in [0..201] when i of opcodes.opcodes
  op = opcodes.opcodes[i]
  if op.name not of used_set
    unused_count++
    console.log op.name

console.log "#{unused_count} instructions have yet to be tested."
