"use strict";
var print = require('util').print;
var fs = require('fs');
var path = require('path');
import testing = module('../src/testing');

function makefile_test(argv): void {
  var failpath = path.resolve(__dirname, '../classes/test/failures.txt');
  function done_cb(failed: boolean): void {
    print((failed ? '✗' : '✓'));
    if (failed) {
      fs.writeSync(outfile, '\n');
    }
    fs.closeSync(outfile);
  };
  var outfile = fs.openSync(failpath, 'a');
  function stdout(str) { fs.writeSync(outfile, str); };
  testing.run_tests(argv._, stdout, false, true, argv.c, done_cb);
}

function regular_test(argv): void {
  testing.run_tests(argv._, print, !argv.diff, argv.q, argv.c, process.exit);
}

var optimist = require('optimist')
  .boolean(['q', 'h', 'c', 'makefile', 'diff'])
  .default({ diff: true })
  .alias({
    h: 'help',
    q: 'quiet',
    c: 'continue'
  }).describe({
    q: 'Suppress in-progress test output',
    diff: 'Show failed test diff output',
    c: 'Keep going after test failure',
    h: 'Show this usage'
  }).usage('Usage: $0 path/to/test [flags]');

var argv = optimist.argv;
if (argv.help) {
  return optimist.showHelp();
}
if (argv.makefile) {
  makefile_test(argv);
} else {
  regular_test(argv);
}
