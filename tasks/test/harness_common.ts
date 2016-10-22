/**
 * Contains the test logic, used in WW and main thread tests.
 */
import * as BrowserFS from 'browserfs';
import * as fs from 'fs';
import * as path from 'path';
// Force initialization of standard output.
(<any> process).initializeTTYs();
import * as DoppioJVM from '../../src/doppiojvm';
import TestOptions = DoppioJVM.Testing.TestOptions;
import DoppioTest = DoppioJVM.Testing.DoppioTest;
import * as logging from '../../src/logging';
const vtrace = logging.vtrace;

export function getBuild(): string {
  if (DoppioJVM.VM.JVM.isReleaseBuild()) {
    return 'release';
  } else {
    let build = 'fast-dev';
    vtrace((build = 'dev'));
    return build;
  }
}

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
  return '/build/test-' + getBuild() + '/';
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
    enableAssertions: true,
    intMode: false,
    dumpJITStats: false
  }, cb);
}

export function runTest(test: DoppioTest, cb: (err: Error, actual: string, expected: string) => void): void {
  test.run(registerGlobalErrorTrap, cb);
}
