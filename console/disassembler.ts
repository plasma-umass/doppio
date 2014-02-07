import disassembler = require('../src/disassembler');

// Cut off [node disassembler.js]
disassembler.javap(process.argv.slice(2), function(result: boolean): void {
  process.exit(result ? 0 : 1);
});
