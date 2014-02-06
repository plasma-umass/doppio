"use strict";
var readline = require('readline');
var argv = require('optimist').argv;
import jvm = require('../src/jvm');

// initialize the RuntimeState
var jvm_state;// = new jvm.JVM();
jvm_state.set_classpath(__dirname + "/../vendor/classes", '.');

function repl_run(cname: string, args: string[], done_cb): void {
  if (cname.slice(-6) === '.class') {
    cname = cname.slice(0, -6);
  }
  jvm_state.run_class(cname, args, done_cb);
}

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
