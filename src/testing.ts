"use strict";
import JVM = require('./jvm');
import util = require('./util');
import java_cli = require('./java_cli');
import difflib = require('./difflib');
import path = require('path');
import fs = require('fs');

var jvm_state: JVM;
export function find_test_classes(doppio_dir: string, cb): void {
    var test_dir = path.resolve(doppio_dir, 'classes/test');
    fs.readdir(test_dir, function(err, files) {
      cb(files.filter((file) => path.extname(file) === '.java')
              .map((file)=>"classes/test/" + path.basename(file, '.java')));
    });
  }

// @todo Pass in an options object or something. This is unwieldy.
export function run_tests(opts: java_cli.JavaOptions, doppio_dir: string,
    test_classes: string[], hide_diffs: boolean, quiet: boolean,
    keep_going: boolean, callback: (result: boolean) => void): void {

  var xfail_file = path.resolve(doppio_dir, 'classes/test/xfail.txt');
  function _runner(test_classes: string[], xfails: string[]): void {
    // get the tests, if necessary
    if (test_classes.length === 0) {
      quiet || keep_going || process.stdout.write("Pass\n");
      return callback(false);
    }
    var test = test_classes.shift();
    if (test.indexOf('.') !== -1) {
      // Convert foo.bar.Baz => foo/bar/Baz
      test = util.descriptor2typestr(util.int_classname(test));
    }
    quiet || process.stdout.write("testing " + test + "...\n");
    // Construct new JVM for each test.
    new JVM({
      jclPath: opts.jcl_path,
      classpath: [doppio_dir],
      javaHomePath: opts.java_home_path,
      extractionPath: opts.jar_file_path,
      nativeClasspath: opts.native_classpath
    }, (err: any, jvm?: JVM): void => {
      if (err) {
        process.stderr.write("Test failed: " + err + "\n");
        callback(false);
      } else {
        jvm_state = jvm;
        run_stdout_test(doppio_dir, test, function(diff: string) {
          if ((diff != null) != (xfails.indexOf(test) >= 0)) {
            if (diff != null) {
              process.stdout.write("Failed output test: " + test + "\n");
              hide_diffs || process.stdout.write(diff + "\n");
            } else {
              process.stdout.write("Expected failure passed: " + test + "\n");
            }
            if (!keep_going) {
              return callback(true);
            }
          }
          _runner(test_classes, xfails);
        });
      }
    });
  }
  fs.readFile(xfail_file, 'utf-8', function(err: any, contents: string) {
    var xfails = contents.split('\n').map((failname) => "classes/test/" + failname);
    if (test_classes != null && test_classes.length > 0) {
      test_classes = test_classes.map((tc: string) => tc.replace(/\.class$/, ''));
      _runner(test_classes, xfails);
    } else {
      find_test_classes(doppio_dir, (tcs: string[]) => _runner(tcs, xfails));
    }
  });
}

// remove comments and blank lines, ignore specifics of float/double printing and whitespace
function sanitize(str: string): string {
  return str.replace(/\/\/.*/g, '')
            .replace(/^\s*$[\n\r]+/mg, '')
            .replace(/(float|double)\t.*/g, '$1')
            .replace(/[ \t\r]+/g, ' ')
            .replace(/[ ]\n/g, '\n')
            .replace(/\[ \]/g, '[]');
}

function run_stdout_test(doppio_dir: string, test_class: string, callback: (diff: string) => void): void {
  var output_filename = path.resolve(doppio_dir, test_class) + ".runout";
  fs.readFile(output_filename, 'utf8', function(err, java_output: string) {
    if (err) {
      return callback("Unable to open file " + output_filename + ": " + err);
    }
    var doppio_output = '',
        // Hook into process.stdout.
        stdout_write = process.stdout.write,
        stderr_write = process.stderr.write,
        new_write = function(data: any, arg2?: any, arg3?: any): boolean {
          if (typeof(data) !== 'string') {
            // Buffer.
            data = data.toString();
          }
          doppio_output += data;
          return true;
        };
    process.stdout.write = new_write;
    process.stderr.write = new_write;
    jvm_state.runClass(test_class, [],
      (success: boolean) => {
        // Re-attach process's standard output.
        process.stdout.write = stdout_write;
        process.stderr.write = stderr_write;
        callback(cleandiff(doppio_output, java_output));
    });
  });
}

function cleandiff(our_str: string, their_str: string): string {
  var our_lines = our_str.split(/\n/);
  var their_lines = their_str.split(/\n/);
  var oidx = 0;
  var tidx = 0;
  var diff: string[] = [];
  diff = difflib.text_diff(our_lines, their_lines);
  if (diff.length > 0) {
    return 'Doppio | Java\n' + diff.join('\n');
  }
}
