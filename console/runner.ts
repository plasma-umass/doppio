/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
"use strict";
import java_cli = require('../src/java_cli');
import JVM = require('../src/jvm');
import path = require('path');
import os = require('os');
// Makes our stack traces point to the TypeScript source code lines.
require('source-map-support').install({
  handleUncaughtExceptions: true
});

function done_cb(success:boolean): void { process.exit(success ? 0 : 1); }

var jvm_state: JVM;

process.on('SIGINT', function () {
  console.error('Doppio caught SIGINT');
  process.exit(0);
});

// Run the JVM. Remove node runner.js from the args.
java_cli.java(process.argv.slice(2), {
  bootstrapClasspath: [path.resolve(__dirname, '../vendor/classes')],
  javaHomePath: path.resolve(__dirname, '../vendor/java_home'),
  extractionPath: path.resolve(os.tmpDir(), 'doppio_jars'),
  classpath: null,
  nativeClasspath: [path.resolve(__dirname, '../src/natives')],
  launcherName: process.argv[0] + " " + path.relative(process.cwd(), process.argv[1])
}, done_cb, function(jvm: JVM): void {
  jvm_state = jvm;
});
