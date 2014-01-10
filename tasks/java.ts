/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import child_process = require('child_process');
import os = require('os');
import fs = require('fs');
var async = require('async');
/**
 * Java-related tasks.
 */
function java(grunt: IGrunt) {
  grunt.registerMultiTask('javac', 'Run javac on input files.', function() {
    var files: {src: string[]; dest: string}[] = this.files,
        input_files: string[] = [],
        done: (status?: boolean) => void = this.async();
    grunt.config.requires('build.javac');
    files.forEach(function(e) {
      input_files = input_files.concat(e.src);
    });
    child_process.exec(grunt.config('build.javac') + ' -bootclasspath vendor/classes ' + input_files.join(' '), function(err?: any) {
      if (err) {
        grunt.fail.fatal('Error running javac: ' + err);
      }
      done();
    });
  });

  grunt.registerMultiTask('javap', 'Run javap on input files.', function() {
    var files: {src: string[]; dest: string}[] = this.files,
        done: (status?: boolean) => void = this.async(),
        tasks: Function[] = [];
    grunt.config.requires('build.javap');
    files.forEach(function(file: {src: string[]; dest: string}) {
      tasks.push(function(cb: (err?: any) => void) {
        // Trim '.java' from filename to get the class name.
        var class_name = file.src[0].slice(0, -5);
        child_process.exec(grunt.config('build.javap') + ' -bootclasspath vendor/classes -c -verbose -private ' + class_name, function(err?: any, stdout?: NodeBuffer) {
          if (err) {
            grunt.fail.fatal('Error running javap: ' + err);
          } else {
            fs.writeFileSync(file.dest, stdout);
          }
          cb();
        });
      });
    });

    async.parallelLimit(tasks, os.cpus().length, function(err?: any) {
      if (err) {
        grunt.fail.fatal('javap failed: ' + err);
      }
      done();
    });
  });

  grunt.registerMultiTask('run_java', 'Run java on input files.', function() {
    var files: {src: string[]; dest: string}[] = this.files,
        done: (status?: boolean) => void = this.async(),
        tasks: Function[] = [];
    grunt.config.requires('build.java');
    files.forEach(function(file: {src: string[]; dest: string}) {
      tasks.push(function(cb: (err?: any) => void) {
        // Trim '.java' from filename to get the class name.
        var class_name = file.src[0].slice(0, -5);
        child_process.exec(grunt.config('build.java') + ' -Xbootclasspath/a:vendor/classes ' + class_name, function(err?: any, stdout?: NodeBuffer, stderr?: NodeBuffer) {
          if (err) {
            // We expect errors here.
            fs.writeFileSync(file.dest, stdout.toString() + stderr.toString());
          } else {
            fs.writeFileSync(file.dest, stdout);
          }
          cb();
        });
      });
    });

    async.parallelLimit(tasks, os.cpus().length, function(err?: any) {
      if (err) {
        grunt.fail.fatal('java failed: ' + err);
      }
      done();
    });
  });
}

(module).exports = java;
