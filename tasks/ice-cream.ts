/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/async/async.d.ts" />
import os = require('os');
import fs = require('fs');
import path = require('path');
import async = require('async');

function iceCream(grunt: IGrunt) {
  grunt.registerMultiTask('ice-cream', 'Removes debug statements from code.', function() {
    var iceCreamPath: string = 'node_modules/ice-cream/dessert.js',
        files: {src: string[]; dest: string}[] = this.files,
        done: (status?: boolean) => void = this.async(),
        i: number, tasks: Function[] = [];
    for (i = 0; i < files.length; i++) {
      // Closure to capture 'file'.
      (function(file: {src: string[]; dest: string}) {
        // Ensure destination folder exists
        if (!fs.existsSync(path.dirname(file.dest))) {
          grunt.file.mkdir(path.dirname(file.dest));
        }
        tasks.push(function(cb: (err?: any) => void): void {
          grunt.util.spawn({
            cmd: 'node',
            args: [iceCreamPath, file.src[0], '--remove', 'trace', '--remove', 'vtrace', '--remove', 'debug']
          }, function(error: Error, result: grunt.util.ISpawnResult, code: number) {
            if (code !== 0 || error) {
              grunt.fail.fatal("Could not run ice-cream on file " + file.src[0] + ": " + result.stdout + "\n" + result.stderr);
            }
            fs.writeFileSync(file.dest, result.stdout);
            cb(error);
          });
        });
      })(files[i]);
    }

    // Parallelize!
    async.parallelLimit(tasks, os.cpus().length, function(err: any, results: any[]) {
      done(!err);
    });
  });
}

export = iceCream;
