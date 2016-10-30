export enum MessageType {
  SETUP,
  RUN_TEST,
  TEST_LISTING,
  TEST_RESULT
}

export interface Message {
  type: MessageType;
  id: number;
}

export interface SetupMessage extends Message {
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
