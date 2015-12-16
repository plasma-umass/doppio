/// <reference path="../../typings/tsd.d.ts" />
/**
 * Main entry point for Doppio unit tests in the browser.
 * Sets up the test environment, and launches everything.
 */
declare var __karma__: any;
declare var __numWaiting: number;
import fs = require('fs');
import path = require('path');
// Force initialization of standard output.
(<any> process).initializeTTYs();
import DoppioJVM = require('../../src/doppiojvm');
import DoppioTest = DoppioJVM.Testing.DoppioTest;
import {getTests as localGetTests, runTest as commonRunTest} from './harness_common';
import {MessageType, RunTestMessage, SetupMessage, TestListingMessage, TestResultMessage} from './messages';
let isRelease = DoppioJVM.VM.JVM.isReleaseBuild();

// HACK: Delay test execution until backends load.
// https://zerokspot.com/weblog/2013/07/12/delay-test-execution-in-karma/
__karma__.loaded = function() {};

function runTestWebWorker(index: number, cb: (err: string, stack?: string, actual?: string, expected?: string) => void): void {
  let msg: RunTestMessage = {
    type: MessageType.RUN_TEST,
    index: index
  }, listener = function(msg: MessageEvent) {
    let data = <TestResultMessage> msg.data;
    cb(data.err, data.stack, data.actual, data.expected);
  };
  worker.addEventListener('message', listener);
  worker.postMessage(msg);
}

function runTestLocally(index: number, cb: (err?: string, stack?: string, actual?: string, expected?: string) => void): void {
  commonRunTest(tests[index], (err, actual, expected) => cb(err ? "" + err : null, err ? err.stack : null, actual, expected));
}

function getTestsWebWorker(cb: (tests: string[]) => void): void {
  let msg: SetupMessage = {
    type: MessageType.SETUP
  }, listener = function(msg: MessageEvent) {
    worker.removeEventListener('message', listener);
    let data = <TestListingMessage> msg.data;
    cb(data.listing);
  };
  worker.addEventListener('message', listener);
  worker.postMessage(msg);
}

function getTestsLocally(cb: (tests: string[]) => void): void {
  localGetTests((_tests) => {
    tests = _tests;
    cb(tests.map((test) => test.cls));
  });
}

var supportsWorkers = typeof Worker !== 'undefined',
  runTest = supportsWorkers ? runTestWebWorker : runTestLocally,
  getTests = supportsWorkers ? getTestsWebWorker : getTestsLocally,
  tests: DoppioTest[], worker: Worker;

/**
 * Once DoppioJVM is properly set up, this function runs tests.
 */
export default function runTests() {
  if (supportsWorkers) {
    worker = new Worker(`../build/test${isRelease ? '-release' : '-dev'}/harness_webworker.js`);
  }

  getTests((tests: string[]): void => {
    // Set up Jasmine unit tests.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 300000;

    describe("Unit Tests", function() {
      tests.forEach((test, index) => {
        it(test, function(done: () => void) {
          runTest(index, (err?: string, stack?: string, actual?: string, expected?: string) => {
            if (err) {
              fail(`DoppioJVM Error:\n\t${err}${stack ? `\n${stack}` : ''}`);
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

runTests();
