import testing = require('../../src/testing');

export enum MessageType {
  SETUP,
  RUN_TEST,
  TEST_LISTING,
  TEST_RESULT
}

export interface Message {
  type: MessageType;
}

export interface SetupMessage extends Message {
  isRelease: boolean;
}

export interface RunTestMessage extends Message {
  index: number;
}

export interface TestListingMessage extends Message {
  listing: string[];
}

export interface TestResultMessage extends Message {
  err: string;
  stack: string;
  actual: string;
  expected: string;
  diff: string;
}
