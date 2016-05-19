import path = require('path');
import fs = require('fs');
import async = require('async');
/**
 * Handles setting up a new build folder for arbitrary builds.
 * - Creates directory.
 * - Symlinks in 'classes' and 'vendor'.
 */
function makeBuildDir(grunt: IGrunt) {
	grunt.registerTask('make_build_dir', 'Creates the build directory, if not present.', function(target: string) {
    var targetPath = path.resolve(this.options().base, target);
    try {
      if (!fs.existsSync(targetPath)) {
        grunt.file.mkdir(targetPath);
        grunt.log.ok("Created build folder: " + targetPath);
      }
      let asyncPairs: string[][] = [];
      [['classes', path.resolve(targetPath, 'classes')], ['vendor', path.resolve(targetPath, 'vendor')]].forEach((pair) => {
        if (!symlink(grunt, pair[0], pair[1])) {
          asyncPairs.push(pair);
        }
      });

      if (asyncPairs.length > 0) {
        let done = this.async();
        async.eachSeries(asyncPairs, (pair: string[], done: (err?: Error) => void) => {
          copy(grunt, pair[0], pair[1], done);
        }, done);
      }
    } catch (e) {
      grunt.log.error('Could not create build folder build/' + target + ".");
      return false;
    }
  });
}

/**
 * Recursively copies source to dest.
 */
function copy(grunt: IGrunt, source: string, dest: string, cb: (err?: Error) => void): void {
  let cpr = require('cpr');
  if (grunt.file.exists(dest)) {
    grunt.file.delete(dest);
  }
  cpr(source, dest, cb);
}

/**
 * Symlinks source to dest, and prints out what it is doing through Grunt.
 * Returns a boolean, indicating whether or not it succeeded.
 */
function symlink(grunt: IGrunt, source: string, dest: string): boolean {
  var sourceRel: string = path.relative(process.cwd(), source),
      destRel: string = path.relative(process.cwd(), dest),
      existingLinkPath: string;
  // Check if symlink exists.
  try {
    existingLinkPath = fs.readlinkSync(dest);
    if (path.resolve(existingLinkPath) === path.resolve(source)) {
      // Symlink exists and is OK.
      return true;
    } else {
      grunt.fail.fatal('Cannot symlink ' + sourceRel + ' to ' + destRel + ': ' + destRel + ' exists, and links to ' + existingLinkPath + '.');
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      return false;
    }
  }

  try {
    // 'junction' argument is needed by Windows. Making a regular symlink requires admin privileges.
    // Junctions are identical to symlinks, except they cannot link across drives and only work on
    // folders. Those restrictions are OK for us.
    fs.symlinkSync(path.resolve(source), path.resolve(dest), 'junction');
    grunt.log.ok('Symlinked ' + sourceRel + ' to ' + destRel + '.');
  } catch (e) {
    return false;
  }
  return true;
}

export = makeBuildDir;
