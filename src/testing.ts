"use strict";
import jvm = require('./jvm');
import runtime = require('./runtime');
var RuntimeState = runtime.RuntimeState;
import util = require('./util');
import disassembler = require('./disassembler');
import path = require('path');
import fs = require('fs');
var jvm_state = new jvm.JVM();

export function find_test_classes(doppio_dir: string, cb): void {
    var test_dir = path.resolve(doppio_dir, 'classes/test');
    fs.readdir(test_dir, function(err, files) {
      cb(files.filter((file) => path.extname(file) === '.java')
              .map((file)=>"classes/test/" + path.basename(file, '.java')));
    });
  }

export function run_tests(test_classes: string[], stdout, hide_diffs: boolean,
    quiet: boolean, keep_going: boolean, callback): void {
  var doppio_dir = util.are_in_browser() ? '/sys/' : path.resolve(__dirname, '..');
  // set up the classpath
  var jcl_dir = path.resolve(doppio_dir, 'vendor/classes');
  jvm_state.set_classpath(jcl_dir, doppio_dir);
  var xfail_file = path.resolve(doppio_dir, 'classes/test/xfail.txt');
  function _runner(test_classes: string[], xfails: string[]): void {
    // get the tests, if necessary
    if (test_classes.length === 0) {
      quiet || keep_going || stdout("Pass\n");
      return callback(false);
    }
    var test = test_classes.shift();
    if (test.indexOf('.') !== -1) {
      // Convert foo.bar.Baz => foo/bar/Baz
      test = util.descriptor2typestr(util.int_classname(test));
    }
    quiet || stdout("testing " + test + "...\n");
    run_disasm_test(doppio_dir, test, function(disasm_diff: string) {
      if (disasm_diff != null) {
        stdout("Failed disasm test " + test + "\n");
        hide_diffs || stdout("" + disasm_diff + "\n");
        if (!keep_going) {
          return callback(true);
        }
      }
      run_stdout_test(doppio_dir, test, function(diff: string) {
        if ((diff != null) != (xfails.indexOf(test) >= 0)) {
          if (diff != null) {
            stdout("Failed output test: " + test + "\n");
            hide_diffs || stdout(diff + "\n");
          } else {
            stdout("Expected failure passed: " + test + "\n");
          }
          if (!keep_going) {
            return callback(true);
          }
        }
        _runner(test_classes, xfails);
      });
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

function run_disasm_test(doppio_dir: string, test_class: string, callback): void {
  var test_path = path.resolve(doppio_dir, test_class);
  fs.readFile(test_path + ".disasm", 'utf8', function(err, contents: string) {
    var javap_disasm = sanitize(contents);
    fs.readFile(test_path + ".class", function(err, buffer) {
      var doppio_disasm = sanitize(disassembler.disassemble(buffer));
      callback(cleandiff(doppio_disasm, javap_disasm));
    });
  });
}

function run_stdout_test(doppio_dir: string, test_class: string, callback): void {
  var output_filename = path.resolve(doppio_dir, test_class) + ".runout";
  fs.readFile(output_filename, 'utf8', function(err, java_output: string) {
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
    jvm_state.reset_classloader_cache();
    jvm_state.run_class(test_class, [],
      () => {
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
  while (oidx < our_lines.length && tidx < their_lines.length) {
    if (our_lines[oidx++] === their_lines[tidx++]) {
      continue;
    }
    diff.push("D:" + our_lines[oidx - 1] + "\nJ:" + their_lines[tidx - 1]);
  }
  diff.push.apply(diff, our_lines.slice(oidx).map((extra) => "D:" + extra));
  diff.push.apply(diff, their_lines.slice(tidx).map((extra) => "J:" + extra));
  if (diff.length > 0) {
    return diff.join('\n');
  }
}
