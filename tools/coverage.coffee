#!/usr/bin/env coffee

fs = require 'fs'
path = require 'path'
optimist = require 'optimist'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'
runner = require '../console/runner'
opcodes = require '../src/opcodes'

{argv} = optimist

print_usage = argv['print-usage']

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
  console.log "running #{c.this_class.toClassString()}..." unless print_usage
  jvm.run_class(rs, c, [])

if not print_usage
  unused_count = 0
  for _, op of opcodes.opcodes when op_stats[op.name] is 0
    unused_count++
    console.log op.name
  if unused_count > 0
    console.log "#{unused_count} instructions have yet to be tested."
else
  op_array = (op for _, op of opcodes.opcodes)
  op_array.sort (a, b) -> op_stats[b.name] - op_stats[a.name]
  console.log op_stats[op.name], op.name for op in op_array
