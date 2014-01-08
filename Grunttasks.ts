/// <reference path="vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/**
 * Contains all of Doppio's build tasks in beautiful TypeScript.
 * If this is too long of a file, we can break this up into separate files that
 * specify individual or groups of Grunt tasks:
 * http://www.thomasboyt.com/2013/09/01/maintainable-grunt.html
 */
import path = require('path');
import fs = require('fs');
import child_process = require('child_process');
import os = require('os');
var glob = require("glob"),
    exec = child_process.exec,
    async = require("async"),
    NUM_CPUS = os.cpus().length;

/**
 * Symlinks source to dest, and prints out what it is doing through Grunt.
 * Returns a boolean, indicating whether or not it succeeded.
 */
function symlink(grunt: IGrunt, source: string, dest: string): boolean {
  var sourceRel: string = path.relative(__dirname, source),
      destRel: string = path.relative(__dirname, dest),
      existingLinkPath: string;
  // Check if symlink exists.
  try {
    existingLinkPath = fs.readlinkSync(dest);
    if (path.resolve(existingLinkPath) === path.resolve(source)) {
      // Symlink exists and is OK.
      return true;
    }
    else {
      grunt.log.error('Cannot symlink ' + sourceRel + ' to ' + destRel + ': ' + destRel + ' exists, and links to ' + existingLinkPath + '.');
      return false;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      grunt.log.error('Cannot symlink ' + sourceRel + ' to ' + destRel + ': ' + destRel + ' exists and is not a symlink.');
      return false;
    }
  }

  try {
    fs.symlinkSync(source, dest);
    grunt.log.ok('Symlinked ' + sourceRel + ' to ' + destRel + '.');
  } catch (e) {
    grunt.log.error('Cannot symlink ' + sourceRel + ' to ' + destRel + ': ' + e);
    return false;
  }

  return true;
}


export function setup(grunt: IGrunt) {

  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    ts: {
      options: {
        sourcemap: true,
        comments: true
      },
      dev_cli: {
        src: ["console/*.ts", "src/*.ts"],
        outDir: 'build/dev-cli',
        options: {
          module: 'commonjs'
        }
      }
    },
    // Configuration information for all of Doppio's build types.
    build: {
      dev_cli: {
        dirName: "dev-cli",
        launcherName: "doppio-dev"
      },
      dev: {
        dirName: "dev"
      },
      release_cli: {
        dirName: "release-cli",
        launcherName: "doppio"
      },
      release: {
        dirName: "release"
      }
    },
    uglify: {
      release_cli: {
        warnings: false,
        unsafe: true,
        global_defs: {
          UNSAFE: true,
          RELEASE: true
        },
        files: [{
          expand: true,
          cwd: path.resolve(__dirname, 'build', 'dev-cli'),
          src: '(console|src)/*.js',
          dest: path.resolve(__dirname, 'build', 'release-cli')
        }]
      }
    }
	});

  grunt.registerTask('make_build_dir', 'Creates the build directory, if not present.', function(target: string) {
    var buildPath: string = path.resolve(__dirname, "build"),
        targetPath: string;
    grunt.config.requires('build.' + target + '.dirName');
    targetPath = path.resolve(buildPath, grunt.config('build.' + target + '.dirName'));
    try {
      if (!fs.existsSync(targetPath)) {
        if (!fs.existsSync(buildPath)) {
          fs.mkdirSync(buildPath);
        }
        fs.mkdirSync(targetPath);
        grunt.log.ok("Created build folder build/" + target + ".");
      }
    } catch (e) {
      grunt.log.error('Could not create build folder build/' + target + ".");
      return false;
    }
  });

  grunt.registerTask('symlink', 'Symlinks classes/ and vendor/ folders into given build directory.', function(target: string) {
    var buildPath: string,
        classesPath: string = path.resolve(__dirname, "classes"),
        vendorPath: string = path.resolve(__dirname, "vendor");
    // Fail task if a build directory was not specified.
    grunt.config.requires('build.' + target + '.dirName');
    buildPath = path.resolve(__dirname, 'build', grunt.config('build.' + target + '.dirName'));
    // Ensure task fails if one of the symlinks fails.
    return symlink(grunt, classesPath, path.resolve(buildPath, 'classes')) && symlink(grunt, vendorPath, path.resolve(buildPath, 'vendor'));
  });

  grunt.registerTask('ice-cream', 'Removes debug statements from code.', function(target: string) {
    var ice_cream_path: string = path.resolve(__dirname, 'node_modules', '.bin', 'ice-cream'),
        buildPath: string,
        devPath: string = path.resolve(__dirname, "build", "dev-cli"),
        done: (status?: boolean) => void = this.async();
    // Fail task if a build directory was not specified.
    grunt.config.requires('build.' + target + '.dirName');
    buildPath = path.resolve(__dirname, 'build', grunt.config('build.' + target + '.dirName'));
    glob(path.resolve(buildPath,"(console|src)", "*.js"), function (er, files: string[]) {
      var cmd_args: string = " --remove trace --remove vtrace --remove debug",
          cmd_start: string = ice_cream_path + " " + devPath + "/",
          i: number, tasks: Function[] = [];
      if (er) {
        grunt.log.error('Could not glob files: ' + er);
        return done(false);
      }
      // Parallelized ice-cream!
      for (i = 0; i < files.length; i++) {
        // Closure to capture 'file'.
        (function(file: string) {
          tasks.push(function(cb: (err?: any) => void): void {
            exec(cmd_start + file + cmd_args, function(err: any, stdout: NodeBuffer) {
              var outputFilePath: string = path.resolve(buildPath, path.relative(devPath, file));
              if (err) {
                grunt.log.error("Could not run ice-cream on file " + file + ": " + err);
                return cb(new Error());
              }
              fs.writeFile(outputFilePath, stdout, function(err) {
                if (err) {
                  grunt.log.error("Could not write to file " + outputFilePath + ": " + err);
                  return cb(new Error());
                }
              });
            });
          });
        })(files[i]);
      }

      async.parallelLimit(tasks, NUM_CPUS, function(err: any, results: any[]) {
        done(err == null);
      });
    });
  });

  grunt.registerTask('launcher', 'Creates a launcher for the given CLI release.', function(target: string) {
    var launcherName: string, buildPath: string,
        launcherPath: string, doppioPath: string;
    // Fail task if a build directory or launcher name was not specified.
    grunt.config.requires('build.' + target + '.dirName');
    grunt.config.requires('build.' + target + '.launcherName');
    buildPath = path.resolve(__dirname, 'build', grunt.config('build.' + target + '.dirName'));
    launcherName = grunt.config('build.' + target + '.launcherName');
    launcherPath = path.resolve(__dirname, launcherName);
    // Relative path for the launcher.
    doppioPath = path.relative(__dirname, path.resolve(buildPath, "console", "runner"));

    if (!fs.existsSync(launcherPath)) {
      try {
        // Write with mode 755.
        fs.writeFileSync(launcherPath, 'node $(dirname $0)/' + doppioPath + ' "$@"', {mode: 493});
        grunt.log.ok("Created launcher " + launcherName);
      } catch(e) {
        grunt.log.error("Could not create launcher " + launcherName + ": " + e);
        return false;
      }
    }
  });

  // Provides TypeScript compiler functionality from within Grunt.
  grunt.loadNpmTasks('grunt-ts');
  // Provides minification.
  grunt.loadNpmTasks('grunt-contrib-uglify');

  grunt.registerTask('dev-cli',
    ['make_build_dir:dev_cli',
     'symlink:dev_cli',
     'ts:dev_cli',
     'launcher:dev_cli'])
  grunt.registerTask('release-cli',
    ['dev-cli',
     'make_build_dir:release_cli',
     'symlink:release_cli',
     'ice-cream:release_cli',
     'uglify:release_cli',
     'launcher:release_cli'])
};
