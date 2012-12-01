#!/usr/bin/env coffee
fs = require 'fs'
util = require '../src/util'
{disassemble} = require '../src/disassembler'
ClassFile = require '../src/ClassFile'
{argv} = require('optimist')

"use strict"

if argv._.length > 0
  fname = argv._[0]
  fname += ".class" if fname.indexOf(".class") == -1
else
  fname = '/dev/stdin'
bytes_array = util.bytestr_to_array fs.readFileSync(fname, 'binary')
class_data = new ClassFile bytes_array

console.log disassemble class_data
