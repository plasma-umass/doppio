/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/async/async.d.ts" />
import os = require('os');
import fs = require('fs');
import path = require('path');
import async = require('async');

/**
 * Generates JVMTypes.d.ts in the includes/ directory.
 */
function includes(grunt: IGrunt) {
  grunt.registerMultiTask('includes', 'Generates JVMTypes.d.ts.', function() {
    var doppiohPath: string = 'build/dev-cli/console/doppioh.js',
        options = this.options(),
        packages: string[] = options.packages,
        dest: string = options.dest,
        done: (status?: boolean) => void = this.async(),
        i: number, tasks: Function[] = [],
        force: string[] = options.force,
        standardArgPrefix = [doppiohPath, '-d', dest, '-cp', 'vendor/java_home/classes', '-ts', '.'];

    if (force != null && force.length > 0) {
      standardArgPrefix.push('-f', force.join(":"));
    }

    for (i = 0; i < packages.length; i++) {
      // Closure to capture 'file'.
      (function(package: string) {
        tasks.push(function(cb: (err?: any) => void): void {
          grunt.util.spawn({
            cmd: 'node',
            args: standardArgPrefix.concat(package)
          }, function(error: Error, result: grunt.util.ISpawnResult, code: number) {
            if (code !== 0 || error) {
              grunt.fail.fatal("Could not run doppioh on package " + package + ": " + result.stdout + "\n" + result.stderr);
            }
            cb(error);
          });
        });
      })(packages[i]);
    }

    // Parallelize!
    async.series(tasks, function(err: any, results: any[]) {
      if (!err) {
        // Remove unneeded TypeScript files.
        fs.readdirSync(dest).filter((item: string) => item.indexOf('.d.ts') === -1).forEach((item: string) => {
          grunt.file.delete(path.resolve(dest, item));
        });
      }
      done(!err);
    });
  });
}

export = includes;
