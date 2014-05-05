/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import path = require('path');
import child_process = require('child_process');
var semver = require('semver'),
  exec = child_process.exec,
  spawn = child_process.spawn;
/**
 * Grunt task that does the following:
 * - Locates location of java_home on your computer.
 * - Sets location of java/javac/javap in Grunt config.
 * - Ensures version we found is actually Java 6.
 */
function find_native_java(grunt: IGrunt) {
  grunt.registerTask('find_native_java', 'Finds your Java installation.', function (): void {
    var done: (status?: boolean) => void = this.async(),
      cb = function (err?: any) {
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
      // Windows: JDK path is in either of the following registry keys:
      // - HKLM\Software\JavaSoft\Java Development Kit\1.6 [JDK arch == OS arch]
      // - HKLM\Software\Wow6432Node\JavaSoft\Java Development Kit\1.6 [32-bit JDK Arch, 64-bit OS arch]
      // Check both.
      var semaphore: number = 2,
        valueCb = (err: Error, values: { [valName: string]: string }) => {
          // Ensure we only send back an error after *both* keys have been
          // checked.
          var processErrors = --semaphore === 0;
          if (err) {
            if (processErrors) cb(err);
          } else {
            var javaHome = values['JavaHome'];
            if (javaHome) {
              var java_bin = path.resolve(javaHome, 'bin');
              grunt.config.set('build.java', path.resolve(java_bin, 'java.exe'));
              grunt.config.set('build.javac', path.resolve(java_bin, 'javac.exe'));
              grunt.config.set('build.javap', path.resolve(java_bin, 'javap.exe'));
              // Done!
              cb();
            } else {
              if (processErrors) cb(new Error("Cannot find JavaHome."));
            }
          }
        };
      get_registry_key('HKLM\\SOFTWARE\\JavaSoft\\Java Development Kit\\1.6', valueCb);
      get_registry_key('HKLM\\SOFTWARE\\Wow6432Node\\JavaSoft\\Java Development Kit\\1.6', valueCb);
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
  exec('"' + grunt.config('build.javac') + '" -version', function (err, stdout, stderr) {
    if (err) {
      throw err;
    }
    var java_version = /(\d+\.\d+\.\d+)/.exec(stderr.toString())[1];
    if (!semver.satisfies(java_version, '<1.7.0')) {
      grunt.fail.fatal('Detected Java '+java_version+' (via javac). Please use Java <= 1.6');
    }
    return cb();
  });
}

/**
 * Retrieves the given registry key using the REG command line utility.
 * Returns an error if it fails, or the key as a dictionary if it succeeds.\
 * 
 * Inspired by node-winreg, but rewritten here due to a bug in that module.
 * https://github.com/fresc81/node-winreg
 */
function get_registry_key(key: string, cb: (err: Error, values?: {[valName: string]: string}) => void) {
  var args = ['QUERY', key],
    proc = spawn('REG', args, {
      cwd: undefined,
      env: process.env,
      stdio: ['ignore', 'pipe', 'ignore']
    }), buffer = '',
    ITEM_PATTERN = /^([a-zA-Z0-9_\s\\-]+)\s(REG_SZ|REG_MULTI_SZ|REG_EXPAND_SZ|REG_DWORD|REG_QWORD|REG_BINARY|REG_NONE)\s+([^\s].*)$/;

  proc.stdout.on('data', (data: NodeBuffer) => {
    buffer += data.toString();
  });

  proc.on('close', (code: number) => {
    if (code !== 0) {
      cb(new Error('process exited with code ' + code));
    } else {
      // Success
      var lines = buffer.split('\n'),
        lineNumber = 0,
        items: string[] = [],
        rv: { [valName: string]: string } = {};

      lines.forEach((line: string, idx: number) => {
        lines[idx] = line.trim();
        if (lines[idx].length > 0) {
          if (lineNumber != 0) {
            items.push(lines[idx]);
          }
          ++lineNumber;
        }
      });

      items.forEach((item: string) => {
        var match = ITEM_PATTERN.exec(item);
        if (match) {
          // rv[valName] = value;
          // Second item is the type; we don't care about that.
          rv[match[1].trim()] = match[3];
        }
      });

      cb(null, rv);
    }
  });
}

(module).exports = find_native_java;
