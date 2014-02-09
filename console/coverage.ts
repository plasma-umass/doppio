"use strict";
var fs = require('fs');
var path = require('path');
import JVM = require('../src/jvm');
import opcodes = require('../src/opcodes');
import natives = require('../src/natives');
import testing = require('../src/testing');
import os = require('os');
// only used for types
import runtime = require('../src/runtime');

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
  var native_stats: Stats = {};
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
  var stdout_write = process.stdout.write,
      stderr_write = process.stderr.write,
      nop = function(arg1: any, arg2?: any, arg3?: any): boolean { return true; },
      doppio_dir = path.resolve(__dirname, '..'),
      jcl_dir = path.resolve(doppio_dir, 'vendor/classes'),
      java_home_dir = path.resolve(doppio_dir, 'vendor/java_home'),
      jar_file_path = path.resolve(os.tmpDir(), 'doppio_jars'),
      jvm_state: JVM = new JVM(function(err: any, jvm?: JVM): void {
        jvm_state.push_classpath_item(doppio_dir, function(success: boolean): void {
          if (!success) {
            throw new Error("Unable to add " + doppio_dir + " to classpath.");
          }
          // get the tests, if necessary
          if (test_classes != null && test_classes.length > 0) {
            test_classes = test_classes.map((tc) => tc.replace(/\.class$/, ''));
            _runner();
          } else {
            testing.find_test_classes(doppio_dir, (tcs) => { test_classes = tcs; _runner() });
          }
        });
      }, jcl_dir, java_home_dir, jar_file_path);

  function _runner() {
    // Unquiet standard output.
    process.stdout.write = stdout_write;
    process.stderr.write = stderr_write;
    if (test_classes.length === 0) {
      return callback();
    }
    var test = test_classes.shift();
    quiet || stdout("running " + test + "...\n");
    jvm_state.reset_classloader_cache();
    // Quiet standard output.
    process.stdout.write = nop;
    process.stderr.write = nop;
    return jvm_state.run_class(test, [], _runner);
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
