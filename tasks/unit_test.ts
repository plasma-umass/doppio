/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import child_process = require('child_process');
import os = require('os');
import path = require('path');
import fs = require('fs');
var async = require('async');

function unit_test(grunt: IGrunt) {
	grunt.registerMultiTask('unit_test', 'Run doppio unit tests.', function() {
    var files: {src: string[]; dest: string}[] = this.files,
        done: (status?: boolean) => void = this.async(),
        tasks: Function[] = [],
        options = this.options({args:[], secondary_file: ""});
    // Delete failures.txt if it exists.
    if (grunt.file.exists('classes/test/failures.txt')) {
      grunt.file.delete('classes/test/failures.txt');
    }
    files.forEach(function(file: {src: string[]; dest: string}) {
      tasks.push(function(cb: (err?: any) => void) {
        // Strip '.java'
        var name_no_ext = file.src[0].slice(0, -5);
        child_process.exec('node build/release-cli/console/test_runner.js ' + name_no_ext + ' --makefile', function(err?: any, stdout?: NodeBuffer, stderr?: NodeBuffer) {
          if (err) {
            grunt.log.write(stdout.toString() + stderr.toString());
          } else {
            grunt.log.write(stdout.toString());
          }
          cb();
        });
      });
    });

    async.parallelLimit(tasks, os.cpus().length, function(err?: any) {
      // Force newline after test output.
      grunt.log.writeln('');
      if (grunt.file.exists('classes/test/failures.txt')) {
        grunt.log.writeln(grunt.file.read('classes/test/failures.txt'));
      }
      done();
    });
  });
}

(module).exports = unit_test;
