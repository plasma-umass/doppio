"use strict";
var fs = require('fs');
var path = require('path');
import testing = require('../src/testing');
import os = require('os');

var opts = { jcl_path: path.resolve(__dirname, '../vendor/classes'),
             java_home_path: path.resolve(__dirname, '../vendor/java_home'),
             jar_file_path: path.resolve(os.tmpDir(), 'doppio_jars'),
             native_classpath: [path.resolve(__dirname, '../src/natives')]},
    doppio_dir = path.dirname(__dirname);

function makefile_test(argv): void {
  var failpath = path.resolve(__dirname, '../classes/test/failures.txt'),
      old_write = process.stdout.write;
  function done_cb(failed: boolean): void {
    // Patch stdout back up.
    process.stdout.write = old_write;
    process.stdout.write(failed ? '✗' : '✓');
    if (failed) {
      fs.writeSync(outfile, '\n');
    }
    fs.closeSync(outfile);
  };
  var outfile = fs.openSync(failpath, 'a');
  function stdout(str: any, arg2?: any, arg3?: any): boolean { fs.writeSync(outfile, str); return true; };
  process.stdout.write = stdout;
  testing.run_tests(opts, doppio_dir, argv._, false, true, argv.c, done_cb);
}

function regular_test(argv): void {
  testing.run_tests(opts, doppio_dir, argv._, !argv.diff, argv.q, argv.c, function(result: boolean): void {
    process.exit(result ? 0 : 1);
  });
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
    // --makefile is only used from the makefile
    h: 'Show this usage'
  }).usage('Usage: $0 path/to/test [flags]');

var argv = optimist.argv;
if (argv.help) {
  optimist.showHelp();
  process.exit(0);
}
if (argv.makefile) {
  makefile_test(argv);
} else {
  regular_test(argv);
}
