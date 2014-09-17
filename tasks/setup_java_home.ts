/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import fs = require('fs');
import path = require('path');
var async = require('async'),
    ncp = require('ncp').ncp;

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

      // Ensure time zone data is present.
      if (!fs.existsSync(path.resolve('vendor', 'java_home', 'lib', 'zi', 'ZoneInfoMappings'))) {
        grunt.fail.fatal("Error: java_home is missing time zone data!");
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
  var files = fs.readdirSync(dir);
  // TODO: There's probably a better way to detect symlinks than this.
  for (var i = 0; i < files.length; i++) {
    var filePath = path.resolve(dir, files[i]);
    try {
      fs.readlinkSync(filePath);
      // It's a symbolic link.
      found.push(filePath);
    } catch (e) {
      // Not a symbolic link.
      var stat = fs.statSync(filePath);
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

/**
 * Copy the specified Java Home directory from our temporary directory over to
 * vendor/java_home.
 * @param java_home The folder in our temporary directory to copy over.
 * @param cb Called once copying is complete, or an error occurs.
 */
function copy_java_home_dir(grunt: IGrunt, dir_name: string, cb: (err?: any) => void): void {
  var JH = path.resolve(grunt.config('build.scratch_dir'), 'usr', 'lib', 'jvm', dir_name, 'jre'),
    doppio_java_home = path.resolve('vendor', 'java_home');
  // a number of .properties files are symlinks to /etc; copy the targets over
  // so we do not need to depend on /etc's existence
  var links = find_symlinks(JH);
  async.eachSeries(links, function(link: string, cb2: (err?: any) => void): void {
    try {
      var dest = fs.readlinkSync(link);
      if (dest.match(/^\/etc/)) {
        ncp(path.join(grunt.config('build.scratch_dir'), dest), link, function(err?: any) {
          if (err) {
            // Some /etc symlinks are just broken. Hopefully not a big deal.
            grunt.log.writeln('warning: broken symlink: ' + dest);
          }
          cb2(null);
        });
      } else {
        var p = path.resolve(path.join(path.dirname(link), dest));
        // copy in anything that links out of the JH dir
        if (p.indexOf(dir_name) === -1) {
          // XXX: this fails if two symlinks reference the same file
          if (fs.statSync(p).isDirectory()) {
            fs.unlinkSync(link);
          }
          ncp(p, link, function(err?: any) {
            if (err) {
              grunt.log.writeln('warning: broken symlink: ' + p);
            }
            cb2(null);
          });
        } else {
          // Nothing to do.
          cb2(null);
        }
      }
    } catch (e) {
      grunt.log.writeln('warning: broken symlink: ' + link);
      cb2(null);
    }
  }, function(err: any): void {
    ncp(JH, doppio_java_home, (err2?: any): void => {
      err2 = err2 ? err2 : err;
      cb(err2);
    });
  });
}

function symlink_java_home(grunt: IGrunt, cb: (err?: any) => void): void {
  var java_home = 'vendor/java_home';
  if (fs.existsSync(java_home)) {
    return cb();
  }
  grunt.config.requires('build.scratch_dir');
  copy_java_home_dir(grunt, 'java-6-openjdk-i386', cb);
}

// Export our task.
(module).exports = setup_java_home;
