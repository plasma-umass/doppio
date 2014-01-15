/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import fs = require('fs');
import path = require('path');
var async = require('async');

/**
 * Grunt task that does the following:
 * - Locates location of java_home on your computer.
 * - Sets location of java/javac/javap in Grunt config.
 * - Symlinks relevant java_home directories into doppio's java_home directory.
 */
function setup_java_home(grunt: IGrunt) {
  grunt.registerTask('setup_java_home', 'Sets up doppio\'s java_home.', function() {
    var done: (status?: boolean) => void = this.async();
    symlink_java_home(grunt, function(err?: any) {
      if (err) {
        grunt.fail.fatal("Error creating java_home: " + err);
      }
      done();
    });
  });
}

/**
 * (Helper function) Found is an array of symlinks found thus far. We simply
 * append to it.
 */
function _find_symlinks(dir: string, found: string[]): string[] {
  var files = fs.readdirSync(dir), i, filePath, stat;
  // TODO: There's probably a better way to detect symlinks than this.
  for (i = 0; i < files.length; i++) {
    filePath = path.resolve(dir, files[i]);
    try {
      fs.readlinkSync(filePath);
      // It's a symbolic link.
      found.push(filePath);
    } catch (e) {
      // Not a symbolic link.
      stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        // Recurse.
        _find_symlinks(filePath, found);
      }
    }
  }
  return found;
}

/**
 * Recursively searches the given directory for symlinks. Returns an array of
 * found symlinks.
 */
function find_symlinks(dir: string): string[] {
  return _find_symlinks(dir, []);
}

function symlink_java_home(grunt: IGrunt, cb: (err?: any) => void): void {
  var java_home: string = 'vendor/java_home',
      JH: string,
      links;
  if (fs.existsSync(java_home)) {
    return cb();
  }
  grunt.config.requires('build.scratch_dir');
  JH = path.resolve(grunt.config('build.scratch_dir'), 'usr', 'lib', 'jvm', 'java-6-openjdk-i386', 'jre'),
  // a number of .properties files are symlinks to /etc; copy the targets over
  // so we do not need to depend on /etc's existence
  links = find_symlinks(JH);
  async.each(links, function(link, cb2){
    var dest = fs.readlinkSync(link);
    if (dest.match(/^\/etc/)) {
      try {
        fs.renameSync(path.join(grunt.config('build.scratch_dir'), dest), link);
      } catch (e) {
        // Some /etc symlinks are just broken. Hopefully not a big deal.
        grunt.log.writeln('warning: broken symlink: ' + dest);
      }
    } else {
      var p = path.resolve(path.join(path.dirname(link), dest));
      // copy in anything that links out of the JH dir
      if (!p.match(/java-6-openjdk-i386/)) {
        // XXX: this fails if two symlinks reference the same file
        try {
          if (fs.statSync(p).isDirectory()) {
            fs.unlinkSync(link);
          }
          fs.renameSync(p, link);
        } catch (e) {
          grunt.log.writeln('warning: broken symlink: ' + p);
        }
      }
    }
    cb2(null);
  }, function(err){
    fs.renameSync(JH, java_home);
    return cb(err);
  });
}

// Export our task.
(module).exports = setup_java_home;
