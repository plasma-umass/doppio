/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/async/async.d.ts" />
import child_process = require('child_process');
import os = require('os');
import fs = require('fs');
import path = require('path');
import async = require('async');

function render(grunt: IGrunt) {
	grunt.registerMultiTask('render', 'Run the Mustache renderer on input files.', function() {
    var files: {src: string[]; dest: string}[] = this.files,
        done: (status?: boolean) => void = this.async(),
        tasks: Function[] = [],
        options = this.options({args: []});
    files.forEach(function(file: {src: string[]; dest: string}) {
      if (!grunt.file.exists(path.dirname(file.dest))) {
        grunt.file.mkdir(path.dirname(file.dest));
      }
      tasks.push(function(cb: (err?: any) => void) {
        // Strip '.mustache'
        var nameNoExt = path.basename(file.src[0]).slice(0, -9);
        child_process.exec('node node_modules/coffee-script/bin/coffee tools/render.coffee ' + options.args.join(' ') + ' ' + nameNoExt, function(err?: any, stdout?: NodeBuffer) {
          if (err) {
            grunt.fail.fatal('Error running render.coffee: ' + err);
          } else {
            fs.writeFileSync(file.dest, stdout);
          }
          cb();
        });
      });
    });

    async.parallelLimit(tasks, os.cpus().length, function(err?: any) {
      if (err) {
        grunt.fail.fatal('render.coffee failed: ' + err);
      }
      done();
    });
  });
}

export = render;
