import {JVMThread} from './threading';

/**
 * Checks the given assertion. Throws an error if it fails.
 */
export default function assert(assertion: boolean, msg?: string, thread?: JVMThread) {
  if (!assertion) {
    throw new Error(`Assertion failed: ${msg}\n${thread ? thread.getPrintableStackTrace() : ''}`);
  }
}
