fs = require 'fs'
util = require '../src/util'
disassemble = require '../src/disassembler'
ClassFile = require '../src/class_file'

bytes_array = util.bytestr_to_array fs.readFileSync('/dev/stdin', 'binary')
class_data = new ClassFile bytes_array

console.log disassemble class_data
