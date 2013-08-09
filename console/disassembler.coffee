#!/usr/bin/env coffee

"use strict"

fs = require 'fs'
util = require '../src/util'
{disassemble} = require '../src/disassembler'
{ReferenceClassData} = require '../src/ClassData'
{argv} = require('optimist')

if argv._.length > 0
  fname = argv._[0]
  fname += ".class" if fname.indexOf(".class") == -1
else
  fname = '/dev/stdin'
buffer = fs.readFileSync fname
class_data = new ReferenceClassData buffer

console.log disassemble class_data
