fs = require 'fs'
disassemble = require '../src/disassembler'
ClassFile = require '../src/class_file'

bytecode_string = fs.readFileSync '/dev/stdin', 'binary'
bytes_array = (bytecode_string.charCodeAt(i) for i in [0...bytecode_string.length])
class_data = new ClassFile bytes_array

console.log disassemble class_data
