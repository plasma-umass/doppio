"use strict";
import JVM = require('./jvm');
import util = require('./util');
import difflib = require('./difflib');
import path = require('path');
import fs = require('fs');
import interfaces = require('./interfaces');
import logging = require('./logging');

export interface TestingError extends Error {
  originalError?: any;
  fatal?: boolean;
}

function makeTestingError(msg: string, origErr?: any, fatal?: boolean): TestingError {
  var err = <TestingError> new Error(msg);
  err.originalError = origErr;
  err.fatal = fatal;
  return err;
}

/**
 * Captures stdout/stderr.
 * @todo Do this the proper Node way once BFS is more compliant.
 */
class OutputCapturer {
  private _stdoutWrite = process.stdout.write;
  private _stderrWrite = process.stderr.write;
  private _data: string = "";
  private _isCapturing = false;

  private debugWrite(str: string): void {
    this._stdoutWrite.apply(process.stdout, [str, 'utf8']);
  }

  /**
   * Begin capturing output.
   */
  public start(clear?: boolean): void {
    if (this._isCapturing) {
      throw new Error(`Already capturing.`);
    }
    this._isCapturing = true;
    if (clear) {
      this._data = "";
    }
    process.stderr.write = process.stdout.write = (data: any, arg2?: any, arg3?: any): boolean => {
      if (typeof(data) !== 'string') {
        // Buffer.
        data = data.toString();
      }
      this._data += data;
      return true;
    };
  }

  /**
   * Stop capturing output.
   */
  public stop(): void {
    if (!this._isCapturing) {
      // May be called twice when there's a catastrophic error.
      return;
    }
    this._isCapturing = false;
    process.stderr.write = this._stderrWrite;
    process.stdout.write = this._stdoutWrite;
  }

  /**
   * Retrieve the captured output.
   * @param clear Clear the captured output.
   */
  public getOutput(clear?: boolean): string {
    var data = this._data;
    if (clear) {
      this._data = "";
    }
    return data;
  }
}

/**
 * Doppio testing options.
 */
export interface TestOptions extends interfaces.JVMOptions {
  /**
   * Classes to test. Each can be in one of the following forms:
   * - foo.bar.Baz
   * - foo/bar/Baz
   */
  testClasses?: string[];
}

/**
 * Represents a single unit test, where we compare Doppio's output to the native
 * JVM.
 */
export class DoppioTest {
  /**
   * Test runner options.
   */
  private opts: TestOptions;
  /**
   * The class to test.
   */
  public cls: string;
  /**
   * Path to the file recording the output from the native JVM.
   */
  private outFile: string;
  /**
   * The output capturer for this test.
   */
  private outputCapturer: OutputCapturer = new OutputCapturer();

  constructor(opts: TestOptions, cls: string) {
    this.opts = opts;
    if (cls.indexOf('.') !== -1) {
      // Convert foo.bar.Baz => foo/bar/Baz
      cls = util.descriptor2typestr(util.int_classname(cls));
    }
    this.cls = cls;
    this.outFile = path.resolve(opts.doppioHomePath, cls) + ".runout";
  }

  /**
   * Constructs a new JVM for the test.
   */
  private constructJVM(cb: (err: any, jvm?: JVM) => void): void {
    new JVM(<any> util.merge(JVM.getDefaultOptions(this.opts.doppioHomePath), this.opts, {
      classpath: [this.opts.doppioHomePath],
      enableAssertions: true,
      enableSystemAssertions: true
    }), cb);
  }

  /**
   * Runs the unit test.
   */
  public run(registerGlobalErrorTrap: (cb: (err: Error) => void) => void, cb: (err: Error, actual?: string, expected?: string, diff?: string) => void) {
    var outputCapturer = this.outputCapturer, _jvm: JVM = null, terminated: boolean = false, jvmConstructHasFinished: boolean = false,
      hasFinished: boolean = false;
    registerGlobalErrorTrap((err) => {
      if (_jvm) {
        try {
          _jvm.halt(1);
        } catch (e) {
          err.message += `\n\nAdditionally, test runner received the following error while trying to halt the JVM: ${e}${e.stack ? `\n\n${e.stack}` : ''}\n\nOriginal error's stack trace:`;
        }
      }
      outputCapturer.stop();
      cb(makeTestingError(`Uncaught error. Aborting further tests.\n\t${err}${err.stack ? `\n\n${err.stack}` : ``}`, err, true));
    });

    this.constructJVM((err: any, jvm?: JVM) => {
      _jvm = jvm;
      if (terminated) {
        // Already handled.
        return;
      }
      if (jvmConstructHasFinished) {
        return cb(makeTestingError(`constructJVM returned twice. Aborting further tests.`, null, true));
      }
      jvmConstructHasFinished = true;

      if (err) {
        cb(makeTestingError(`Could not construct JVM:\n${err}`, err));
      } else {
        outputCapturer.start(true);
        jvm.runClass(this.cls, [], (status: number) => {
          if (terminated) {
            // Already handled.
            return;
          }
          outputCapturer.stop();
          if(hasFinished) {
            return cb(makeTestingError(`JVM triggered completion callback twice. Aborting further tests.`, null, true));
          }
          hasFinished = true;

          var actual = outputCapturer.getOutput(true);
          fs.readFile(this.outFile, { encoding: 'utf8' }, (err: any, expected?: string) => {
            if (err) {
              cb(makeTestingError(`Could not read runout file:\n${err}`, err));
            } else {
              var diffText = diff(actual, expected), errMsg: string = null;
              if (diffText !== null) {
                errMsg = `Output does not match native JVM.`;
              }
              cb(errMsg ? makeTestingError(errMsg) : null, actual, expected, diffText);
            }
          });
        });
      }
    });
  }
}

/**
 * Locate all of Doppio's test classes, and pass them to the callback.
 */
function findTestClasses(doppioDir: string, cb: (files: string[]) => void): void {
  var testDir = path.resolve(doppioDir, path.join('classes', 'test'));
  fs.readdir(testDir, (err, files) => {
    if (err) {
      cb([]);
    } else {
      cb(files.filter((file) => path.extname(file) === '.java')
              .map((file) => path.join('classes','test', path.basename(file, '.java'))));
    }
  });
}

/**
 * Retrieve all of the unit tests.
 */
export function getTests(opts: TestOptions, cb: (tests: DoppioTest[]) => void): void {
  var testClasses = opts.testClasses,
    tests: DoppioTest[];
  if (testClasses == null || testClasses.length === 0) {
    // If no test classes are specified, get ALL the tests!
    findTestClasses(opts.doppioHomePath, (testClasses) => {
      opts.testClasses = testClasses;
      getTests(opts, cb);
    });
  } else {
    cb(testClasses.map((testClass: string): DoppioTest => {
      return new DoppioTest(opts, testClass);
    }));
  }
}

/**
 * Returns a formatted diff between doppioOut and nativeOut.
 * Returns NULL if the strings are identical.
 */
export function diff(doppioOut: string, nativeOut: string): string {
  // @todo Robust to Windows line breaks!
  var doppioLines = doppioOut.split(/\n/),
    jvmLines = nativeOut.split(/\n/),
    diff: string[] = difflib.text_diff(doppioLines, jvmLines, 2);
  if (diff.length > 0) {
    return 'Doppio | Java\n' + diff.join('\n');
  }
  return null;
}

/**
 * Run the specified tests.
 */
export function runTests(opts: TestOptions, quiet: boolean, continueAfterFailure: boolean, hideDiffs: boolean,
  registerGlobalErrorTrap: (cb: (err: Error) => void) => void, cb: (err?: TestingError) => void): void {
  function print(str: string): void {
    if (!quiet) {
      process.stdout.write(str);
    }
  }

  getTests(opts, (tests) => {
    util.asyncForEach(tests, (test: DoppioTest, nextTest: (err?: any) => void) => {
      var hasFinished = false;
      print(`[${test.cls}]: Running... `);
      test.run(registerGlobalErrorTrap, (err: TestingError, actual?: string, expected?: string, diff?: string): void => {
        if (err && !hideDiffs && diff) {
          err.message += `\n${diff}`
        }

        if (err) {
          print(`fail.\n\t${err.message}\n`);
          if (err.originalError && err.originalError.stack) {
            print(`${err.stack}\n`);
          }
          if (!continueAfterFailure || (<TestingError> err)['fatal']) {
            err.message = `Failed ${test.cls}: ${err.message}`;
            nextTest(err);
          } else {
            nextTest();
          }
        } else {
          print(`pass.\n`);
          nextTest();
        }
      });
    }, cb);
  });
}
