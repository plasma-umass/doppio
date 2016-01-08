/**
 * Contains all of doppio's grunt build tasks in TypeScript.
 */
import path = require('path');
import fs = require('fs');
import os = require('os');
import _ = require('underscore');

// Create shims.
if (!fs.existsSync('shims')) {
  fs.mkdirSync('shims');
}
['fs', 'path', 'buffer'].forEach((mod) => {
  fs.writeFileSync(`shims/${mod}.js`, `module.exports=BrowserFS.BFSRequire('${mod}');\n`, { encoding: 'utf8'});
});

var browserifyConfigFcn = function(bundle: BrowserifyObject) {
  (<any> bundle).exclude('../../../package.json');
  bundle.transform('browserify-shim', { global: true });
  // De-require after shim.
  bundle.plugin('browserify-derequire');
}, browserifyOptions = {
  builtins: _.extend({}, require('browserify/lib/builtins'), {
    'buffer': require.resolve('./shims/buffer.js'),
    'path': require.resolve('./shims/path.js'),
    'fs': require.resolve('./shims/fs.js')
  }),
  insertGlobalVars: {
    "Buffer": () => "BrowserFS.BFSRequire('buffer').Buffer",
    "process": () => "BrowserFS.BFSRequire('process')"
  },
  detectGlobals: true,
  noParse: [
    require.resolve('async')
  ],
  debug: true,
  plugin: [
    'tsify'
  ],
  standalone: "Doppio",
  // karma-browserify reads the configure property from this literal.
  // grunt-browserify reads it from a separately specified option.
  configure: browserifyConfigFcn
}, wrapConfig = function(config: (b: BrowserifyObject) => void): (b: BrowserifyObject) => void {
  // karma-browserify requires a different type of configure function.
  return function(b: BrowserifyObject): void {
    b.once('prebundle', config);
  };
},
transformConfig = function(toRemove: string[]) {
  return function(b: BrowserifyObject) {
    browserifyConfigFcn(b);
    b.transform('undebugify', {remove: toRemove});
  };
}, karmaOptions = {
  // base path, that will be used to resolve files and exclude
  basePath: '.',
  frameworks: ['browserify', 'jasmine'],
  reporters: ['progress'],
  port: 9876,
  runnerPort: 9100,
  colors: true,
  logLevel: 'INFO',
  autoWatch: true,
  browsers: ['Chrome'],
  captureTimeout: 60000,
  // Avoid hardcoding and cross-origin issues.
  proxies: {
    '/': 'http://localhost:8000/'
  },
  files: [
    'node_modules/browserfs/dist/browserfs.js',
    {pattern: 'node_modules/browserfs/dist/browserfs.js.map', included: false},
    {pattern: 'build/test-dev/**/*.js*', included: false},
    {pattern: 'build/test-release/**/*.js*', included: false},
    'tasks/test/harness.ts'
  ],
  singleRun: false,
  urlRoot: '/karma/',
  // Do not export a global var for unit tests.
  // karma-browserify will use the browserify require() function to
  // start our tests.
  browserify: _.extend({}, browserifyOptions, {
    insertGlobalVars: _.extend({}, browserifyOptions.insertGlobalVars, {
      RELEASE: () => "true"
    }),
    standalone: undefined
  }),
  browserNoActivityTimeout: 180000,
  browserDisconnectTimeout: 180000
};

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
      // Will be set by JDK download task.
      bootclasspath: null,
      build_dir: '<%= resolve(build.doppio_dir, "build", build.build_type) %>',
      // TODO: Maybe fix this to prevent us from using too much scratch space?
      scratch_dir: path.resolve(os.tmpdir(), "doppio-temp" + Math.floor(Math.random() * 100000))
    },
    make_build_dir: {
      options: { build_dir: "<%= build.build_dir %>" },
      // It's a multi-task, so you need a default target.
      default: {}
    },
    listings: {
      options: {
        output: "<%= resolve(build.build_dir, 'listings.json') %>",
        cwd: "<%= build.build_dir %>"
      },
      default: {}
    },
    includes: {
      options: {
        packages: fs.readdirSync('src/natives').filter((item: string) => item.indexOf(".ts") !== -1).map((item: string) => item.slice(0, item.indexOf('.')).replace(/_/g, '.')),
        dest: "includes",
        // The following classes are referenced by DoppioJVM code, but aren't
        // referenced by any JVM classes directly for some reason.
        force: ['java.nio.file.NoSuchFileException', 'java.nio.file.FileAlreadyExistsException', 'sun.nio.fs.UnixConstants', 'sun.nio.fs.DefaultFileSystemProvider', 'sun.nio.fs.UnixException', 'java.lang.ExceptionInInitializerError', 'java.nio.charset.Charset$3', 'java.lang.invoke.MethodHandleNatives$Constants', 'java.lang.reflect.InvocationTargetException', 'java.nio.DirectByteBuffer', 'java.security.PrivilegedActionException'],
        headersOnly: true
      },
      default: {}
    },
    'ice-cream': {
      'release-cli': {
        options: {
          remove: ['assert', 'trace', 'vtrace', 'debug']
        },
        files: [{
          expand: true,
          cwd: 'build/dev-cli',
          src: '+(console|src)/**/*.js',
          dest: '<%= resolve(build.scratch_dir, "tmp_release") %>'
        }]
      },
      'fast-dev-cli': {
        options: {
          remove: ['debug', 'trace', 'vtrace']
        },
        files: [{
          expand: true,
          cwd: 'build/dev-cli',
          src: '+(console|src)/**/*.js',
          dest: 'build/fast-dev-cli'
        }]
      }
    },
    launcher: {
      options: { src: '<%= resolve(build.build_dir, "console", "runner.js") %>' },
      'doppio-dev': {
        options: { dest: '<%= resolve(build.doppio_dir, "doppio-dev") %>' }
      },
      'doppio-fast-dev': {
        options: { dest: '<%= resolve(build.doppio_dir, "doppio-fast-dev") %>' }
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
        sourceMap: true,
        comments: true,
        declaration: true,
        target: 'es3',
        noImplicitAny: true,
        inlineSourceMap: true,
        inlineSources: true
      },
      'dev-cli': {
        src: ["console/*.ts", "src/**/*.ts", "typings/tsd.d.ts"],
        outDir: 'build/dev-cli',
        options: {
          module: 'commonjs'
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
        },
        sourceMap: true,
        sourceMapIncludeSources: true
      },
      'release-cli': {
        files: [{
          expand: true,
          cwd: '<%= resolve(build.scratch_dir, "tmp_release") %>',
          src: '+(console|src)/*.js',
          dest: 'build/release-cli'
        }]
      },
      natives: {
        files: [{
          expand: true,
          cwd: '<%= resolve(build.scratch_dir, "tmp_release") %>',
          src: 'src/natives/*.js',
          dest: '<%= build.build_dir %>'
        }]
      },
      'release': {
        options: {
          sourceMapIn: 'build/release/doppio.js.map'
        },
        files: [{
          src: 'build/release/doppio.js',
          dest: 'build/release/doppio.js'
        }]
      }
    },
    copy: {
      dist: {
        files: [{
          expand: true,
          cwd: "build",
          src: ["*/!(vendor)/**/*.js*", "*/*.js*"],
          dest: "dist"
        }, {
          expand: true,
          cwd: "build/dev-cli",
          src: "**/*.d.ts",
          dest: "dist/typings"
        }]
      },
      includes: {
        files: [{
          expand: true,
          src: "includes/*",
          dest: "<%= build.build_dir %>"
        }]
      },
      'dev-natives': {
        files: [{
          expand: true,
          cwd: 'build/dev-cli/src',
          src: 'natives/*.js*',
          dest: 'build/dev'
        }]
      },
      'fast-dev-natives': {
        files: [{
          expand: true,
          cwd: 'build/fast-dev-cli/src',
          src: 'natives/*.js*',
          dest: 'build/fast-dev'
        }]
      },
      'release-natives': {
        files: [{
          expand: true,
          cwd: 'build/release-cli/src',
          src: 'natives/*.js*',
          dest: 'build/release'
        }]
      }
    },
    exorcise: {
      release: {
        options: {
          strict: true // fail the build if doppio.js does not have a source map.
        },
        files: {
          'build/release/doppio.js.map': ['build/release/doppio.js'],
        }
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
    lineending: {
      default: {
        files: [{
          expand: true,
          src: ['classes/test/*.+(runout)']
        }]
      }
    },
    browserify: {
      'dev': {
        options: {
          browserifyOptions: browserifyOptions,
          configure: browserifyConfigFcn
        },
        files: {
          './build/dev/doppio.js': './src/index.ts'
        }
      },
      'fast-dev': {
        options: {
          browserifyOptions: browserifyOptions,
          configure: transformConfig(['debug', 'trace', 'vtrace'])
        },
        files: {
          './build/fast-dev/doppio.js': './src/index.ts'
        }
      },
      'release': {
        options: {
          browserifyOptions: browserifyOptions,
          configure: transformConfig(['debug', 'trace', 'vtrace', 'assert'])
        },
        files: {
          './build/release/doppio.js': './src/index.ts'
        }
      },
      'test-dev': {
        options: {
          browserifyOptions: browserifyOptions,
          configure: browserifyConfigFcn
        },
        files: {
          './build/test-dev/harness_webworker.js': './tasks/test/harness_webworker.ts'
        }
      },
      'test-release': {
        options: {
          browserifyOptions: _.extend({}, browserifyOptions, {
            insertGlobalVars: _.extend({}, browserifyOptions.insertGlobalVars, {
              RELEASE: () => 'true'
            })
          }),
          configure: transformConfig(['debug', 'trace', 'vtrace', 'assert'])
        },
        files: {
          './build/test-release/harness_webworker.js': './tasks/test/harness_webworker.ts'
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
    connect: {
      server: {
        options: {
          keepalive: false
        }
      }
    },
    karma: {
      options: karmaOptions,
      test: {
        options: {
          preprocessors: {
            'tasks/test/harness.ts': ['browserify']
          },
          browserify: _.extend({}, karmaOptions.browserify, {
            configure: wrapConfig(transformConfig(['debug', 'trace', 'vtrace', 'assert']))
          })
        }
      },
      'test-dev': {
        options: {
          preprocessors: {
            'tasks/test/harness.ts': ['browserify']
          },
          browserify: _.extend({}, karmaOptions.browserify, {
            configure: wrapConfig(karmaOptions.browserify.configure)
          })
        }
      }
    },
    "merge-source-maps": {
      "build": {
        options: {
          inlineSources: true,
          inlineSourceMap: true
        },
        files: [
          {
            expand: true,
            cwd: "<%= build.build_dir %>",
            // Ignore vendor files!
            src: ['./*.js', 'src/**/*.js', 'console/**/*.js'],
            dest: "<%= build.build_dir %>",
            ext: '.js.map'
          }
        ]
      }
    }
  });

  grunt.loadNpmTasks('grunt-ts');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-connect');
  grunt.loadNpmTasks('grunt-karma');
  grunt.loadNpmTasks('grunt-lineending');
  grunt.loadNpmTasks('grunt-merge-source-maps');
  grunt.loadNpmTasks('grunt-browserify');
  grunt.loadNpmTasks('grunt-exorcise');
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

  grunt.registerTask("check_jdk", "Checks the status of the JDK. Downloads if needed.", function() {
    let done: (status?: boolean) => void = this.async();
    let child = grunt.util.spawn({
      cmd: 'node',
      args: ['build/dev-cli/console/download_jdk.js']
    }, (err, result, code) => {
      if (code === 0) {
        let JDKInfo = require('./vendor/java_home/jdk.json');
        grunt.config.set("build.bootclasspath",
          JDKInfo.classpath.map((item: string) =>
            path.resolve(grunt.config.get<string>("build.java_home_dir"), item)).join(":"));
      }
      done(code === 0);
    });
    (<NodeJS.ReadableStream> (<any> child).stdout).on('data', function(d: Buffer) {
      grunt.log.write(d.toString());
    });
  });

  grunt.registerTask('setup', "Sets up doppio's environment prior to building.", function(buildType: string) {
    if (!buildType) {
      grunt.fail.fatal("setup build task needs to know the build type.");
    }
    // (Required) Sets the build_type so other directories can resolve properly.
    grunt.config.set('build.build_type', buildType);
  });
  grunt.registerTask("includecheck", "Checks if includes need to be generated.", function() {
    if (!grunt.file.exists("includes/JVMTypes.d.ts")) {
      // Ignore dev-cli compilation errors if the JVMTypes aren't defined yet.
      grunt.config.set('ts.options.failOnTypeErrors', false);
      grunt.task.run(['ts:dev-cli', 'check_jdk', 'java', 'includes:default', 'enable_type_errors']);
    } else if (!grunt.file.exists("vendor/java_home/jdk.json")) {
      // Ignore dev-cli compilation errors if jdk.json isn't defined yet.
      grunt.config.set('ts.options.failOnTypeErrors', false);
      grunt.task.run(['ts:dev-cli', 'check_jdk', 'java', 'enable_type_errors']);
    }
  });
  grunt.registerTask("enable_type_errors", "Enables TypeScript type errors after include file generation.", function() {
    grunt.config.set('ts.options.failOnTypeErrors', true);
  });
  grunt.registerTask('java',
    ['find_native_java',
     'javac',
     'run_java',
     // Windows: Convert CRLF to LF.
     'lineending']);
  grunt.registerTask('clean_dist', "Deletes the dist and build directories.", function() {
    ['dist', 'build'].forEach((p: string) => {
      if (grunt.file.exists(p)) {
        grunt.file.delete(p);
      }
    });
  });
  grunt.registerTask('clean_natives', "Deletes already-inlined sourcemaps from natives.", function() {
    let done: (success?: boolean) => void = this.async();
    grunt.file.glob("build/*/src/natives/*.js.map", (err: Error, files: string[]) => {
      if (err) {
        grunt.log.error("" + err);
        return done(false);
      }
      grunt.file.glob("build/*/natives/*.js.map", (err: Error, files2: string[]) => {
        if (err) {
          grunt.log.error("" + err);
          return done(false);
        }
        files.concat(files2).forEach((file) => grunt.file.delete(file));
        done(true);
      });
    });
  });

  /**
   * PUBLIC-FACING TARGETS BELOW.
   */

  grunt.registerTask('dev-cli',
    ['setup:dev-cli',
     'make_build_dir',
     'includecheck',
     'ts:dev-cli',
     'copy:includes',
     'check_jdk',
     'launcher:doppio-dev']);
  grunt.registerTask('fast-dev-cli',
    ['dev-cli',
     'setup:fast-dev-cli',
     'make_build_dir',
     'ice-cream:fast-dev-cli',
     'merge-source-maps:build',
     'launcher:doppio-fast-dev']);
  grunt.registerTask('release-cli',
    ['dev-cli',
     // Do setup *after* dev-cli, as it has side effects (sets 'build.build_type').
     'setup:release-cli',
     'make_build_dir',
     'ice-cream:release-cli',
     'uglify:release-cli',
     'uglify:natives',
     'merge-source-maps:build',
     'launcher:doppio',
     'launcher:doppioh']);
  grunt.registerTask('dev',
    ['dev-cli',
     'setup:dev',
     'java',
     'make_build_dir',
     'browserify:dev',
     'copy:dev-natives',
     'listings']);
  grunt.registerTask('fast-dev',
    ['fast-dev-cli',
     'setup:fast-dev',
     'make_build_dir',
     'browserify:fast-dev',
     'copy:fast-dev-natives',
     'listings']);
  grunt.registerTask('release',
    ['release-cli',
     'setup:release',
     'make_build_dir',
     'browserify:release',
     'exorcise:release',
     'uglify:release',
     'copy:release-natives',
     'listings']);
  grunt.registerTask('dist',
    [
      'clean_dist', 'release', 'fast-dev', 'dev', 'clean_natives', 'copy:dist'
    ]);
  grunt.registerTask('test',
    ['release-cli',
     'java',
     'unit_test']);
  grunt.registerTask('test-browser',
    ['release',
     'java',
     'listings',
     'connect:server',
     'browserify:test-release',
     'karma:test']);
 grunt.registerTask('test-dev-browser',
     ['dev',
      'java',
      'listings',
      'connect:server',
      'browserify:test-dev',
      'karma:test-dev']);
  grunt.registerTask('clean', 'Deletes built files.', function() {
    ['build', 'doppio', 'doppio-dev'].concat(grunt.file.expand(['tscommand*.txt'])).concat(grunt.file.expand(['classes/*/*.+(class|runout)'])).forEach(function (path: string) {
      if (grunt.file.exists(path)) {
        grunt.file.delete(path);
      }
    });
    grunt.log.writeln('All built files have been deleted, except for Grunt-related tasks (e.g. tasks/*.js and Grunttasks.js).');
  });
  grunt.registerTask('test-browser-travis', 'Tests DoppioJVM in the browser in Travis.', function() {
    // Only test in Firefox.
    karmaOptions.browsers = ['Firefox'];
    karmaOptions.singleRun = true;
    grunt.task.run(['test-browser']);
  });
};
