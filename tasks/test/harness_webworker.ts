importScripts('/node_modules/browserfs/dist/browserfs.js');

import {MessageType, Message, SetupMessage, TestListingMessage, RunTestMessage, TestResultMessage} from './messages';
import {getTests, runTest} from './harness_common';
import * as DoppioJVM from '../../src/doppiojvm';
import DoppioTest = DoppioJVM.Testing.DoppioTest;

enum State {
  INITIAL,
  SETTING_UP,
  WAITING_FOR_TEST,
  RUNNING_TEST
}

let state = State.INITIAL,
  tests: DoppioTest[];

/**
 * Test harness portion that runs in a WebWorker.
 */
onmessage = function(e) {
  const data: Message = e.data;
  switch (data.type) {
    case MessageType.RUN_TEST: {
      if (state !== State.WAITING_FOR_TEST) {
        throw new Error(`Either not set up, or currently running test.`);
      }
      state = State.RUNNING_TEST;
      let msg = (<RunTestMessage> data);
      runTest(tests[msg.index], (err, actual?, expected?, diff?) => {
        state = State.WAITING_FOR_TEST;
        let results: TestResultMessage = {
          type: MessageType.TEST_RESULT,
          id: data.id,
          err: err ? "" + err : null,
          stack: err ? err.stack : null,
          actual: actual,
          expected: expected,
          diff: diff
        };
        (<any> postMessage)(results);
      });
      break;
    }
    case MessageType.SETUP: {
      if (state !== State.INITIAL) {
        throw new Error(`Already set up.`);
      }
      state = State.SETTING_UP;
      getTests((allTests) => {
        tests = allTests;
        state = State.WAITING_FOR_TEST;

        let listing: TestListingMessage = {
          type: MessageType.TEST_LISTING,
          id: data.id,
          listing: tests.map((test) => test.cls)
        };
        (<any> postMessage)(listing);
      });
      break;
    }
    default:
      throw new Error(`Invalid data type: ${data.type}.`);
  }
};

