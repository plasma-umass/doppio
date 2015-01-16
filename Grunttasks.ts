/// <reference path="vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/**
 * Contains all of doppio's grunt build tasks in TypeScript.
 */
import path = require('path');
import fs = require('fs');
import os = require('os');

export function setup(grunt: IGrunt) {
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    // Calls path.resolve with the given arguments. If any argument is a
    // template, it is recursively processed until it no longer contains
    // templates.
    // Why do we need this? See:
    // http://stackoverflow.com/questions/21121239/grunt-how-do-recursive-templates-work
    resolve: function (...segs: string[]): string {
      var fixedSegs: string[] = [];
      segs.forEach(function (seg: string) {
        while (seg.indexOf('<%=') !== -1) {
          seg = <any> grunt.config.process(seg);
        }
        fixedSegs.push(seg);
      });
      return path.resolve.apply(path, fixedSegs);
    },
    // doppio build configuration
    build: {
      // Path to Java CLI utils. Will be updated by find_native_java task
      // if needed.
      java: 'java',
      javap: 'javap',
      javac: 'javac',
      is_java_8: true,
      doppio_dir: __dirname, // Root directory for doppio (same as this file)
      build_type: "",        // Build type for doppio (dev/dev-cli/etc.) Will be set by 'setup' task.
      vendor_dir: '<%= resolve(build.doppio_dir, "vendor") %>',
      java_home_dir: '<%= resolve(build.doppio_dir, "vendor", "java_home") %>',
      jcl_dir: '<%= resolve(build.java_home_dir, "classes") %>',
      build_dir: '<%= resolve(build.doppio_dir, "build", build.build_type) %>',
      // TODO: Maybe fix this to prevent us from using too much scratch space?
      scratch_dir: path.resolve(os.tmpdir(), "jdk-download" + Math.floor(Math.random() * 100000))
    },
    make_build_dir: {
      options: { build_dir: "<%= build.build_dir %>" },
      // It's a multi-task, so you need a default target.
      default: {}
    },
    listings: {
      options: {
        output: "<%= resolve(build.build_dir, 'browser', 'listings.json') %>",
        cwd: "<%= build.build_dir %>"
      },
      default: {}
    },
    'mini-rt': {
      options: {
        output: "<%= resolve(build.build_dir, 'browser', 'mini-rt.tar') %>",
        run_class: 'classes/util/Javac',
        run_args: ["./classes/test/FileOps.java"]
      },
      default: {}
    },
    'ice-cream': {
      'release-cli': {
        files: [{
          expand: true,
          cwd: 'build/dev-cli',
          src: '+(console|src)/**/*.js',
          dest: 'build/release-cli'
        }]
      },
      release: {
        files: [{
          expand: true,
          cwd: 'build/dev',
          src: ['+(src|browser)/**/*.js', 'vendor/underscore/underscore.js', 'vendor/almond/almond.js'],
          dest: '<%= resolve(build.scratch_dir, "tmp_release") %>'
        }]
      }
    },
    launcher: {
      options: { src: '<%= resolve(build.build_dir, "console", "runner.js") %>' },
      'doppio-dev': {
        options: { dest: '<%= resolve(build.doppio_dir, "doppio-dev") %>' }
      },
      'doppio': {
        options: { dest: '<%= resolve(build.doppio_dir, "doppio") %>' }
      },
      'doppioh': {
        options: {
          src: '<%= resolve(build.build_dir, "console", "doppioh.js") %>',
          dest: '<%= resolve(build.doppio_dir, "doppioh") %>'
        }
      }
    },
    // Compiles TypeScript files.
    ts: {
      options: {
        sourcemap: true,
        comments: true,
        declaration: true
        // noImplicitAny: true
      },
      'dev-cli': {
        src: ["console/*.ts", "src/**/*.ts"],
        outDir: 'build/dev-cli',
        options: {
          module: 'commonjs',
          sourceRoot: '..'
        }
      },
      dev: {
        src: ["browser/frontend.ts", "src/**/*.ts"],
        outDir: 'build/dev',
        options: {
          module: 'amd',
          sourceRoot: '..'
        }
      }
    },
    // Downloads files.
    'curl-dir': {
      long: {
        src: 'https://github.com/plasma-umass/doppio_jcl/releases/download/v2.0/java_home.tar.gz',
        dest: "<%= build.vendor_dir %>"
      }
    },
    untar: {
      java_home: {
        files: {
          "<%= build.vendor_dir %>": "<%= resolve(build.vendor_dir, 'java_home.tar.gz') %>"
        }
      }
    },
    uglify: {
      options: {
        warnings: false,
        unsafe: true,
        compress: {
          global_defs: {
            RELEASE: true
          }
        }
      },
      'release-cli': {
        files: [{
          expand: true,
          cwd: 'build/release-cli',
          src: '+(console|src)/*.js',
          dest: 'build/release-cli'
        }]
      },
      natives: {
        files: [{
          expand: true,
          cwd: '<%= build.build_dir %>',
          src: 'src/natives/*.js',
          dest: '<%= build.build_dir %>'
        }]
      },
      'natives-browser': {
        files: [{
          expand: true,
          cwd: '<%= resolve(build.scratch_dir, "tmp_release") %>',
          src: 'src/natives/*.js',
          dest: '<%= build.build_dir %>'
        }]
      }
    },
    copy: {
      build: {
        files: [{
          expand: true,
          src: ['browser/*.svg', 'browser/*.png', 'browser/[^build]*.js',
                'browser/core_viewer/*.css', 'browser/mini-rt.tar'],
          dest: '<%= build.build_dir %>'
        }, { expand: true, flatten: true, src: ['browser/core_viewer.html', 'browser/favicon.ico'], dest: '<%= build.build_dir %>'},
        {expand: true, src: '+(browser|src)/*.ts', dest: '<%= build.build_dir %>' }]
      }
    },
    javac: {
      default: {
        files: [{
          expand: true,
          src: 'classes/+(awt|demo|doppio|test|util)/*.java'
        }]
      }
    },
    run_java: {
      default: {
        expand: true,
        src: 'classes/test/*.java',
        ext: '.runout'
      }
    },
    render: {
      dev: {
        files: [{
          expand: true,
          flatten: true,
          src: "browser/!(_)*.mustache",
          dest: "<%= build.build_dir %>",
          ext: '.html'
        }]
      },
      release: {
        options: {
          args: ["--release"]
        },
        files: [{
          expand: true,
          flatten: true,
          src: "browser/!(_)*.mustache",
          dest: "<%= build.build_dir %>",
          ext: '.html'
        }]
      }
    },
    concat: {
      default: {
        src: ['vendor/bootstrap/docs/assets/css/bootstrap.css', 'browser/style.css'],
        dest: '<%= resolve(build.build_dir, "browser/style.css") %>',
      }
    },
    coffee: {
      options: {
        sourcemap: true
      },
      dev: {
        files: {
          'build/dev/browser/core_viewer/core_viewer.js': 'browser/core_viewer/core_viewer.coffee'
        }
      },
      release: {
        files: {
          'build/release/browser/core_viewer/core_viewer.js': 'browser/core_viewer/core_viewer.coffee'
        }
      }
    },
    lineending: {
      default: {
        files: [{
          expand: true,
          src: ['classes/test/*.+(runout)']
        }]
      }
    },
    requirejs: {
      release: {
        options: {
          // Consume the ice-cream-processed files.
          baseUrl: '<%= resolve(build.scratch_dir, "tmp_release") %>',
          name: 'vendor/almond/almond',
          wrap: {
            start: '(function(){var process=BrowserFS.BFSRequire("process"),Buffer=BrowserFS.BFSRequire("buffer").Buffer;',
            end: 'window["doppio"]=require("./src/doppio");})();'
          },
          mainConfigFile: 'browser/require_config.js',
          out: 'build/release/doppio.js',
          // These aren't referenced from runtime. We may want to decouple them
          // at some point.
          include: ['src/doppio', 'src/testing'],
          optimize: 'uglify2',
          uglify2: {
            compress: {
              global_defs: {
                RELEASE: true
              }
            }
          }
        }
      },
      'release-frontend': {
        options: {
          baseUrl: 'build/dev',
          name: 'browser/frontend',
          out: 'build/release/browser/frontend.js',
          mainConfigFile: 'browser/require_config.js',
          paths: {
            'src/doppio': '../../browser/doppio_stub',
            // XXX: We only included it for type definitions, but it still
            // tries to pull it in for some reason :(
            'src/jvm': '../../browser/jvm_stub'
          }
        }
      }
    },
    unit_test: {
      default: {
        files: [{
          expand: true,
          src: 'classes/test/*.java'
        }]
      }
    },
    watch: {
      options: {
        // We *need* tasks to share the same context, as setup sets the
        // appropriate 'build' variables.
        spawn: false
      },
      // Monitors TypeScript source in browser/ and src/ folders. Rebuilds
      // CLI and browser builds.
      'ts-source': {
        files: ['+(browser|src)/*.ts'],
        tasks: [// Rebuild dev-cli
                'setup:dev-cli',
                'ts:dev-cli',
                // Rebuild release-cli
                'setup:release-cli',
                'ice-cream:release-cli',
                'uglify:release-cli',
                'uglify:natives',
                // Rebuild dev
                'setup:dev',
                'ts:dev',
                // Rebuild release
                'setup:release',
                'ice-cream:release',
                'requirejs:release',
                'requirejs:release-frontend']
      },
      'mustache-templates': {
        files: ['browser/*.mustache'],
        tasks: ['setup:dev',
                'render:dev',
                'setup:release',
                'render:release']
      },
      css: {
        files: ['browser/*.css'],
        tasks: ['setup:dev',
                'concat',
                'setup:release',
                'concat']
      },
      java: {
        files: ['classes/test/*.java'],
        tasks: ['java']
      }
    }
  });

  grunt.loadNpmTasks('grunt-ts');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-coffee');
  grunt.loadNpmTasks('grunt-contrib-requirejs');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-lineending');
  grunt.loadNpmTasks('grunt-curl');
  grunt.loadNpmTasks('grunt-untar');
  // Load our custom tasks.
  grunt.loadTasks('tasks');

  grunt.registerMultiTask('launcher', 'Creates a launcher for the given CLI release.', function() {
    var launcherPath: string, exePath: string, options = this.options();
    launcherPath = options.dest;
    exePath = options.src;

    if (!grunt.file.exists(launcherPath) && !grunt.file.exists(launcherPath + ".bat")) {
      try {
        if (process.platform.match(/win32/i)) {
          fs.writeFileSync(launcherPath + ".bat", 'node %~dp0\\' + path.relative(path.dirname(launcherPath), exePath) + ' %*');
        } else {
          // Write with mode 755.
          fs.writeFileSync(launcherPath, 'node $(dirname $0)/' + path.relative(path.dirname(launcherPath), exePath) + ' "$@"', { mode: 493 });
        }

        grunt.log.ok("Created launcher " + path.basename(launcherPath));
      } catch (e) {
        grunt.log.error("Could not create launcher " + path.basename(launcherPath) + ": " + e);
        return false;
      }
    }
  });

  grunt.registerTask('setup', "Sets up doppio's environment prior to building.", function(buildType: string) {
    if (!buildType) {
      grunt.fail.fatal("setup build task needs to know the build type.");
    }
    // (Required) Sets the build_type so other directories can resolve properly.
    grunt.config.set('build.build_type', buildType);

    // Fetch java_home files if it's missing.
    if (!grunt.file.exists(<string> grunt.config.get('build.java_home_dir'))) {
      grunt.log.writeln("Running one-time java_home setup; this could take a few minutes!");
      grunt.task.run(['curl-dir', 'untar', 'delete_jh_tar']);
    }
  });
  grunt.registerTask('java',
    ['find_native_java',
     'javac',
     'run_java',
     // Windows: Convert CRLF to LF.
     'lineending']);
  grunt.registerTask('delete_jh_tar', "Deletes java_home.tar.gz post-extraction.", function () {
    grunt.file.delete(path.resolve('vendor', 'java_home.tar.gz'));
  });

  /**
   * PUBLIC-FACING TARGETS BELOW.
   */

  grunt.registerTask('dev-cli',
    ['setup:dev-cli',
     'make_build_dir',
     'ts:dev-cli',
     'launcher:doppio-dev']);
  grunt.registerTask('release-cli',
    ['dev-cli',
     // Do setup *after* dev-cli, as it has side effects (sets 'build.build_type').
     'setup:release-cli',
     'make_build_dir',
     'ice-cream:release-cli',
     'uglify:release-cli',
     'uglify:natives',
     'launcher:doppio',
     'launcher:doppioh']);
  grunt.registerTask('dev',
    [// We need release-cli for mini-rt, and we must run it first as it mutates
     // build variables (e.g. build.build_type).
     'release-cli',
     'setup:dev',
     'java',
     'make_build_dir',
     'render:dev',
     'coffee:dev',
     'concat',
     'mini-rt',
     'copy:build',
     'listings',
     'ts:dev']);
  grunt.registerTask('release',
    ['dev',
     'setup:release',
     'make_build_dir',
     'render:release',
     'coffee:release',
     'concat',
     'mini-rt',
     'copy:build',
     'ice-cream:release',
     'uglify:natives-browser',
     'listings',
     'requirejs:release',
     'requirejs:release-frontend']);
  grunt.registerTask('test',
    ['release-cli',
     'java',
     'unit_test']);
  grunt.registerTask('clean', 'Deletes built files.', function() {
    ['build', 'doppio', 'doppio-dev', 'tscommand.tmp.txt'].concat(grunt.file.expand(['classes/*/*.+(class|runout)'])).forEach(function (path: string) {
      if (grunt.file.exists(path)) {
        grunt.file.delete(path);
      }
    });
    grunt.log.writeln('All built files have been deleted, except for Grunt-related tasks (e.g. tasks/*.js and Grunttasks.js).');
  });
};
