#!/usr/bin/env coffee

fs = require 'fs'
path = require 'path'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'
runner = require '../console/runner'
opcodes = require '../src/opcodes'

print_usage = false  #TODO: make this a flag with optimist

# monkeypatch opcode parsing
op_stats = {}

for num, op of opcodes.opcodes
  op_stats[op.name] = 0
  old_fn = op.execute
  op.execute = do (old_fn) ->
    (rs) ->
      op_stats[@name]++
      old_fn.call @, rs

util.log_level = 0
test_dir = "#{__dirname}/../test"
files = fs.readdirSync test_dir

# load in all the test class files
cs = (new ClassFile runner.read_binary_file "#{test_dir}/#{path.basename file, '.java'}.class" \
        for file in files when path.extname(file) == '.java')
# make the runtime state
rs = new runtime.RuntimeState((->), (->), runner.read_classfile)
# run each class, reusing the same heap and string pool and class info
for c in cs
  console.log "running #{c.this_class}..." unless print_usage
  jvm.run_class(rs, c, [])

unused_count = 0
for _, op of opcodes.opcodes
  if not print_usage and op_stats[op.name] is 0
    unused_count++
    console.log op.name
  if print_usage
    console.log op_stats[op.name],op.name

if not print_usage and unused_count > 0
  console.log "#{unused_count} instructions have yet to be tested."
