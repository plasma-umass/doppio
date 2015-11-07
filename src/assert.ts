import threading = require('./threading');

/**
 * Checks the given assertion. Throws an error if it fails.
 */
function assert(assertion: boolean, msg?: string, thread?: threading.JVMThread) {
  if (!assertion) {
    throw new Error(`Assertion failed: ${msg}\n${thread ? thread.getPrintableStackTrace() : ''}`);
  }
}

export = assert;
