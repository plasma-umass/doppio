/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import path = require('path');
import child_process = require('child_process');
var exec = child_process.exec;
/**
 * Grunt task that does the following:
 * - Locates location of java_home on your computer.
 * - Sets location of java/javac/javap in Grunt config.
 * - Ensures version we found is actually Java 6.
 */
function find_native_java(grunt: IGrunt) {
  grunt.registerTask('find_native_java', 'Finds your Java installation.', function(): void {
    var done: (status?: boolean) => void = this.async(),
        cb = function(err?: any) {
          if (!err) {
            grunt.log.ok("Java: " + grunt.config('build.java'));
            grunt.log.ok("Javap: " + grunt.config('build.javap'));
            grunt.log.ok("Javac: " + grunt.config('build.javac'));
          } else {
            grunt.fail.fatal("Could not find a working version of the Java 6 JDK. " +
                            "Please ensure that you have a version of the Java 6 JDK " +
                            "installed on your computer.");
          }
          // Finally, check Java's version before quitting.
          check_java_version(grunt, done);
        };

    grunt.log.writeln("Locating your Java 6 installation...");
    if (process.platform.match(/win32/i)) {
      // Windows
      // N.B.: We cannot include 'winreg' in package.json, as it fails to install
      //       on *nix environments. :(
      check_install_module(grunt, 'winreg', function(err?: any) {
        if (err) return cb(err);
        var Winreg = require('winreg');
        // Look up JDK path.
        var regKey = new Winreg({
          key:  '\\SOFTWARE\\JavaSoft\\Java Development Kit\\1.6'
        });
        // XXX: We don't have typings for winreg.
        regKey.values(function(err: any, items: any) {
          if (!err) {
            for (var i in items) {
              if (items[i].name === 'JavaHome') {
                var java_bin = path.resolve(items[i].value, 'bin');
                grunt.config.set('build.java', path.resolve(java_bin, 'java.exe'));
                grunt.config.set('build.javac', path.resolve(java_bin, 'javac.exe'));
                grunt.config.set('build.javap', path.resolve(java_bin, 'javap.exe'));
                return cb();
              }
            }
          }
          // err won't contain any useful information; it'll say 'process ended
          // with code 1'. The end result is: No working java. :(
          cb(new Error());
        });
      });
    } else {
      // *nix / Mac
      // Option 1: Can we invoke 'java' directly?
      exec(grunt.config('build.java') + ' -version', function(err, stdout, stderr) {
        if (err) {
          // Option 2: Is JAVA_HOME defined?
          if (process.env.JAVA_HOME) {
            var java_bin = path.resolve(process.env.JAVA_HOME, 'bin');
            grunt.config.set('build.java', path.resolve(java_bin, 'java'));
            grunt.config.set('build.javac', path.resolve(java_bin, 'javac'));
            grunt.config.set('build.javap', path.resolve(java_bin, 'javap'));
          } else {
            // Java can't be found.
            cb(new Error());
          }
        } else {
          // 'java' is OK.
          cb();
        }
      });
    }
  });
};

/**
 * Ensures that the version of Java we found was Java 6.
 */
function check_java_version(grunt: IGrunt, cb: (status?: boolean) => void): void {
  exec(grunt.config('build.javac') + ' -version', function(err, stdout, stderr) {
    if (stderr.toString().match(/1\.7/)) {
      grunt.fail.fatal('Detected Java 7 (via javac). Please use Java 6.');
    }
    return cb();
  });
}

/**
 * Checks if the given module is available. If not, it installs it with npm.
 */
function check_install_module(grunt: IGrunt, name: string, cb: (err?: any) => void): void {
  // Check if it's present.
  try {
    require(name);
    cb();
  } catch (e) {
    grunt.log.writeln("npm module " + name + " not found, installing...");
    exec('npm install ' + name, cb);
  }
}

(module).exports = find_native_java;
