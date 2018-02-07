import path = require('path');
import {exec, spawn} from 'child_process';
import semver = require('semver');
import LocateJavaHome from 'locate-java-home';
import {IJavaHomeInfo} from 'locate-java-home/ts/lib/interfaces';

/**
 * Grunt task that does the following:
 * - Locates location of java_home on your computer.
 * - Sets location of java/javac/javap in Grunt config.
 * - Ensures version we found is actually Java 8.
 */
function findNativeJava(grunt: IGrunt) {
  grunt.registerTask('find_native_java', 'Finds your Java installation.', function (): void {
    var done: (status?: boolean) => void = this.async();

    function foundJavaHome(home: IJavaHomeInfo, isJava8: boolean): void {
      grunt.log.ok(`Using JDK8 installation at ${home.path}`);
      grunt.config.set('build.java', home.executables.java);
      grunt.config.set('build.javac', home.executables.javac);
      grunt.config.set('build.javap', home.executables.javap);
      grunt.log.ok("Java: " + grunt.config('build.java'));
      grunt.log.ok("Javap: " + grunt.config('build.javap'));
      grunt.log.ok("Javac: " + grunt.config('build.javac'));
      if (!isJava8) {
        grunt.log.warn(`Detected Java ${home.version}. Unit tests are not guaranteed to pass on versions of Java < 1.8.`);
      }
      grunt.config.set('build.is_java_8', isJava8);
      done(true);
    }

    grunt.log.writeln("Locating JDK8 installation...");
    LocateJavaHome({
      mustBeJDK: true
    }, (err, found) => {
      if (err || found.length === 0) {
        grunt.fail.fatal("Could not find the JDK. " +
          "Please ensure that you have a version of the Java JDK, " +
          "preferably for Java 8, installed on your computer.");
      } else {
        // Try to find a Java 8 install.
        var java8installs = found.filter((home) => semver.satisfies(home.version, ">=1.8"));
        if (java8installs.length === 0) {
          foundJavaHome(found[0], false);
        } else {
          foundJavaHome(java8installs[0], true);
        }
      }
    })
  });
};

export = findNativeJava;
