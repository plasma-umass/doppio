"use strict";
import JVM = require('./jvm');
import util = require('./util');
import java_cli = require('./java_cli');
import difflib = require('./difflib');
import path = require('path');
import fs = require('fs');
import interfaces = require('./interfaces');

/**
 * Variables and code for hooking into standard output.
 */
var testOutput: string = '',
  stdoutWrite,
  stderrWrite,
  newWrite = function(data: any, arg2?: any, arg3?: any): boolean {
    if (typeof(data) !== 'string') {
      // Buffer.
      data = data.toString();
    }
    testOutput += data;
    return true;
  };

/**
 * Starts recording Doppio's output streams.
 */
function startRecordingOutput(): void {
  stdoutWrite = process.stdout.write;
  stderrWrite = process.stderr.write;
  // Reset previous output.
  testOutput = '';
  // Patch up standard output.
  process.stdout.write = newWrite;
  process.stderr.write = newWrite;
}

/**
 * Stops recording Doppio's output streams.
 * @return The recorded output.
 */
function stopRecordingOutput(): string {
  // Unpatch standard output.
  process.stdout.write = stdoutWrite;
  process.stderr.write = stderrWrite;
  return testOutput;
}

/**
 * Doppio testing options.
 */
export interface TestOptions extends interfaces.JVMOptions {
  /**
   * Directory where Doppio is located.
   */
  doppioDir: string;
  /**
   * Classes to test. Each can be in one of the following forms:
   * - foo.bar.Baz
   * - foo/bar/Baz
   */
  testClasses?: string[];
  /**
   * If 'true', then the test runner will not print the output diff of a failing
   * test to the console.
   */
  hideDiffs: boolean;
  /**
   * If 'true', the runner will not print status messages to the console.
   */
  quiet: boolean;
  /**
   * If 'true', the test runner will continue executing in the face of a
   * failure.
   */
  keepGoing: boolean;
}

/**
 * Represents a single unit test, where we compare Doppio's output to the native
 * JVM.
 */
class DoppioTest {
  /**
   * Test runner options.
   */
  private opts: TestOptions;
  /**
   * The class to test.
   */
  private cls: string;
  /**
   * Path to the file recording the output from the native JVM.
   */
  private outFile: string;

  constructor(opts: TestOptions, cls: string) {
    this.opts = opts;
    if (cls.indexOf('.') !== -1) {
      // Convert foo.bar.Baz => foo/bar/Baz
      cls = util.descriptor2typestr(util.int_classname(cls));
    }
    this.cls = cls;
    this.outFile = path.resolve(opts.doppioDir, cls) + ".runout";
  }

  /**
   * Constructs a new JVM for the test.
   */
  private constructJVM(cb: (err: any, jvm?: JVM) => void): void {
    new JVM({
      bootstrapClasspath: this.opts.bootstrapClasspath,
      classpath: [this.opts.doppioDir],
      javaHomePath: this.opts.javaHomePath,
      extractionPath: this.opts.extractionPath,
      nativeClasspath: this.opts.nativeClasspath
    }, cb);
  }

  /**
   * Print the given message. NOP if the 'quiet' flag is supplied'
   */
  private print(msg: string): void {
    this.opts.quiet || process.stdout.write(msg);
  }

  /**
   * Runs the unit test.
   */
  public run(cb: (success: boolean) => void) {
    this.print("[" + this.cls + "]: Running... ");
    this.constructJVM((err: any, jvm?: JVM) => {
      if (err) {
        this.print("fail.\n\tCould not construct JVM:\n" + err);
        cb(false);
      } else {
        startRecordingOutput();
        jvm.runClass(this.cls, [], (success: boolean) => {
          var output = stopRecordingOutput();
          fs.readFile(this.outFile, { encoding: 'utf8' }, (err, data?: string) => {
            var diffStr: string;
            if (err) {
              this.print("fail.\n\tCould not read runout file:\n" + err);
              cb(false);
            } else {
              diffStr = diff(output, data);
              if (diffStr == null) {
                this.print('pass.\n');
                cb(true);
              } else {
                this.print('fail.\n\tOutput does not match native JVM.\n')
                // Print diff.
                if (!this.opts.hideDiffs) {
                  process.stdout.write(this.cls + ": " + diffStr + "\n");
                }
                cb(false);
              }
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
export function findTestClasses(doppioDir: string, cb: (files: string[]) => void): void {
  var testDir = path.resolve(doppioDir, path.join('classes', 'test'));
  fs.readdir(testDir, (err, files) => {
    if (err) {
      cb([]);
    } else {
      cb(files.filter((file) => path.extname(file) === '.java')
              .map((file)=>path.join('classes','test', path.basename(file, '.java'))));
    }
  });
}

/**
 * Run a series of tests.
 */
export function runTests(opts: TestOptions, cb: (result: boolean) => void): void {
  var testClasses = opts.testClasses,
    tests: DoppioTest[];
  if (testClasses == null || testClasses.length === 0) {
    // If no test classes are specified, run ALL the tests!
    findTestClasses(opts.doppioDir, (testClasses) => {
      opts.testClasses = testClasses;
      runTests(opts, cb);
    });
  } else {
    tests = testClasses.map((testClass: string): DoppioTest => {
      return new DoppioTest(opts, testClass);
    });
    util.async_foreach(tests, (test: DoppioTest, nextItem: (err?: any) => void): void => {
      test.run((success: boolean) => {
        if (success || opts.keepGoing) {
          nextItem();
        } else {
          nextItem("Test failed.");
        }
      });
    }, (err?: any): void => {
      cb(err == null);
    });
  }
}

/**
 * Returns a formatted diff between doppioOut and nativeOut.
 * Returns NULL if the strings are identical.
 */
function diff(doppioOut: string, nativeOut: string): string {
  // @todo Robust to Windows line breaks!
  var doppioLines = doppioOut.split(/\n/),
    jvmLines = nativeOut.split(/\n/),
    diff: string[] = difflib.text_diff(doppioLines, jvmLines, 2);
  if (diff.length > 0) {
    return 'Doppio | Java\n' + diff.join('\n');
  }
  return null;
}
