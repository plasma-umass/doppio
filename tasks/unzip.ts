/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import path = require('path');
var AdmZip = require('adm-zip');

/**
 * A task that unzips one or more zip files to a given location.
 * Overwrites files by default.
 */
function unzip(grunt: IGrunt) {
	grunt.registerMultiTask('unzip', 'Unzips files from src to dest.', function(): any {
    var files: {src: string[]; dest: string}[] = this.files, i: number,
        options = this.options();
    for (i = 0; i < files.length; i++) {
      try {
        unzip_file(grunt, files[i], options.dest_dir);
      } catch (e) {
        grunt.fail.fatal("Unable to extract " + files[i].src[0] + ": " + e);
      }
    }
  });
}

/**
 * Unzips the file at file_path to dest_dir.
 */
function unzip_file(grunt: IGrunt, file: {src: string[]; dest: string}, dest_dir: string): void {
  var zip;
  grunt.log.writeln("Extracting " + path.basename(file.src[0]) + " to " + dest_dir + "...");
  zip = new AdmZip(file.src[0]);
  zip.extractAllTo(dest_dir, /*overwrite*/true);
}


(module).exports = unzip;
