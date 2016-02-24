/// <reference path="../typings/main.d.ts" />
// Main entry point for browserify. Separate from doppiojvm.ts so we can reference
// main.d.ts here without polluting our official typings.
import doppiojvm = require('./doppiojvm');
export = doppiojvm;
