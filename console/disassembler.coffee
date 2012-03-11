#!/usr/bin/env coffee
fs = require 'fs'
util = require '../src/util'
{disassemble} = require '../src/disassembler'
ClassFile = require '../src/class_file'

# first two are 'coffee', 'scriptname.coffee'
fname = if process.argv.length > 2 then process.argv[2] else '/dev/stdin'
bytes_array = util.bytestr_to_array fs.readFileSync(fname, 'binary')
class_data = new ClassFile bytes_array

console.log disassemble class_data
