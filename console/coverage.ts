"use strict";
var fs = require('fs');
var path = require('path');
import jvm = module('../src/jvm');
import opcodes = module('../src/opcodes');
import runtime = module('../src/runtime');
import ClassLoader = module('../src/ClassLoader');
import natives = module('../src/natives');
import testing = require('../src/testing');

function setup_opcode_stats() {
  // monkeypatch opcode execution
  var op_stats = {};
  for (var num in opcodes.opcodes) {
    var op = opcodes.opcodes[num];
    op_stats[op.name] = 0;
    var old_fn = op.execute;
    op.execute = (function(old_fn) {
      return function(rs) {
        op_stats[this.name]++;
        return old_fn.call(this, rs);
      };
    })(old_fn);
  }
  return op_stats;
}

function setup_native_stats() {
  // monkeypatch native and trapped calls
  var native_stats = {};
  for (var sig in natives.native_methods) {
    var func = natives.native_methods[sig];
    native_stats[sig] = 0;
    natives.native_methods[sig] = (function(func, sig) {
      return function(...args: any[]) {
        native_stats[sig]++;
        return func.apply(null, args);
      };
    })(func, sig);
  }
  for (var sig in natives.trapped_methods) {
    var func = natives.trapped_methods[sig];
    native_stats[sig] = 0;
    natives.trapped_methods[sig] = (function(func, sig) {
      return function(...args: any[]) {
        native_stats[sig]++;
        return func.apply(null, args);
      };
    })(func, sig);
  }
  return native_stats;
}

function print_usage(stats): void {
  var names = [];
  for (var name in stats) {
    names.push(name);
  }
  names.sort((a, b) => stats[b] - stats[a]);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    console.log(stats[name], name);
  }
}

function print_unused(stats, stats_name): void {
  var unused_count = 0;
  for (var name in stats) {
    if (stats[name] === 0) {
      unused_count++;
      console.log(name);
    }
  }
  if (unused_count > 0) {
    console.log(unused_count + " " + stats_name + " have yet to be tested.");
  }
}

function run_tests(test_classes, stdout, quiet, callback) {
  var doppio_dir = path.resolve(__dirname, '..');
  // get the tests, if necessary
  if (test_classes != null && test_classes.length > 0) {
    test_classes = test_classes.map((tc) => tc.replace(/\.class$/, ''));
  } else {
    test_classes = testing.find_test_classes(doppio_dir);
  }
  // set up the classpath
  var jcl_dir = path.resolve(doppio_dir, 'vendor/classes');
  jvm.set_classpath(jcl_dir, doppio_dir);
  function _runner() {
    if (test_classes.length === 0) {
      return callback();
    }
    var test = test_classes.shift();
    quiet || stdout("running " + test + "...\n");
    var bcl = new ClassLoader.BootstrapClassLoader(jvm.read_classfile)
    function nop() {}
    var rs = new runtime.RuntimeState(nop, nop, bcl);
    return jvm.run_class(rs, test, [], _runner);
  }
  return _runner();
}

var print = require('util').print;
var optimist = require('optimist')
  .boolean(['n', 'o', 'q', 'h'])
  .alias({
    n: 'natives',
    o: 'opcodes',
    q: 'quiet',
    p: 'print-usage',
    h: 'help'
  }).describe({
    n: 'Cover native functions',
    o: 'Cover opcodes',
    q: 'Suppress in-progress output',
    p: 'Print all usages, not just unused',
    h: 'Show usage'
  }).usage('Usage: $0 [class_file(s)]');

var argv = optimist.argv;
if (argv.help) {
  optimist.showHelp();
  process.exit(0);
}
if (!(argv.opcodes || argv.natives)) {
  console.error('Must select natives, opcodes, or both');
  optimist.showHelp();
  process.exit(1);
}
var op_stats, native_stats;
if (argv.opcodes) {
  op_stats = setup_opcode_stats();
}
if (argv.natives) {
  native_stats = setup_native_stats();
}
run_tests(argv._, print, argv.quiet, function() {
  if (argv['print-usage'] != null) {
    if (argv.opcodes) {
      print_usage(op_stats);
    }
    if (argv.natives) {
      print_usage(native_stats);
    }
  } else {
    if (argv.opcodes) {
      print_unused(op_stats, 'opcodes');
    }
    if (argv.natives) {
      print_unused(native_stats, 'native methods');
    }
  }
});
