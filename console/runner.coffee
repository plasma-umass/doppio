fs = require 'fs'
jvm = require '../src/jvm'
ClassFile = require '../src/class_file'

read_binary_file = (filename) ->
  bytecode_string = fs.readFileSync filename, 'binary'
  (bytecode_string.charCodeAt(i) for i in [0...bytecode_string.length])

read_classfile = (cls) -> read_binary_file "third_party/#{cls}.class"

class_data = new ClassFile read_binary_file '/dev/stdin'

jvm.run class_data, console.log, read_classfile, []
