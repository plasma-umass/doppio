import javaCLI from '../src/java_cli';
import JVM from '../src/jvm';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as JDKInfo from '../vendor/java_home/jdk.json';
// Makes our stack traces point to the TypeScript source code lines.
require('source-map-support').install({
  handleUncaughtExceptions: true
});

function doneCb(status: number): void {
  process.exit(status);
}

var jvmState: JVM;

process.on('SIGINT', function () {
  console.error('Doppio caught SIGINT');
  process.exit(0);
});

process.on('uncaughtException', (er: any) => {
  console.log(`Encountered error: ${er}\n${er.stack}`);
  fs.appendFileSync('doppio.err', `\n--------------------------------------\n${er}\n${er.stack}\n`);
  if (jvmState) {
    // Dump JVM stack state.
    jvmState.dumpState('doppio.err', (er) => {
      if (!er) {
        console.log("Thread state dumped to doppio.err.")
      } else {
        console.log(`Error writing doppio.err: ${er}\n${er.stack}`);
      }
    });
  } else {
    console.log("JVM state undefined; unable to print debug information.");
  }
  process.exit(1);
});

// Run the JVM. Remove node runner.js from the args.
javaCLI(process.argv.slice(2), {
  doppioHomePath: path.resolve(__dirname, '..'),
  nativeClasspath: [],
  launcherName: process.argv[0] + " " + path.relative(process.cwd(), process.argv[1]),
  intMode: false,
  dumpJITStats: false,
  tmpDir: os.tmpdir()
}, doneCb, function(jvm: JVM): void {
  jvmState = jvm;
});
