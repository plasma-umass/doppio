import child_process = require('child_process');
import os = require('os');
import async = require('async');

function unitTest(grunt: IGrunt) {
	grunt.registerMultiTask('unit_test', 'Run doppio unit tests.', function() {
    var files: { src: string[]; dest: string }[] = this.files,
      done: (status?: boolean) => void = this.async(),
      tasks: Array<AsyncFunction<void>> = [], testFailed = false;
    // Delete failures.txt if it exists.
    if (grunt.file.exists('classes/test/failures.txt')) {
      grunt.file.delete('classes/test/failures.txt');
    }
    files.forEach(function(file: {src: string[]; dest: string}) {
      tasks.push(function(cb: (err?: any) => void) {
        // Strip '.java'
        var nameNoExt = file.src[0].slice(0, -5),
          cProcess = child_process.exec('node build/release-cli/console/test_runner.js ' + nameNoExt + ' --makefile', function (err?: any, stdout?: Buffer, stderr?: Buffer) {
          if (err) {
            grunt.log.write(stdout.toString() + stderr.toString());
            testFailed = true;
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
      done(!testFailed);
    });
  });
}

export = unitTest;
