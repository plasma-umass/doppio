/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
import path = require('path');
import child_process = require('child_process');
var semver = require('semver'),
  exec = child_process.exec,
  spawn = child_process.spawn,
  async = require('async');
/**
 * Grunt task that does the following:
 * - Locates location of java_home on your computer.
 * - Sets location of java/javac/javap in Grunt config.
 * - Ensures version we found is actually Java 6.
 */
function find_native_java(grunt: IGrunt) {
  grunt.registerTask('find_native_java', 'Finds your Java installation.', function (): void {
    var done: (status?: boolean) => void = this.async(),
      cb = (success: boolean, java_home?: string, append_exe?: boolean): void => {
        if (success) {
          // Note: java_home may be undefined, in which case we use the version of Java on the system's PATH.
          if (typeof java_home !== 'undefined') {
            var java_bin = path.resolve(java_home, 'bin');
            grunt.config.set('build.java', path.resolve(java_bin, 'java' + (append_exe ? '.exe' : '')));
            grunt.config.set('build.javac', path.resolve(java_bin, 'javac' + (append_exe ? '.exe' : '')));
            grunt.config.set('build.javap', path.resolve(java_bin, 'javap' + (append_exe ? '.exe' : '')));
          }
          grunt.log.ok("Java: " + grunt.config('build.java'));
          grunt.log.ok("Javap: " + grunt.config('build.javap'));
          grunt.log.ok("Javac: " + grunt.config('build.javac'));
        } else {
          grunt.fail.fatal("Could not find the JDK. " +
            "Please ensure that you have a version of the Java JDK, " +
            "preferably for Java 6, installed on your computer.");
        }
        // Finally, check Java's version before quitting.
        check_java_version(grunt, (is_java_6, java_version) => {
          if (!is_java_6) {
            grunt.log.warn('Detected Java ' + java_version + ' (via javac). Unit tests ' +
              'are not guaranteed to pass on version of Java > 1.6.');
          }
          grunt.config.set('build.is_java_6', is_java_6);
          done(true);
        });
      };

    grunt.log.writeln("Locating your Java 6 installation...");
    if (process.platform.match(/win32/i)) {
      windows_find_java_home(grunt, cb);
    } else if (process.platform.match(/darwin/i)) {
      mac_find_java_home(grunt, cb);
    } else {
      nix_find_java_home(grunt, cb);
    }
  });
};

/**
 * Checks if the version of Java we found was Java 6.
 */
function check_java_version(grunt: IGrunt, cb: (is_java_6: boolean, java_version: string) => void): void {
  exec('"' + grunt.config('build.javac') + '" -version', function (err, stdout, stderr) {
    if (err) {
      throw err;
    }
    var java_version = /(\d+\.\d+\.\d+)/.exec(stderr.toString())[1];
    return cb(semver.satisfies(java_version, '<1.7.0'), java_version);
  });
}

/**
 * Uses the Mac's java_home utility to find an appropriate version of Java.
 */
function mac_find_java_home(grunt: IGrunt, cb: (success: boolean, java_home?: string) => void): void {
  async.eachSeries(['6', '7', '8'], (version: string, iterator_cb: (java_home?: string) => void) => {
    exec('/usr/libexec/java_home -version 1.' + version, (err, stdout, stderr) => {
      if (err) {
        iterator_cb();
      } else {
        var java_home = stdout.toString().replace('\n', '');
        iterator_cb(java_home);
      }
    });
  }, (java_home?: string) => {
    if (java_home) {
      cb(true, java_home);
    } else {
      cb(false);
    }
  });
}

/**
 * Find Java on Windows by checking registry keys.
 */
function windows_find_java_home(grunt: IGrunt, cb: (success: boolean, java_home?: string, append_exe?: boolean) => void): void {
  // Windows: JDK path is in either of the following registry keys:
  // - HKLM\Software\JavaSoft\Java Development Kit\1.[version] [JDK arch == OS arch]
  // - HKLM\Software\Wow6432Node\JavaSoft\Java Development Kit\1.[version] [32-bit JDK Arch, 64-bit OS arch]
  // Check both for Java 6, 7, and 8.
  var keys_to_check: string[] = [
      'HKLM\\SOFTWARE\\JavaSoft\\Java Development Kit\\1.6',
      'HKLM\\SOFTWARE\\Wow6432Node\\JavaSoft\\Java Development Kit\\1.6',
      'HKLM\\SOFTWARE\\JavaSoft\\Java Development Kit\\1.7',
      'HKLM\\SOFTWARE\\Wow6432Node\\JavaSoft\\Java Development Kit\\1.7',
      'HKLM\\SOFTWARE\\JavaSoft\\Java Development Kit\\1.8',
      'HKLM\\SOFTWARE\\Wow6432Node\\JavaSoft\\Java Development Kit\\1.8'
    ];
  async.eachSeries(keys_to_check, (key: string, iterator_cb: (java_home?: string) => void) => {
    get_registry_key(key, (err: Error, values?: { [valName: string]: string }) => {
      if (err || !values['JavaHome']) {
        iterator_cb();
      } else {
        iterator_cb(values['JavaHome']);
      }
    });
  }, (java_home?: string): void => {
    if (java_home) {
      cb(true, java_home, true);
    } else {
      cb(false);
    }
  });
}

/**
 * Find Java in *nix by checking the JAVA_HOME environment variable, or using the version of Java on the PATH.
 */
function nix_find_java_home(grunt: IGrunt, cb: (success: boolean, java_home?: string) => void): void {
  // Option 1: Is JAVA_HOME defined?
  if (process.env.JAVA_HOME) {
    cb(true, process.env.JAVA_HOME);
  } else {
    // Option 2: Can we invoke 'java' directly?
    exec(grunt.config('build.java') + ' -version', function(err, stdout, stderr) {
      if (err) {
        // Java can't be found.
        cb(false);
      } else {
        // 'java' is OK.
        cb(true);
      }
    });
  }
}

/**
 * Retrieves the given registry key using the REG command line utility.
 * Returns an error if it fails, or the key as a dictionary if it succeeds.
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
