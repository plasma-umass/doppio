"use strict";
var readline = require('readline');
var argv = require('optimist').argv;
import JVM = require('../src/jvm');
import path = require('path');
import os = require('os');

// initialize the RuntimeState
var jvm_state;
new JVM((err: any, jvm?: JVM): void => {
  if (err) {
    throw err;
  }
  jvm_state = jvm;
  // create the REPL
  process.stdin.resume();
  var repl = readline.createInterface(process.stdin, process.stdout);

  // set up handlers
  repl.on('close', function() {
    repl.output.write('\n');
    repl.input.destroy();
  });
  repl.on('line', function(line: string) {
    var toks = line.trim().split(/\s+/);
    if (toks[0] != null && toks[0].length > 0) {
      repl_run(toks[0], toks.slice(1), () => repl.prompt());
    } else {
      repl.prompt();
    }
  });

  // set the prompt, display it, and begin the loop
  repl.setPrompt('doppio> ');
  repl.prompt();
}, path.resolve(__dirname, "/../vendor/classes", '.'),
   path.resolve(__dirname, '/../vendor/java_home'),
   path.resolve(os.tmpDir(), 'doppio_jars'),
   [path.resolve(__dirname, '../src/natives')]);


function repl_run(cname: string, args: string[], done_cb): void {
  if (cname.slice(-6) === '.class') {
    cname = cname.slice(0, -6);
  }
  jvm_state.run_class(cname, args, done_cb);
}
