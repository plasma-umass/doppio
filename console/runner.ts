"use strict";
import java_cli = require('../src/java_cli');
import JVM = require('../src/jvm');
import path = require('path');
import os = require('os');
import fs = require('fs');
// Makes our stack traces point to the TypeScript source code lines.
require('source-map-support').install({
  handleUncaughtExceptions: true
});

function done_cb(status: number): void {
  process.exit(status);
}

var jvm_state: JVM;

process.on('SIGINT', function () {
  console.error('Doppio caught SIGINT');
  process.exit(0);
});

process.on('uncaughtException', (er: any) => {
  console.log(`Encountered error: ${er}\n${er.stack}`);
  fs.appendFileSync('doppio.err', `\n--------------------------------------\n${er}\n${er.stack}\n`);
  if (jvm_state) {
    // Dump JVM stack state.
    jvm_state.dumpState('doppio.err', (er) => {
      if (!er) {
        console.log("Thread state dumped to doppio.err.")
      } else {
        console.log(`Error writing doppio.err: ${er}\n${er.stack}`);
      }
    });
  } else {
    console.log("JVM state undefined; unable to print debug information.");
  }
  process.exit(1);
});

// Run the JVM. Remove node runner.js from the args.
java_cli(process.argv.slice(2), {
  bootstrapClasspath: ['resources.jar', 'rt.jar', 'jsse.jar', 'jce.jar', 'charsets.jar', 'jfr.jar', 'tools.jar', 'jazzlib.jar'].map((item: string) => path.resolve(__dirname, '../vendor/java_home/lib/', item)),
  javaHomePath: path.resolve(__dirname, '../vendor/java_home'),
  classpath: null,
  nativeClasspath: [path.resolve(__dirname, '../src/natives')],
  launcherName: process.argv[0] + " " + path.relative(process.cwd(), process.argv[1]),
  assertionsEnabled: false,
  tmpDir: os.tmpdir()
}, done_cb, function(jvm: JVM): void {
  jvm_state = jvm;
});
