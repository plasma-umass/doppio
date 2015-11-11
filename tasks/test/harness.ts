/// <reference path="../../typings/tsd.d.ts" />
/**
 * Main entry point for Doppio unit tests in the browser.
 * Sets up the test environment, and launches everything.
 */
declare var __karma__: any;
declare var __numWaiting: number;
import BrowserFS = require('browserfs');
import fs = require('fs');
import path = require('path');
import JDKInfo = require('../../vendor/java_home/jdk.json');
// Force initialization of standard output.
(<any> process).initializeTTYs();
import DoppioJVM = require('../../src/doppiojvm');

// HACK: Delay test execution until backends load.
// https://zerokspot.com/weblog/2013/07/12/delay-test-execution-in-karma/
__karma__.loaded = function() {};

function getBuildPath(isRelease: boolean): string {
  return '../build/' + (isRelease ? 'release' : 'dev') + '/';
}

/**
 * Set up BrowserFS.
 */
function configureFS(isRelease: boolean): void {
  var xhr = new BrowserFS.FileSystem.XmlHttpRequest('listings.json', getBuildPath(isRelease)),
    mfs = new BrowserFS.FileSystem.MountableFileSystem();
  mfs.mount('/sys', xhr);
  mfs.mkdirSync('/tmp', 0x1ff);
  BrowserFS.initialize(mfs);
}

var globalErrorTrap: (err: Error) => void = null
window.onerror = function(err) {
  if (globalErrorTrap) {
    globalErrorTrap(new Error(err));
  }
};

function registerGlobalErrorTrap(cb: (err: Error) => void): void {
  globalErrorTrap = cb;
}

/**
 * Once DoppioJVM is properly set up, this function runs tests.
 */
export default function runTests(isRelease: boolean) {
  configureFS(isRelease);
  // Tests expect to be run from the system path.
  process.chdir('/sys');

  DoppioJVM.Testing.getTests({
    bootstrapClasspath: JDKInfo.classpath.map((item: string) => path.resolve('/sys/vendor/java_home', item)),
    doppioDir: '/sys',
    testClasses: null,
    classpath: [],
    javaHomePath: '/sys/vendor/java_home',
    nativeClasspath: ['/sys/natives'],
    assertionsEnabled: true
  }, (tests: DoppioJVM.Testing.DoppioTest[]): void => {
    // Set up Jasmine unit tests.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 300000;

    describe("Unit Tests", function() {
      tests.forEach((test) => {
        it(test.cls, function(done: () => void) {
          test.run(registerGlobalErrorTrap, (err: Error, actual?: string, expected?: string, diff?: string) => {
            if (err) {
              fail(`DoppioJVM Error:\n\t${err}${err.stack ? `\n${err.stack}` : ''}`);
            }
            expect(actual).toBe(expected);
            done();
          });
        });
      });
    });

    // Launch the tests!
    __karma__.start();
  });
}
