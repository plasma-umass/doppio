import os = require('os');
import fs = require('fs');
import path = require('path');

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
        i: number, tasks: Array<AsyncFunction<void>> = [],
        force: string[] = options.force,
        headersOnly: boolean = options.headersOnly,
        standardArgPrefix = [doppiohPath, '-d', dest, '-ts', '-dpath', './src/doppiojvm'];

    if (force != null && force.length > 0) {
      standardArgPrefix.push('-f', force.join(":"));
    }

    if (headersOnly) {
      standardArgPrefix.push('-headers_only');
    }

    grunt.util.spawn({
      cmd: 'node',
      args: standardArgPrefix.concat(packages)
    }, function(error: Error, result: grunt.util.ISpawnResult, code: number) {
      if (code !== 0 || error) {
        grunt.fail.fatal(`Could not run doppioh (exit code ${code}): ${error ? `${error}\n` : ''}${result.stdout}\n${result.stderr}`);
      } else {
        done();
      }
    });
  });
}

export = includes;
