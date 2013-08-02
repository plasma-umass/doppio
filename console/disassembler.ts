"use strict";
var fs = require('fs');
var optimist = require('optimist');
import util = module('../src/util');
import disassembler = module('../src/disassembler');
import ClassData = module('../src/ClassData');

var fname;
if (optimist.argv._.length > 0) {
  fname = optimist.argv._[0];
  if (fname.indexOf(".class") === -1) {
    fname += ".class";
  }
} else {
  fname = '/dev/stdin';
}

var buffer = fs.readFileSync(fname);
var class_data = new ClassData.ReferenceClassData(buffer);

console.log(disassembler.disassemble(class_data));
