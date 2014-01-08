/**
 * Grunt build file for Doppio.
 * Bootstraps ourselves from JavaScript into TypeScript, with a little help
 * from `typescript-require`.
 */
var Grunttasks;
require('typescript-require');
// typescript-require will compile Grunttasks.ts to JavaScript.
// It will also use modification time to determine if Grunttasks should be
// recompiled or not.
Grunttasks = require('./Grunttasks.ts');
module.exports = Grunttasks.setup;
