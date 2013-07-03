
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

var bytes_array = util.bytestr_to_array(fs.readFileSync(fname, 'binary'));
var class_data = new ClassData.ReferenceClassData(bytes_array);

console.log(disassembler.disassemble(class_data));
