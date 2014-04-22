/**
 * Checks the given assertion. Throws an error if it fails.
 */
function assert(assertion: boolean, msg?: string) {
  if (!assertion) {
    throw new Error("Assertion failed: " + msg);
  }
}

export = assert;
