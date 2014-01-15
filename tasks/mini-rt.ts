/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import os = require('os');
import fs = require('fs');
import path = require('path');
import run_command = require('./helpers/run_command');
var async = require('async');

function mini_rt(grunt: IGrunt) {
  grunt.registerMultiTask('mini-rt', 'Generates mini-rt.tar.', function() {
    var done: (status?: boolean) => void = this.async(),
        options = this.options({run_args: []}),
        run_args: string[] = options.run_args,
        run_class: string = options.run_class,
        preload_stream: WritableStream,
        outputFile: string = options.output;
    run_args.unshift(run_class);
    run_args.unshift('-Xlist-class-cache');
    run_args.unshift('build/release-cli/console/runner.js');
    if (!fs.existsSync('tools/preload')) {
      preload_stream = fs.createWriteStream('tools/preload');
      grunt.log.writeln('Generating tools/preload...');
      run_command.runCommand('node',
        run_args,
        {},
        run_command.createWriteCb(preload_stream), // stdout
        run_command.nopCb,                 // stderr
        run_command.createErrorCb(grunt, preload_stream, function(status?: boolean): void {
          generate_mini_rt(grunt, outputFile, done);
        }, // when program closes
          "Error generating listings.json!"));
    } else {
      generate_mini_rt(grunt, outputFile, done);
    }
  });
}

function generate_mini_rt(grunt: IGrunt, outputFile: string, done: (status?: boolean) => void) {
  grunt.log.writeln("Generating file " + outputFile + "...");
}

(module).exports = mini_rt;
