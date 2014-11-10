/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/async/async.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/tar/tar.d.ts" />
import fs = require('fs');
import path = require('path');
import tar = require('tar');
var fstream = require('fstream');

function mini_rt(grunt: IGrunt) {
  grunt.registerMultiTask('mini-rt', 'Generates mini-rt.tar.', function() {
    var done: (status?: boolean) => void = this.async(),
        options = this.options({run_args: []}),
        runArgs: string[] = options.run_args,
        runClass: string = options.run_class,
        outputFile: string = options.output;
    runArgs.unshift(runClass);
    runArgs.unshift('-Xlist-class-cache');
    runArgs.unshift('build/release-cli/console/runner.js');
    if (!fs.existsSync('tools/preload')) {
      grunt.log.writeln('Generating list of files to preload in browser... (will take about a minute)');
      grunt.util.spawn({
        cmd: 'node',
        args: runArgs
      }, function(error: Error, result: grunt.util.ISpawnResult, code: number) {
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
  var preloadFiles: string[], i: number, file: string, vendorDir: string,
      dirMap: {[dirName: string]: string[]} = {}, doppioDir: string,
      fileDir: string, fileName: string;
  if (fs.existsSync(outputFile)) {
    // Nothing to do.
    return done();
  }
  grunt.config.requires('build.doppio_dir', 'build.vendor_dir');
  doppioDir = grunt.config('build.doppio_dir');
  vendorDir = grunt.config('build.vendor_dir');
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
  fstream.Reader({path: vendorDir, type: 'Directory', filter:
    function() {
      var relPath: string;
      if (this.type === 'File') {
        // It's a file. Get its parent directory path relative to the Doppio
        // directory, and see if it needs to be preloaded.
        relPath = path.relative(doppioDir, path.dirname(this.path));
        return dirMap.hasOwnProperty(relPath) &&
               dirMap[relPath].indexOf(path.basename(this.path)) !== -1;
      } else {
        // Directory. Make sure it's in the index.
        relPath = path.relative(doppioDir, this.path);
        return dirMap.hasOwnProperty(relPath);
      }
      return false;
    }
  }).pipe(/* Note: undefined argument is hacking around typing bug. Should be fixed once my change is merged. */tar.Pack(undefined)).pipe(fstream.Writer(outputFile)).on('close', function() { done(); });
}

export = mini_rt;
