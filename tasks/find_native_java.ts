/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/semver/semver.d.ts" />
import path = require('path');
import child_process = require('child_process');
import semver = require('semver');
var exec = child_process.exec,
  spawn = child_process.spawn,
  async = require('async');
/**
 * Grunt task that does the following:
 * - Locates location of java_home on your computer.
 * - Sets location of java/javac/javap in Grunt config.
 * - Ensures version we found is actually Java 6.
 */
function findNativeJava(grunt: IGrunt) {
  grunt.registerTask('find_native_java', 'Finds your Java installation.', function (): void {
    var done: (status?: boolean) => void = this.async(),
      cb = (success: boolean, java_home?: string, appendExe?: boolean): void => {
        if (success) {
          // Note: java_home may be undefined, in which case we use the version of Java on the system's PATH.
          if (typeof java_home !== 'undefined') {
            var javaBin = path.resolve(java_home, 'bin');
            grunt.config.set('build.java', path.resolve(javaBin, 'java' + (appendExe ? '.exe' : '')));
            grunt.config.set('build.javac', path.resolve(javaBin, 'javac' + (appendExe ? '.exe' : '')));
            grunt.config.set('build.javap', path.resolve(javaBin, 'javap' + (appendExe ? '.exe' : '')));
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
        checkJavaVersion(grunt, (isJava8: boolean, javaVersion: string) => {
          if (!isJava8) {
            grunt.log.warn('Detected Java ' + javaVersion + ' (via javac). Unit tests ' +
              'are not guaranteed to pass on versions of Java < 1.8.');
          }
          grunt.config.set('build.is_java_8', isJava8);
          done(true);
        });
      };

    grunt.log.writeln("Locating your Java 8 installation...");
    if (process.platform.match(/win32/i)) {
      windowsFindJavaHome(grunt, cb);
    } else if (process.platform.match(/darwin/i)) {
      macFindJavaHome(grunt, cb);
    } else {
      nixFindJavaHome(grunt, cb);
    }
  });
};

/**
 * Checks if the version of Java we found was Java 6.
 */
function checkJavaVersion(grunt: IGrunt, cb: (is_java_8: boolean, java_version: string) => void): void {
  exec('"' + grunt.config('build.javac') + '" -version', function (err: Error, stdout: Buffer, stderr: Buffer) {
    if (err) {
      throw err;
    }
    var javaVersion = /(\d+\.\d+\.\d+)/.exec(stderr.toString())[1];
    return cb(semver.satisfies(javaVersion, '>=1.8.0'), javaVersion);
  });
}

/**
 * Uses the Mac's java_home utility to find an appropriate version of Java.
 */
function macFindJavaHome(grunt: IGrunt, cb: (success: boolean, java_home?: string) => void): void {
  async.eachSeries(['8'], (version: string, iterator_cb: (java_home?: string) => void) => {
    exec('/usr/libexec/java_home -version 1.' + version, (err: Error, stdout: Buffer, stderr: Buffer) => {
      if (err) {
        iterator_cb();
      } else {
        var javaHome = stdout.toString().replace('\n', '');
        iterator_cb(javaHome);
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
function windowsFindJavaHome(grunt: IGrunt, cb: (success: boolean, java_home?: string, append_exe?: boolean) => void): void {
  // Windows: JDK path is in either of the following registry keys:
  // - HKLM\Software\JavaSoft\Java Development Kit\1.[version] [JDK arch == OS arch]
  // - HKLM\Software\Wow6432Node\JavaSoft\Java Development Kit\1.[version] [32-bit JDK Arch, 64-bit OS arch]
  var keysToCheck: string[] = [
      'HKLM\\SOFTWARE\\JavaSoft\\Java Development Kit\\1.8',
      'HKLM\\SOFTWARE\\Wow6432Node\\JavaSoft\\Java Development Kit\\1.8'
    ];
  async.eachSeries(keysToCheck, (key: string, iteratorCb: (javaHome?: string) => void) => {
    getRegistryKey(key, (err: Error, values?: { [valName: string]: string }) => {
      if (err || !values['JavaHome']) {
        iteratorCb();
      } else {
        iteratorCb(values['JavaHome']);
      }
    });
  }, (javaHome?: string): void => {
    if (javaHome) {
      cb(true, javaHome, true);
    } else {
      cb(false);
    }
  });
}

/**
 * Find Java in *nix by checking the JAVA_HOME environment variable, or using the version of Java on the PATH.
 */
function nixFindJavaHome(grunt: IGrunt, cb: (success: boolean, javaHome?: string) => void): void {
  // Option 1: Try the 'update-java-alternatives' tool
  exec('update-java-alternatives -l', (err: Error, stdout: Buffer, stderr: Buffer) => {
    // This returns error code 1 on success, for some reason.
    if (!err || (<any>err).code == 1) {
      var alts = stdout.toString().split('\n');
      for (var i=0; i<alts.length; i++) {
        if (alts[i].match(/1\.8/)) {
          var javaHome = alts[i].split(' ')[2];
          cb(true, javaHome);
          return
        }
      }
    }
    // Option 2: Is JAVA_HOME defined?
    if (process.env.JAVA_HOME) {
      cb(true, process.env.JAVA_HOME);
    } else {
      // Option 3: Can we invoke 'java' directly?
      exec(grunt.config('build.java') + ' -version', function(err: Error, stdout: Buffer, stderr: Buffer) {
        if (err) {
          // Java can't be found.
          cb(false);
        } else {
          // 'java' is OK.
          cb(true);
        }
      });
    }
  });
}

/**
 * Retrieves the given registry key using the REG command line utility.
 * Returns an error if it fails, or the key as a dictionary if it succeeds.
 * Inspired by node-winreg, but rewritten here due to a bug in that module.
 * https://github.com/fresc81/node-winreg
 */
function getRegistryKey(key: string, cb: (err: Error, values?: {[valName: string]: string}) => void) {
  var args = ['QUERY', key],
    proc = spawn('REG', args, {
      cwd: undefined,
      env: process.env,
      stdio: ['ignore', 'pipe', 'ignore']
    }), buffer = '',
    ITEM_PATTERN = /^([a-zA-Z0-9_\s\\-]+)\s(REG_SZ|REG_MULTI_SZ|REG_EXPAND_SZ|REG_DWORD|REG_QWORD|REG_BINARY|REG_NONE)\s+([^\s].*)$/;

  proc.stdout.on('data', (data: Buffer) => {
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
          if (lineNumber !== 0) {
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

export = findNativeJava;
