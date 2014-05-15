/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import os = require('os');
import fs = require('fs');
import path = require('path');
var async = require('async'),
    tar = require('tar'),
    fstream = require('fstream');

function mini_rt(grunt: IGrunt) {
  grunt.registerMultiTask('mini-rt', 'Generates mini-rt.tar.', function() {
    var done: (status?: boolean) => void = this.async(),
        options = this.options({run_args: []}),
        run_args: string[] = options.run_args,
        run_class: string = options.run_class,
        preload_stream: NodeJS.WritableStream,
        outputFile: string = options.output;
    run_args.unshift(run_class);
    run_args.unshift('-Xlist-class-cache');
    run_args.unshift('build/release-cli/console/runner.js');
    if (!fs.existsSync('tools/preload')) {
      grunt.log.writeln('Generating list of files to preload in browser... (will take about a minute)');
      grunt.util.spawn({
        cmd: 'node',
        args: run_args
      }, function(error, result, code) {
        if (code !== 0 || error) {
          grunt.fail.fatal("Error generating listings.json: " + result.stderr + error);
        }
        fs.writeFileSync('tools/preload', result.stdout);
        generate_mini_rt(grunt, outputFile, done);
      });
    } else {
      generate_mini_rt(grunt, outputFile, done);
    }
  });
}

function generate_mini_rt(grunt: IGrunt, outputFile: string, done: (status?: boolean) => void) {
  var preloadFiles: string[], i: number, file: string, vendor_dir: string,
      dirMap: {[dirName: string]: string[]} = {}, doppio_dir: string,
      i: number, file: string, fileDir: string, fileName: string;
  if (fs.existsSync(outputFile)) {
    // Nothing to do.
    return done();
  }
  grunt.config.requires('build.doppio_dir', 'build.vendor_dir');
  doppio_dir = grunt.config('build.doppio_dir');
  vendor_dir = grunt.config('build.vendor_dir');
  grunt.log.writeln("Generating file " + outputFile + "...");
  preloadFiles = fs.readFileSync('tools/preload').toString().split('\n');
  if (fs.existsSync('tools/preload-compile-extras')) {
    preloadFiles = preloadFiles.concat(fs.readFileSync('tools/preload-compile-extras').toString().split('\n'));
  }

  // Comb through preloadFiles to figure out which directories hold files we
  // care about, and what we should grab from each.
  for (i = 0; i < preloadFiles.length; i++) {
    file = preloadFiles[i];
    fileDir = path.dirname(file);
    fileName = path.basename(file);
    if (dirMap.hasOwnProperty(fileDir)) {
      dirMap[fileDir].push(fileName);
    } else {
      dirMap[fileDir] = [fileName];
    }
    // Add parent directories if not present.
    do {
      fileDir = path.dirname(fileDir);
      if (!dirMap.hasOwnProperty(fileDir)) {
        dirMap[fileDir] = [];
      }
    } while (path.resolve(fileDir) !== path.resolve('.'));
  }

  // Instead of telling fstream directly to pipe a list of files into the tar
  // file (impossible with fstreams), we use a filter on the *entire JCL
  // directory contents* to tell it which directories and files to include. :(
  fstream.Reader({path: vendor_dir, type: 'Directory', filter:
    function() {
      var relPath: string;
      if (this.type === 'File') {
        // It's a file. Get its parent directory path relative to the Doppio
        // directory, and see if it needs to be preloaded.
        relPath = path.relative(doppio_dir, path.dirname(this.path));
        return dirMap.hasOwnProperty(relPath) &&
               dirMap[relPath].indexOf(path.basename(this.path)) !== -1;
      } else {
        // Directory. Make sure it's in the index.
        relPath = path.relative(doppio_dir, this.path);
        return dirMap.hasOwnProperty(relPath);
      }
      return false;
    }
  }).pipe(tar.Pack()).pipe(fstream.Writer(outputFile)).on('close', function() { done(); });
}

(module).exports = mini_rt;
