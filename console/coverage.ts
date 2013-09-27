"use strict";
var fs = require('fs');
var path = require('path');
import jvm = require('../src/jvm');
import opcodes = require('../src/opcodes');
import runtime = require('../src/runtime');
import natives = require('../src/natives');
import testing = require('../src/testing');

interface Stats {
  [name:string]: number
}

function setup_opcode_stats(): Stats {
  // monkeypatch opcode execution
  var op_stats: {[name:string]: number} = {};
  for (var i = 0; i < opcodes.opcodes.length; ++i) {
    var op = opcodes.opcodes[i];
    if (op === null) continue;
    op_stats[op.name] = 0;
    var old_fn = op.execute;
    op.execute = (function(old_fn: opcodes.Execute) {
      return function(rs: runtime.RuntimeState) {
        op_stats[this.name]++;
        return old_fn.call(this, rs);
      };
    })(old_fn);
  }
  return op_stats;
}

function setup_native_stats(): Stats {
  // monkeypatch native and trapped calls
  var native_stats = {};
  for (var sig in natives.native_methods) {
    var func = natives.native_methods[sig];
    native_stats[sig] = 0;
    natives.native_methods[sig] = (function(func: Function, sig: string) {
      return function(...args: any[]) {
        native_stats[sig]++;
        return func.apply(null, args);
      };
    })(func, sig);
  }
  for (var sig in natives.trapped_methods) {
    var func = natives.trapped_methods[sig];
    native_stats[sig] = 0;
    natives.trapped_methods[sig] = (function(func: Function, sig: string) {
      return function(...args: any[]) {
        native_stats[sig]++;
        return func.apply(null, args);
      };
    })(func, sig);
  }
  return native_stats;
}

function print_usage(stats: Stats): void {
  var names: string[] = [];
  for (var name in stats) {
    names.push(name);
  }
  names.sort((a, b) => stats[b] - stats[a]);
  for (var i = 0; i < names.length; i++) {
    name = names[i];
    console.log(stats[name], name);
  }
}

function print_unused(stats: Stats, stats_name: string): void {
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

function run_tests(test_classes: string[], stdout: (p:string)=>void,
    quiet: boolean, callback: ()=>void): void {
  var doppio_dir = path.resolve(__dirname, '..');
  // set up the classpath
  var jcl_dir = path.resolve(doppio_dir, 'vendor/classes');
  var jvm_state = new jvm.JVM();
  jvm_state.set_classpath(jcl_dir, doppio_dir);
  function _runner() {
    if (test_classes.length === 0) {
      return callback();
    }
    var test = test_classes.shift();
    quiet || stdout("running " + test + "...\n");
    jvm_state.reset_classloader_cache();
    function nop() {}
    var rs = new runtime.RuntimeState(nop, nop, jvm_state);
    return jvm_state.run_class(rs, test, [], _runner);
  }
  // get the tests, if necessary
  if (test_classes != null && test_classes.length > 0) {
    test_classes = test_classes.map((tc) => tc.replace(/\.class$/, ''));
    _runner();
  } else {
    testing.find_test_classes(doppio_dir, (tcs) => { test_classes = tcs; _runner() });
  }
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
var op_stats: Stats, native_stats: Stats;
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
