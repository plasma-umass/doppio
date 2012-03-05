fs = require 'fs'
jvm = require '../src/jvm'
util = require '../src/util'
ClassFile = require '../src/class_file'

read_binary_file = (filename) ->
  util.bytestr_to_array fs.readFileSync(filename, 'binary')

read_classfile = (cls) -> read_binary_file "third_party/#{cls}.class"

class_data = new ClassFile read_binary_file '/dev/stdin'

jvm.run class_data, console.log, read_classfile, []
