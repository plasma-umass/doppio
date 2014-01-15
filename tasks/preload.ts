/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import child_process = require('child_process');
import os = require('os');
import fs = require('fs');
import path = require('path');
var async = require('async');

function preload(grunt: IGrunt) {
  grunt.registerMultiTask('preload', 'Generates a list of files to preload in the browser.', function() {
    var done: (status?: boolean) => void = this.async();
    if (!fs.existsSync('tools/preload')) {
      grunt.log.writeln("Generating list of files to preload in browser... (will take a few seconds)");
      //
      if (fs.existsSync('tools/preload-compile-extras')) {
        grunt.log.writeln("Appending extra classes listed in 'tools/preload-compile-extras'...");
      }
    }
  });
}


/**
 * echo "Generating list of files to preload in browser... (will take a few seconds)"; \
    ./doppio -Xlist-class-cache classes/util/Javac ./classes/test/FileOps.java > tools/preload; \
    if [ -f tools/preload-compile-extras ]; then \
      cat tools/preload-compile-extras >> tools/preload; \
    fi; \
 */

(module).exports = preload;
