/**
 * Main entry point for Doppio unit tests in the browser.
 * Sets up the test environment, and launches everything.
 */
declare var __karma__: any;
declare var __numWaiting: number;
import * as fs from 'fs';
import * as path from 'path';
// Force initialization of standard output.
(<any> process).initializeTTYs();
import * as DoppioJVM from '../../src/doppiojvm';
import DoppioTest = DoppioJVM.Testing.DoppioTest;
import {getTests as localGetTests, runTest as commonRunTest, getBuild} from './harness_common';
import {Message, MessageType, RunTestMessage, SetupMessage, TestListingMessage, TestResultMessage} from './messages';

// HACK: Delay test execution until backends load.
// https://zerokspot.com/weblog/2013/07/12/delay-test-execution-in-karma/
__karma__.loaded = function() {};

let workerMsgCount = 0;
const workerMsgInfo:any[] = [];

function registerWorkerListener(worker: Worker) {
  worker.addEventListener('message', (msg: MessageEvent) => {
    const data = msg.data;
    const info = workerMsgInfo[data.id];
    delete(workerMsgInfo[data.id]);
    switch (data.type) {
      case MessageType.TEST_RESULT: {
        const result = <TestResultMessage> data;
        info.cb(result.err, result.stack, result.actual, result.expected);
      }
      case MessageType.TEST_LISTING: {
        const result = <TestListingMessage> data;
        info.cb(result.listing);
      }
    }
  });
  worker.onerror = function(e) {
    throw e;
  };
}

function runTestWebWorker(index: number, cb: (err: string, stack?: string, actual?: string, expected?: string) => void): void {
  const msg: RunTestMessage = {
    type: MessageType.RUN_TEST,
    id : workerMsgCount++,
    index: index
  };
  workerSendMessage(msg, cb);
}

function runTestLocally(index: number, cb: (err?: string, stack?: string, actual?: string, expected?: string) => void): void {
  commonRunTest(tests[index], (err, actual, expected) => cb(err ? "" + err : null, err ? err.stack : null, actual, expected));
}

function workerSendMessage(msg: Message, cbFunction: any) {
  workerMsgInfo[msg.id] = {cb: cbFunction};
  worker.postMessage(msg);
}

function getTestsWebWorker(cb: (tests: string[]) => void): void {
  const msg: SetupMessage = {
    type: MessageType.SETUP,
    id : workerMsgCount++
  };
  workerSendMessage(msg, cb);
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
    worker = new Worker(`../build/test-${getBuild()}/harness_webworker.js`);
    registerWorkerListener(worker);
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
