"use strict";
import testing = require('../src/testing');
import os = require('os');
import fs = require('fs');
import path = require('path');

// Makes our stack traces point to the TypeScript source code lines.
require('source-map-support').install({
  handleUncaughtExceptions: true
});

// Default options.
var opts: testing.TestOptions = {
  bootstrapClasspath: [path.resolve(__dirname, path.join('..', 'vendor', 'classes'))],
  javaHomePath: path.resolve(__dirname, path.join('..', 'vendor', 'java_home')),
  extractionPath: path.resolve(os.tmpDir(), 'doppio_jars'),
  classpath: null,
  nativeClasspath: [path.resolve(__dirname, path.join('..', 'src', 'natives'))],
  doppioDir: path.dirname(__dirname),
  hideDiffs: false,
  quiet: false,
  keepGoing: false
};

function makefileTest(argv): void {
  var failpath = path.resolve(__dirname, '../classes/test/failures.txt'),
      old_write = process.stdout.write,
      outfile = fs.openSync(failpath, 'a');

  process.stdout.write = (str: any, arg2?: any, arg3?: any): boolean => {
    var buff = new Buffer(str);
    fs.writeSync(outfile, buff, 0, buff.length, null);
    return true;
  };

  opts.testClasses = argv._;
  opts.quiet = true;
  opts.keepGoing = argv.c;

  testing.runTests(opts, (success: boolean): void => {
    // Patch stdout back up.
    process.stdout.write = old_write;
    process.stdout.write(success ? '✓' : '✗');
    if (!success) {
      fs.writeSync(outfile, new Buffer('\n'), 0, 1, null);
    }
    fs.closeSync(outfile);
  });
}

function regularTest(argv): void {
  opts.testClasses = argv._;
  opts.hideDiffs = !argv.diff;
  opts.quiet = argv.q;
  opts.keepGoing = argv.c;
  testing.runTests(opts, (result: boolean): void => {
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
  makefileTest(argv);
} else {
  regularTest(argv);
}
