/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import os = require('os');
import fs = require('fs');
import zlib = require('zlib');
import path = require('path');
var async = require('async'),
    ar = require('ar'),
    tar = require('tar');

function extract_deb(grunt: IGrunt) {
  grunt.registerMultiTask('extract_deb', 'Extracts the contents of the given Debian package.', function() {
    var files: {src: string[]; dest: string}[] = this.files,
        i: number, tasks: Function[] = [],
        done: (status?: boolean) => void = this.async(),
        options = this.options();
    for (i = 0; i < files.length; i++) {
      // Capture file.
      (function(file: {src: string[]; dest: string}) {
        tasks.push(function(cb: (err?: any) => void): void {
          extract_data(grunt, file, options.dest_dir, cb);
        });
      })(files[i]);
    }

    async.series(tasks, function(err: any, results: any[]) {
      if (err) {
        grunt.fail.fatal("Error extracting Debian package: " + err);
      }
      done();
    });
  });
}

/**
 * Finds data.tar.gz in the given debian package, and extracts it. Calls the
 * callback with an optional error message when finished.
 */
function extract_data(grunt: IGrunt, archive_file: {src: string[]; dest: string}, dest_dir: string, cb: (err?: any) => void): void {
  var archive = new ar.Archive(fs.readFileSync(archive_file.src[0]));
  var files = archive.getFiles();
  var found = false;
  var tarFile = archive_file.src[0] + ".tar";
  var stream: fs.ReadStream;
  function stream_finish_cb(err: any): void {
    // Close the stream before passing the callback.
    // XXX: DefinitelyTyped's node.d.ts doesn't have a 'close' defined.
    (<any> stream).close();
    cb(err);
  }
  function extract_tarfile(data: NodeBuffer): void {
    // Write the tar file to disc so we can create a read stream for it.
    // There's no built-in way to create a stream from a buffer in Node.
    fs.writeFileSync(tarFile, data);
    // Extract the tar file.
    stream = fs.createReadStream(tarFile);
    stream.pipe(tar.Extract({ path: dest_dir })).on("error", stream_finish_cb).on("end", stream_finish_cb);
  }

  if (fs.existsSync(tarFile)) {
    grunt.log.writeln('Ignoring file ' + path.basename(archive_file.src[0]) + ' (already extracted).');
    return cb();
  }
  grunt.log.writeln('Processing file ' + path.basename(archive_file.src[0]) + '...');

  // Iterate through the files to find data.tar.gz.
  for (var i = 0; i < files.length; i++) {
    var file = files[i];
    if (file.name() === 'data.tar.gz') {
      found = true;
      break;
    } else if (file.name() === 'data.tar.xz') {
      grunt.fatal("Debian archive uses the tar.xz file format, which we do not support.");
      break;
    }
  }

  if (found) {
    // Decompress the file: Gunzip
    zlib.gunzip(file.fileData(), function (err, buff) {
      if (err) {
        cb(err);
      } else {
        extract_tarfile(buff);
      }
    });
  } else {
    cb(new Error("Could not find data.tar.gz in " + archive_file.src[0] + "."));
  }
}

(module).exports = extract_deb;
