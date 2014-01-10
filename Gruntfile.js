/**
 * Grunt build file for Doppio.
 * Bootstraps ourselves from JavaScript into TypeScript.
 */
var Grunttasks, glob = require('glob'), ts_files = [],
    execSync = require('execSync');

ts_files = glob.sync('tasks/*.ts');
ts_files.push('Grunttasks.ts');

// Run!
if (execSync.run('tsc --module commonjs ' + ts_files.join(' ')) !== 0) {
  throw new Error("Compilation error!");
}

Grunttasks = require('./Grunttasks');
module.exports = Grunttasks.setup;
