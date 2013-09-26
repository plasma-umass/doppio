"use strict";
var fs = require('fs');
var optimist = require('optimist');
import util = require('../src/util');
import disassembler = require('../src/disassembler');

var fname;
if (optimist.argv._.length > 0) {
  fname = optimist.argv._[0];
  if (fname.indexOf(".class") === -1) {
    if (fname.indexOf('.') !== -1) {
      // Convert foo.bar.Baz => foo/bar/Baz
      fname = util.descriptor2typestr(util.int_classname(fname));
    }
    fname += ".class";
  }
} else {
  fname = '/dev/stdin';
}

var buffer = fs.readFileSync(fname);

console.log(disassembler.disassemble(buffer));
