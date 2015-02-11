"use strict";
import testing = require('../src/testing');
import os = require('os');
import fs = require('fs');
import path = require('path');
import domain = require('domain');

// Makes our stack traces point to the TypeScript source code lines.
require('source-map-support').install({
  handleUncaughtExceptions: true
});

// Default options.
var opts: testing.TestOptions = {
  bootstrapClasspath: [path.resolve(__dirname, path.join('..', 'vendor', 'java_home', 'classes'))],
  javaHomePath: path.resolve(__dirname, path.join('..', 'vendor', 'java_home')),
  extractionPath: path.resolve(os.tmpdir(), 'doppio_jars'),
  classpath: null,
  nativeClasspath: [path.resolve(__dirname, path.join('..', 'src', 'natives'))],
  doppioDir: path.dirname(__dirname),
  hideDiffs: false,
  quiet: false,
  keepGoing: false,
  assertionsEnabled: false
}, passChar: string, failChar: string;

if (process.platform.match(/win32/i)) {
  // Windows command prompt doesn't support Unicode characters.
  passChar = "√";
  failChar = "X";
} else {
  passChar = '✓';
  failChar = '✗';
}

function makefileTest(argv: any): void {
  var failpath = path.resolve(__dirname, '../classes/test/failures.txt'),
      old_write = process.stdout.write,
      outfile = fs.openSync(failpath, 'a');

  function newWrite(str: any, arg2?: any, arg3?: any): boolean {
    var buff = new Buffer(str);
    fs.writeSync(outfile, buff, 0, buff.length, null);
    return true;
  }

  process.stdout.write = newWrite;
  process.stderr.write = newWrite;

  opts.testClasses = argv._;
  opts.quiet = true;
  opts.keepGoing = argv.c;

  // Enter a domain so we are robust to uncaught errors.
  var d = domain.create();

  function finish(success: boolean) {
    // Patch stdout back up.
    process.stdout.write = old_write;
    process.stdout.write(success ? passChar : failChar);
    if (!success) {
      fs.writeSync(outfile, new Buffer('\n'), 0, 1, null);
    }
    fs.closeSync(outfile);
    // Error code in the event of a failed test.
    process.exit(success ? 0 : 1);
  }

  d.on('error', (err: any) => {
    // Make sure we write to the file. The test runner patches stdout.write, too.
    // XXX: Assuming a single test class.
    newWrite("Test " + opts.testClasses[0] + " failed.\n");
    newWrite("Uncaught error:\n" + err + "\n" + (err['stack'] != null ? err.stack : "") + "\n");
    finish(false);
  });

  d.run(() => {
    testing.runTests(opts, finish);
  });
}

function regularTest(argv: any): void {
  opts.testClasses = argv._;
  opts.hideDiffs = !argv.diff;
  opts.quiet = argv.q;
  opts.keepGoing = argv.c;

  var stdoutW = process.stdout.write,
    stderrW = process.stderr.write,
    // Enter a domain so we are robust to uncaught errors.
    d = domain.create();

  d.on('error', (err: any) => {
    process.stdout.write = stdoutW;
    process.stderr.write = stderrW;
    console.log("failed.\nUncaught error:\n" + err + "\n" + (err['stack'] != null ? err.stack : ""));
    process.exit(1);
  });

  d.run(() => {
    testing.runTests(opts, (result: boolean): void => {
      process.exit(result ? 0 : 1);
    });
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
