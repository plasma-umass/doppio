"use strict";
import jvm = module('./jvm');
import runtime = module('./runtime');
var RuntimeState = runtime.RuntimeState;
import util = module('./util');
import disassembler = module('./disassembler');
import ClassData = module('./ClassData');
import ClassLoader = module('./ClassLoader');
var BootstrapClassLoader = ClassLoader.BootstrapClassLoader;

declare var node;
var path = typeof node !== "undefined" ? node.path : require('path');
var fs = typeof node !== "undefined" ? node.fs : require('fs');

export function find_test_classes(doppio_dir: string): string[] {
  var test_dir = path.resolve(doppio_dir, 'classes/test');
  var java_files = fs.readdirSync(test_dir)
    .filter((file) => path.extname(file) === '.java');
  return java_files.map((file)=>"classes/test/" + path.basename(file, '.java'));
}

export function run_tests(test_classes, stdout, hide_diffs, quiet, keep_going, callback): void {
  var failname, jcl_dir, tc, xfails, _runner;

  var doppio_dir = typeof node !== "undefined" && node !== null ? '/home/doppio/' : path.resolve(__dirname, '..');
  if (test_classes != null && test_classes.length > 0) {
    test_classes = test_classes.map((tc) => tc.replace(/\.class$/, ''));
  } else {
    test_classes = find_test_classes(doppio_dir);
  }
  var jcl_dir = path.resolve(doppio_dir, 'vendor/classes');
  jvm.set_classpath(jcl_dir, doppio_dir);
  var xfails = fs.readFileSync('classes/test/xfail.txt', 'utf-8')
                 .split('\n')
                 .map((failname) => "classes/test/" + failname);
  _runner = function() {
    if (test_classes.length === 0) {
      quiet || keep_going || stdout("Pass\n");
      return callback(false);
    }
    var test = test_classes.shift();
    quiet || stdout("testing " + test + "...\n");
    var disasm_diff = run_disasm_test(doppio_dir, test);
    if (disasm_diff != null) {
      stdout("Failed disasm test " + test + "\n");
      hide_diffs || stdout("" + disasm_diff + "\n");
      if (!keep_going) {
        return callback(true);
      }
    }
    run_stdout_test(doppio_dir, test, function(diff) {
      var has_diff = (diff != null);
      var xfail = (xfails.indexOf(test) >= 0);
      if (has_diff != xfail) {
        if (has_diff) {
          stdout("Failed output test: " + test + "\n");
          hide_diffs || stdout("" + diff + "\n");
        } else {
          stdout("Expected failure passed: " + test + "\n");
        }
        if (!keep_going) {
          return callback(true);
        }
      }
      _runner();
    });
  };
  _runner();
}

function sanitize(str: string): string {
  return str.replace(/\/\/.*/g, '')
            .replace(/^\s*$[\n\r]+/mg, '')
            .replace(/(float|double)\t.*/g, '$1')
            .replace(/[ \t\r]+/g, ' ')
            .replace(/[ ]\n/g, '\n')
            .replace(/\[ \]/g, '[]');
}

function run_disasm_test(doppio_dir: string, test_class: string): string {
  var test_path = path.resolve(doppio_dir, test_class);
  var javap_disasm = sanitize(fs.readFileSync(test_path + ".disasm", 'utf8'));
  var buff = fs.readFileSync(test_path + ".class");
  var cls = new ClassData.ReferenceClassData(buff);
  var doppio_disasm = sanitize(disassembler.disassemble(cls));
  return cleandiff(doppio_disasm, javap_disasm);
}

function run_stdout_test(doppio_dir: string, test_class: string, callback): void {
  var java_output = fs.readFileSync(path.resolve(doppio_dir, test_class) + ".runout", 'utf8');
  var doppio_output = '';
  var stdout = function(str) { doppio_output += str; };
  var rs = new RuntimeState(stdout, (function() {}), new BootstrapClassLoader(jvm.read_classfile));
  jvm.run_class(rs, test_class, [], () => callback(cleandiff(doppio_output, java_output)));
}

function cleandiff(our_str: string, their_str: string): string {
  var our_lines = our_str.split(/\n/);
  var their_lines = their_str.split(/\n/);
  var oidx = 0;
  var tidx = 0;
  var diff = [];
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

function cleandiff_fancy(our_str: string, their_str: string): string {
  var cfrm, d, dd, diff, dist, i, j, line, our_lines, their_lines, _i, _j, _k, _l, _ref3, _ref4, _ref5, _ref6;

  our_lines = our_str.split(/\n/);
  their_lines = their_str.split(/\n/);
  if (our_lines.length === 0) {
    return ((function() {
      var _i, _len, _results;

      _results = [];
      for (_i = 0, _len = their_lines.length; _i < _len; _i++) {
        line = their_lines[_i];
        _results.push("J:" + line);
      }
      return _results;
    })()).join('\n');
  }
  if (their_lines.length === 0) {
    return ((function() {
      var _i, _len, _results;

      _results = [];
      for (_i = 0, _len = our_lines.length; _i < _len; _i++) {
        line = our_lines[_i];
        _results.push("D:" + line);
      }
      return _results;
    })()).join('\n');
  }
  dist = [];
  cfrm = [];
  for (i = _i = 0, _ref3 = their_lines.length; _i <= _ref3; i = _i += 1) {
    dist.push((function() {
      var _j, _ref4, _results;

      _results = [];
      for (j = _j = 0, _ref4 = our_lines.length; _j <= _ref4; j = _j += 1) {
        _results.push(0);
      }
      return _results;
    })());
    cfrm.push((function() {
      var _j, _ref4, _results;

      _results = [];
      for (j = _j = 0, _ref4 = our_lines.length; _j <= _ref4; j = _j += 1) {
        _results.push(0);
      }
      return _results;
    })());
    dist[i][0] = i;
    cfrm[i][0] = 1;
  }
  for (j = _j = 0, _ref4 = our_lines.length; _j <= _ref4; j = _j += 1) {
    dist[0][j] = j;
    cfrm[0][j] = 2;
  }
  for (i = _k = 1, _ref5 = their_lines.length; _k <= _ref5; i = _k += 1) {
    for (j = _l = 1, _ref6 = our_lines.length; _l <= _ref6; j = _l += 1) {
      if (our_lines[j - 1] === their_lines[i - 1]) {
        dist[i][j] = dist[i - 1][j - 1];
        cfrm[i][j] = 4;
      } else {
        dd = [dist[i - 1][j], dist[i][j - 1], dist[i - 1][j - 1]];
        d = Math.min.apply(Math, dd);
        dist[i][j] = d + 1;
        cfrm[i][j] = dd.indexOf(d) + 1;
      }
    }
  }
  i = their_lines.length;
  j = our_lines.length;
  if (dist[i][j] === 0) {
    return;
  }
  diff = [];
  while (!(i === 0 && j === 0)) {
    switch (cfrm[i][j]) {
      case 1:
        diff.unshift("doppio{" + j + "}:" + our_lines[j] + "\njava  {" + i + "}:" + their_lines[i--]);
        break;
      case 2:
        diff.unshift("doppio{" + j + "}:" + our_lines[j--] + "\njava  {" + i + "}:" + their_lines[i]);
        break;
      case 3:
        diff.unshift("doppio{" + j + "}:" + our_lines[j--] + "\njava  {" + i + "}:" + their_lines[i--]);
        break;
      case 4:
        i--;
        j--;
    }
  }
  return diff.join('\n');
}
