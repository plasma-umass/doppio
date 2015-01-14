/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import path = require('path');
import fs = require('fs');
/**
 * Handles setting up a new build folder for arbitrary builds.
 * - Creates directory.
 * - Symlinks in 'classes' and 'vendor'.
 */
function makeBuildDir(grunt: IGrunt) {
	grunt.registerMultiTask('make_build_dir', 'Creates the build directory, if not present.', function() {
    var targetPath = this.options().build_dir;
    try {
      if (!fs.existsSync(targetPath)) {
        grunt.file.mkdir(targetPath);
        grunt.log.ok("Created build folder: " + targetPath);
      }
      // Ensure task fails if one of the symlinks fails.
      return symlink(grunt, 'classes', path.resolve(targetPath, 'classes')) && symlink(grunt, 'vendor', path.resolve(targetPath, 'vendor'));
    } catch (e) {
      grunt.log.error('Could not create build folder build/' + this.target + ".");
      return false;
    }
  });
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
      grunt.fail.fatal('Cannot symlink ' + sourceRel + ' to ' + destRel + ': ' + destRel + ' exists and is not a symlink.');
    }
  }

  try {
    // 'junction' argument is needed by Windows. Making a regular symlink requires admin privileges.
    // Junctions are identical to symlinks, except they cannot link across drives and only work on
    // folders. Those restrictions are OK for us.
    fs.symlinkSync(path.resolve(source), path.resolve(dest), 'junction');
    grunt.log.ok('Symlinked ' + sourceRel + ' to ' + destRel + '.');
  } catch (e) {
    grunt.fail.fatal('Cannot symlink ' + sourceRel + ' to ' + destRel + ': ' + e);
  }
  return true;
}

export = makeBuildDir;
