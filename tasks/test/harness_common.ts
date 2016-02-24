/// <reference path="../../typings/main.d.ts" />
/**
 * Contains the test logic, used in WW and main thread tests.
 */
import BrowserFS = require('browserfs');
import fs = require('fs');
import path = require('path');
// Force initialization of standard output.
(<any> process).initializeTTYs();
import DoppioJVM = require('../../src/doppiojvm');
import TestOptions = DoppioJVM.Testing.TestOptions;
import DoppioTest = DoppioJVM.Testing.DoppioTest;
let isRelease = DoppioJVM.VM.JVM.isReleaseBuild();

var globalErrorTrap: (err: Error) => void = null
onerror = function(err) {
  if (globalErrorTrap) {
    globalErrorTrap(new Error(err));
  }
};

function registerGlobalErrorTrap(cb: (err: Error) => void): void {
  globalErrorTrap = cb;
}

function getBuildPath(): string {
  return '/build/' + (isRelease ? 'release' : 'dev') + '/';
}

/**
 * Set up BrowserFS.
 */
function configureFS(): void {
  var xhr = new BrowserFS.FileSystem.XmlHttpRequest('listings.json', getBuildPath()),
    mfs = new BrowserFS.FileSystem.MountableFileSystem();
  mfs.mount('/sys', xhr);
  mfs.mkdirSync('/tmp', 0x1ff);
  BrowserFS.initialize(mfs);
}

/**
 * Configure and retrieve the unit tests.
 */
export function getTests(cb: (tests: DoppioTest[]) => void) {
  configureFS();
  // Tests expect to be run from the system path.
  process.chdir('/sys');
  DoppioJVM.Testing.getTests({
    doppioHomePath: '/sys',
    testClasses: null,
    enableSystemAssertions: true,
    enableAssertions: true
  }, cb);
}

export function runTest(test: DoppioTest, cb: (err: Error, actual: string, expected: string) => void): void {
  test.run(registerGlobalErrorTrap, cb);
}
