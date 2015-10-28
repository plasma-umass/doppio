/// <reference path="../../typings/tsd.d.ts" />
/**
 * Main entry point for Doppio unit tests in the browser.
 * Sets up the test environment, and launches everything.
 */
declare var __karma__: any;
declare var __numWaiting: number;
import DoppioJVM = require('../../src/doppiojvm');
import BrowserFS = require('browserfs');
import fs = require('fs');

// Extend the DefinitelyTyped module with the extra matcher function we add.
declare module jasmine {
  interface Matchers {
    toPass(): void;
  }
}

var finishTest: {[testName: string]: (result: boolean) => void} = {},
  stdoutput = '',
  hasFinished: boolean = false;

function getBuildPath(isRelease: boolean): string {
  return '../build/' + (isRelease ? 'release' : 'dev') + '/';
}

function configureJasmine(tests: string[]): void  {
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 300000;

  // Spruce up Jasmine output by adding a custom matcher.
  beforeEach(() => {
    jasmine.addMatchers({
      toPass: () => {
        return {
          compare: (testResult: boolean) => {
            var result = { pass: testResult, message: "" };
            if (result.pass) {
              // Apparently you can negate tests? We'll never see this string.
              result.message =  "Expected test to fail.";
            } else {
              // Print out the diff.
              result.message =  "Doppio's output does not match native JVM.\n" + stdoutput;
            }
            return result;
          }
        }
      }
    });
  });

  describe("Unit Tests", function() {
    tests.forEach((test: string) => {
      it(test, function(done: () => void) {
        stdoutput = "";
        hasFinished = false;
        console.log("Registering " + test);
        finishTest[test] = (result: boolean) => {
          console.log(test);
          // ????
          (<jasmine.Matchers> <any> expect(result)).toPass();
          // If fails, test finished twice.
          expect(hasFinished).toBe(false);
          hasFinished = true;
          done();
        };
      });
    });
  });
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

/**
  * Once DoppioJVM is properly set up, this function runs tests.
  */
export default function runTests(isRelease: boolean) {
  configureFS(isRelease);
  // Tests expect to be run from the system path.
  process.chdir('/sys');
  // XXX testing.findTestClasses;
  var tests = fs.readdirSync('/sys/classes/test').filter((p: string) => p.indexOf('.java') !== -1);

  // Collect output in a string, print if failure.
  function stdout(data: Buffer) {
    stdoutput += data.toString();
  }
  process.stdout.on('data', stdout);
  process.stderr.on('data', stdout);

  configureJasmine(tests);

  // LAUNCH THE TESTS!
  DoppioJVM.Testing.runTests({
    bootstrapClasspath: ['/sys/vendor/java_home/classes'],
    doppioDir: '/sys',
    testClasses: null,
    hideDiffs: false,
    quiet: true,
    keepGoing: true,
    classpath: [],
    javaHomePath: '/sys/vendor/java_home',
    extractionPath: '/tmp',
    nativeClasspath: ['/sys/natives'],
    assertionsEnabled: false,
    postTestHook: (testName: string, result: boolean) => {
      var test = testName.slice(testName.lastIndexOf('/') + 1) + ".java";
      console.log("Finishing " + test);
      finishTest[test](result);
    }
  }, () => {
    // NOP.
  });
}
