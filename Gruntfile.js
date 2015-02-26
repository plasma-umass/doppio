/**
 * Grunt build file for Doppio.
 * Bootstraps ourselves from JavaScript into TypeScript.
 */
var Grunttasks, glob = require('glob'), ts_files = [], ts_files_to_compile = [],
    fs = require('fs'),
    child_process = require('child_process'),
    path = require('path'),
    ts_path = path.resolve('node_modules', '.bin', 'tsc'),
    result;

/**
 * For a given TypeScript file, checks if we should recompile it based on
 * modification time.
 */
function shouldRecompile(file) {
  var jsFile = file.slice(0, file.length - 2) + 'js';
  // Recompile if a JS version doesn't exist, OR if the TS version has a
  // greater modification time.
  return !fs.existsSync(jsFile) || fs.statSync(file).mtime.getTime() > fs.statSync(jsFile).mtime.getTime();
}

ts_files = glob.sync('tasks/*.ts');
ts_files.push('Grunttasks.ts');

// Node glob returns *nix-style path separators.
// Let's resolve every path to convert to the current system's
// separators.
ts_files.forEach(function(e, i) {
  e = path.resolve(e);
  if (shouldRecompile(e)) {
    ts_files_to_compile.push(e);
    console.log("Recompiling " + e + "...");
  }
});

// Run!
if (ts_files_to_compile.length > 0) {
  result = child_process.spawnSync(ts_path, ['--noImplicitAny', '--module', 'commonjs'].concat(ts_files_to_compile));
  if (result.status !== 0) {
    throw new Error("Compilation error: " + result.stdout + "\n" + result.stderr);
  }
}

Grunttasks = require('./Grunttasks');
module.exports = Grunttasks.setup;
