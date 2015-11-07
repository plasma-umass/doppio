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
  bootstrapClasspath: [path.resolve(__dirname, path.join('..', 'vendor', 'java_home', 'classes'))],
  javaHomePath: path.resolve(__dirname, path.join('..', 'vendor', 'java_home')),
  extractionPath: path.resolve(os.tmpdir(), 'doppio_jars'),
  classpath: null,
  nativeClasspath: [path.resolve(__dirname, path.join('..', 'src', 'natives'))],
  doppioDir: path.dirname(__dirname),
  assertionsEnabled: true,
  tmpDir: os.tmpdir()
}, passChar: string, failChar: string;

if (process.platform.match(/win32/i)) {
  // Windows command prompt doesn't support Unicode characters.
  passChar = "√";
  failChar = "X";
} else {
  passChar = '✓';
  failChar = '✗';
}

/**
 * Makefile tests are only relevant to the native runner.
 */
function makefileTest(argv: any): void {
  var failpath = path.resolve(__dirname, '../classes/test/failures.txt'),
      keepGoing = argv.c;

  opts.testClasses = argv._;

  // Enter a domain so we are robust to uncaught errors.
  var errCallback: (err: any) => void = null;
  function finish(err?: testing.TestingError) {
    // Print out the status of this test.
    process.stdout.write(err ? failChar : passChar);
    if (err) {
      var buff = new Buffer(`\n${err.message}\n`);
      fs.appendFileSync(failpath, buff, {
        flag: 'a'
      });
    }
    // Error code in the event of a failed test.
    process.exit(err ? 1 : 0);
  }

  // This handler should not run when the test exits normally (process.exit() in finish handler circumvents it).
  process.on('beforeExit', () => {
    if (errCallback) {
      errCallback(new Error('Finish callback never triggered.'));
    }
  });

  process.on('uncaughtException', (err: any) => {
    if (errCallback) {
      errCallback(err);
    }
  });

  testing.runTests(opts, true, keepGoing, false, (cb: (err: Error) => void) => {
    errCallback = cb;
  }, finish);
}

function regularTest(argv: any): void {
  var hideDiffs = !argv.diff,
    quiet = argv.q,
    keepGoing = argv.c,
    errCallback: (err: any) => void = null;

  opts.testClasses = argv._;

  var stdoutW = process.stdout.write,
    stderrW = process.stderr.write;

  process.on('uncaughtException', (err: any) => {
    if (errCallback) {
      errCallback(err);
    }
  });

  // This handler should not run when the test exits normally (process.exit() in finish handler circumvents it).
  process.on('beforeExit', () => {
    if (errCallback) {
      errCallback(new Error('Finish callback never triggered.'));
    }
  });

  testing.runTests(opts, quiet, keepGoing, hideDiffs, (cb: (err: Error) => void) => {
    errCallback = cb;
  }, (err?: testing.TestingError) => {
    process.exit(err ? 1 : 0);
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
