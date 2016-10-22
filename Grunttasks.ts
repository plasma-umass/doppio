/**
 * Contains all of doppio's grunt build tasks in TypeScript.
 */
import path = require('path');
import fs = require('fs');
import os = require('os');
import _ = require('underscore');
import webpack = require('webpack');
import karma = require('karma');
import async = require('async');
import express = require('express');
import bodyParser = require('body-parser');
import glob = require('glob');

/**
 * Returns a webpack configuration for testing a particular DoppioJVM build.
 */
function getWebpackTestConfig(target: string, optimize = false, benchmark = false): webpack.Configuration {
  const config = getWebpackConfig(target, optimize);
  const entries: {[name: string]: string} = {};
  if (!benchmark) {
    // Worker and non-worker entries.
    entries[`test-${target}/harness`] = path.resolve(__dirname, `build/scratch/test/${target}/tasks/test/harness`);
    entries[`test-${target}/harness_webworker`] = path.resolve(__dirname, `build/scratch/test/${target}/tasks/test/harness_webworker`);
  } else {
    entries[`${target}/benchmark_harness`] = path.resolve(__dirname, `build/scratch/test/release/tasks/test/benchmark_harness`);
  }
  // Change entries.
  config.entry = entries;
  // No longer a UMD module, so change external configuration.
  (<any> config.externals)['browserfs'] = 'BrowserFS';
  // Test config should run immediately; it is not a library.
  delete config.output.libraryTarget;
  delete config.output.library;
  return config;
}

/**
 * Returns a webpack configuration file for the given compilation target
 * @param target release, dev, or fast-dev
 */
function getWebpackConfig(target: string, optimize: boolean = false): webpack.Configuration {
  const output = `${target}/doppio`, entry = path.resolve(__dirname, `build/${target}-cli/src/index`);
  const entries: {[name: string]: string} = {};
  entries[output] = entry;
  const config: webpack.Configuration = {
    entry: entries,
    devtool: "source-map",
    output: {
      path: path.join(__dirname, 'build'),
      filename: '[name].js',
      libraryTarget: 'umd',
      library: <any> 'Doppio'
    },
    resolve: {
      extensions: ['', '.js', '.json'],
      // Use our versions of Node modules.
      alias: {
        'buffer': require.resolve('browserfs/dist/shims/buffer'),
        'fs': require.resolve('browserfs/dist/shims/fs'),
        'path': require.resolve('browserfs/dist/shims/path'),
        'BFSBuffer': require.resolve('browserfs/dist/shims/bufferGlobal'),
        'process': require.resolve('browserfs/dist/shims/process')
      }
    },
    externals: <any> {
      'browserfs': {
        root: 'BrowserFS',
        commonjs2: 'browserfs',
        commonjs: 'browserfs',
        amd: 'browserfs'
      }
    },
    plugins: [
      new webpack.ProvidePlugin({
        Buffer: 'BFSBuffer',
        process: 'process'
      }),
      // Hack to fix relative paths of JSON includes.
      new webpack.NormalModuleReplacementPlugin(/\.json$/, <any> function(requireReq: {request: string}) {
        const request = requireReq.request;
        switch (path.basename(request)) {
          case 'jdk.json':
            requireReq.request = path.resolve(__dirname, 'vendor', 'java_home', 'jdk.json');
            break;
          case 'package.json':
            requireReq.request = path.resolve(__dirname, 'package.json');
            break;
          case 'benchmarks.json':
            requireReq.request = path.resolve(__dirname, 'vendor', 'benchmarks', 'benchmarks.json');
            break;
        }
      })
    ],
    node: {
      process: false,
      Buffer: false,
      setImmediate: false
    },
    target: "web",
    module: {
      // Load source maps for any relevant files.
      preLoaders: [
        {
          test: /\.js$/,
          loader: "source-map-loader"
        }
      ],
      loaders: [
        { test: /\.json$/, loader: 'json-loader' }
      ]
    }
  }
  if (optimize) {
    config.plugins.push(new webpack.optimize.UglifyJsPlugin(<any> {
      compress: {
        warnings: false,
        unsafe: true,
        screw_ie8: false
      },
      mangle: {
        screw_ie8: false
      },
      output: {
        screw_ie8: false
      },
      sourceMap: true
    }));
  }

  return config;
}

/**
 * Returns a Karma configuration file for the given compilation target
 * @param target release, dev, or fast-dev
 */
function getKarmaConfig(target: string, singleRun = false, browsers = ['Chrome']): karma.ConfigOptions {
  return <any> {
    // base path, that will be used to resolve files and exclude
    basePath: '.',
    frameworks: ['jasmine'],
    reporters: ['progress'],
    port: 9876,
    //runnerPort: 9100,
    colors: true,
    logLevel: 'INFO',
    autoWatch: true,
    browsers: browsers,
    captureTimeout: 60000,
    concurrency: 1,
    // Avoid hardcoding and cross-origin issues.
    proxies: {
      '/': 'http://localhost:8000/'
    },
    files: [
      'node_modules/browserfs/dist/browserfs.js',
      {pattern: 'node_modules/browserfs/dist/browserfs.js.map', included: false},
      {pattern: `build/test-${target}/**/*.js*`, included: false},
      `build/test-${target}/harness.js`
    ],
    singleRun: singleRun,
    urlRoot: '/karma/',
    browserNoActivityTimeout: 180000,
    browserDisconnectTimeout: 180000
  };
}

export function setup(grunt: IGrunt) {
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    // doppio build configuration
    build: {
      // Path to Java CLI utils. Will be updated by find_native_java task
      // if needed.
      java: 'java',
      javap: 'javap',
      javac: 'javac',
      is_java_8: true,
      // Will be set by JDK download task.
      bootclasspath: null
    },
    make_build_dir: {
      options: { base: path.resolve(__dirname, 'build') },
      // It's a multi-task, so you need a default target.
      default: {}
    },
    listings: {
    },
    includes: {
      options: {
        packages: fs.readdirSync('src/natives')
          .filter((item: string) => item.indexOf(".ts") !== -1)
          .map((item: string) => item.slice(0, item.indexOf('.')).replace(/_/g, '.')),
        dest: "includes",
        // The following classes are referenced by DoppioJVM code, but aren't
        // referenced by any JVM classes directly for some reason.
        force: [
          'java.nio.file.NoSuchFileException',
          'java.nio.file.FileAlreadyExistsException',
          'sun.nio.fs.UnixConstants',
          'sun.nio.fs.DefaultFileSystemProvider',
          'sun.nio.fs.UnixException',
          'java.lang.ExceptionInInitializerError',
          'java.nio.charset.Charset$3',
          'java.lang.invoke.MethodHandleNatives$Constants',
          'java.lang.reflect.InvocationTargetException',
          'java.nio.DirectByteBuffer',
          'java.security.PrivilegedActionException',
          'java.security.ProviderException',
          'doppio.security.DoppioProvider'],
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
          dest: 'build/scratch/ice-cream/release-cli'
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
      },
      'test-release': {
        options: {
          remove: ['assert', 'trace', 'vtrace', 'debug']
        },
        files: [{
          expand: true,
          cwd: 'build/scratch/test/dev',
          src: '+(console|src|tasks)/**/*.js',
          dest: 'build/scratch/ice-cream/test-release'
        }]
      },
      'test-fast-dev': {
        options: {
          remove: ['debug', 'trace', 'vtrace']
        },
        files: [{
          expand: true,
          cwd: 'build/scratch/test/dev',
          src: '+(console|src|tasks)/**/*.js',
          dest: 'build/scratch/test/fast-dev'
        }]
      }
    },
    launcher: {
      'doppio-dev': {
        options: {
          src: path.resolve(__dirname, 'build', 'dev-cli', 'console', 'runner.js'),
          dest: path.resolve(__dirname, 'doppio-dev')
        }
      },
      'doppio-fast-dev': {
        options: {
          src: path.resolve(__dirname, 'build', 'fast-dev-cli', 'console', 'runner.js'),
          dest: path.resolve(__dirname, 'doppio-fast-dev')
        }
      },
      'doppio': {
        options: {
          src: path.resolve(__dirname, 'build', 'release-cli', 'console', 'runner.js'),
          dest: path.resolve(__dirname, 'doppio')
        }
      },
      'doppioh': {
        options: {
          src: path.resolve(__dirname, 'build', 'release-cli', 'console', 'doppioh.js'),
          dest: path.resolve(__dirname, 'doppioh')
        }
      }
    },
    // Compiles TypeScript files.
    ts: {
      options: {
        comments: true,
        declaration: true,
        target: 'es3',
        noImplicitAny: true,
        inlineSourceMap: true,
        inlineSources: true,
        fast: 'watch'
      },
      'dev-cli': {
        src: ["console/*.ts", "src/**/*.ts", "typings/index.d.ts"],
        outDir: 'build/dev-cli',
        options: {
          module: 'commonjs'
        }
      },
      'test': {
        src: ["console/*.ts", "src/**/*.ts", "typings/index.d.ts", 'tasks/test/*.ts'],
        outDir: 'build/scratch/test/dev',
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
          },
          screw_ie8: false
        },
        mangle: {
          screw_ie8: false
        },
        output: {
          screw_ie8: false
        },
        sourceMap: true,
        sourceMapIncludeSources: true
      },
      'release-cli': {
        files: [{
          expand: true,
          cwd: path.resolve(__dirname, 'build', 'scratch', 'ice-cream', 'release-cli'),
          src: '+(console|src)/**/*.js',
          dest: path.resolve(__dirname, 'build', 'release-cli')
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
      },
      'test-release': {
        files: [{
          expand: true,
          cwd: path.resolve(__dirname, 'build', 'scratch', 'ice-cream', 'test-release'),
          src: '+(console|src|tasks)/**/*.js',
          dest: path.resolve(__dirname, 'build', 'scratch', 'test', 'release')
        }]
      }
    },
    copy: {
      dist: {
        files: [{
          expand: true,
          cwd: "build",
          src: ["+(dev|dev-cli|release|release-cli|fast-dev|fast-dev-cli)/!(vendor)/**/*.js*", "+(dev|dev-cli|release|release-cli|fast-dev|fast-dev-cli)/*.js*"],
          dest: "dist"
        }, {
          expand: true,
          cwd: "build/dev-cli",
          src: "**/*.d.ts",
          dest: "dist/typings"
        }, {
          expand: true,
          src: "includes/**/*.d.ts",
          dest: "dist/typings"
        }, {
          expand: true,
          cwd: 'vendor/java_home/lib',
          src: 'doppio.jar',
          dest: 'dist'
        }]
      },
      'examples': {
        files: [{
          expand: true,
          cwd: "build/release",
          src: ["*.js", "*.js.map", "natives/**/*.js*", "vendor/**/*"],
          dest: "docs/examples/doppio"
        }, {
          expand: true,
          flatten: true,
          cwd: ".",
          src: "node_modules/browserfs/dist/browserfs.min.*",
          dest: "docs/examples/doppio"
        }]
      }
    },
    javac: {
      default: {
        files: [{
          expand: true,
          src: ['classes/+(awt|demo|test|util)/*.java', 'classes/doppio/**/*.java'],
          ext: '.class'
        }]
      },
      examples: {
        files: [{
          expand: true,
          src: 'docs/examples/example/**/*.java',
          ext: '.class'
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
    compress: {
      doppio: {
        options: {
          archive: 'vendor/java_home/lib/doppio.jar',
          mode: 'zip',
          level: 0
        },
        files: [
          { expand: true, cwd: 'classes/', src: 'doppio/**/*.class', dest: ''}
        ]
      }
    },
    lineending: {
      options: {
        eol: 'lf'
      },
      default: {
        files: [{
          expand: true,
          src: ['classes/test/*.runout']
        }]
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
      },
      examples: {
        options: {
          base: 'docs/examples',
          keepalive: true
        }
      }
    },
    karma: {
      'fast-dev': {
        options: getKarmaConfig('fast-dev')
      },
      release: {
        options: getKarmaConfig('release')
      },
      dev: {
        options: getKarmaConfig('dev')
      },
      travis: {
        options: getKarmaConfig('release', true, ['Firefox'])
      },
      appveyor: {
        options: getKarmaConfig('release', true, ['Firefox', 'Chrome', 'IE'])
      }
    },
    webpack: {
      dev: getWebpackConfig('dev'),
      'fast-dev': getWebpackConfig('fast-dev'),
      release: getWebpackConfig('release', true),
      'test-dev': getWebpackTestConfig('dev'),
      'test-fast-dev': getWebpackTestConfig('fast-dev'),
      'test-release': getWebpackTestConfig('release', true),
      'benchmark': getWebpackTestConfig('benchmark', true, true)
    },
    "merge-source-maps": {
      options: {
        inlineSources: true,
        inlineSourceMaps: true
      },
      "release-cli": {
        files: [
          {
            expand: true,
            cwd: "build/release-cli",
            // Ignore vendor files!
            src: ['./*.js', 'src/**/*.js', 'console/**/*.js'],
            dest: "build/release-cli",
            ext: '.js.map'
          }
        ]
      },
      "fast-dev-cli": {
        files: [
          {
            expand: true,
            cwd: "build/fast-dev-cli",
            // Ignore vendor files!
            src: ['./*.js', 'src/**/*.js', 'console/**/*.js'],
            dest: "build/fast-dev-cli",
            ext: '.js.map'
          }
        ]
      },
      "test-fast-dev": {
        files: [
          {
            expand: true,
            cwd: "build/scratch/test/fast-dev",
            // Ignore vendor files!
            src: ['./*.js', 'src/**/*.js', 'console/**/*.js', 'tasks/**/*.js'],
            dest: "build/scratch/test/fast-dev",
            ext: '.js.map'
          }
        ]
      },
      "test-release": {
        files: [
          {
            expand: true,
            cwd: "build/scratch/test/release",
            // Ignore vendor files!
            src: ['./*.js', 'src/**/*.js', 'console/**/*.js', 'tasks/**/*.js'],
            dest: "build/scratch/test/release",
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
  grunt.loadNpmTasks('grunt-webpack');
  grunt.loadNpmTasks('grunt-newer');
  grunt.loadNpmTasks('grunt-contrib-compress');
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
            path.resolve(path.join(__dirname, 'vendor', 'java_home'), item).replace(/\\/g, '/')).join(path.delimiter));
      }
      done(code === 0);
    });
    (<NodeJS.ReadableStream> (<any> child).stdout).on('data', function(d: Buffer) {
      grunt.log.write(d.toString());
    });
  });

  grunt.registerTask("bootstrap", "Bootstraps DoppioJVM, if needed, by generating includes and downloading the JDK.", function() {
    const downloadScriptExists = grunt.file.exists("build/dev-cli/console/download_jdk.js");
    const includeExists = grunt.file.exists('includes/JVMTypes.d.ts');
    let tasks = ['check_jdk', 'java'];
    if (!downloadScriptExists || !includeExists) {
      // Awkward bootstrapping:
      // Need to build DoppioJVM before we can check if a new JDK is needed.
      tasks.unshift('ts:dev-cli');
      if (!includeExists) {
        // Tell Grunt to ignore these errors; we'll compile it a second time
        // once bootstrapped to catch any valid errors.
        grunt.config.set('ts.options.failOnTypeErrors', false);
        // Disable the grunt-ts cache for this compilation. Otherwise, it may
        // cache a problematic compile and will not error when we go to build
        // the app with error checking turned on.
        grunt.config.set('ts.options.fast', 'never');
        // Generate includes, then re-enable type errors.
        tasks.push('includes:default', 'enable_type_errors');
      }
    }
    grunt.task.run(tasks);
  });
  grunt.registerTask("enable_type_errors", "Enables TypeScript type errors after bootstrapping.", function() {
    grunt.config.set('ts.options.failOnTypeErrors', true);
    grunt.config.set('ts.options.fast', 'watch');
  });
  grunt.registerTask('generate_doppio_jar', 'Only generates doppio.jar if input classes have changed.', function() {
    if (!fs.existsSync('vendor/java_home/lib/doppio.jar')) {
      grunt.task.run('compress:doppio');
    } else {
      const zipModified = fs.statSync('vendor/java_home/lib/doppio.jar').mtime;
      const filesModified = glob.sync('classes/doppio/**/*.java').map((file) => fs.statSync(file).mtime).filter((modTime) => modTime > zipModified);
      if (filesModified.length > 0) {
        grunt.task.run('compress:doppio');
      }
    }
  });
  // Convenience task that combines several Java-related tasks.
  grunt.registerTask('java',
    ['find_native_java',
     'newer:javac',
     'generate_doppio_jar',
     'newer:run_java',
     // Windows: Convert CRLF to LF.
     'newer:lineending']);
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

  function benchmarkLocally(command: string, intOnly: boolean, outFile: string, done: (e?: Error) => void): void {
    const benchmarks = require('./vendor/benchmarks/benchmarks.json');
    const benchmarkNames = Object.keys(benchmarks);
    const curdir = process.cwd();
    const bmDir = path.resolve('vendor/benchmarks');
    const results: {[name: string]: number} = {};
    async.eachSeries(benchmarkNames, (benchmarkName: string, done: (e?: Error) => void) => {
      console.log(benchmarkName);
      const bm = benchmarks[benchmarkName];
      process.chdir(bmDir);
      if (bm.cwd) {
        process.chdir(bm.cwd);
      }
      const start = process.hrtime();
      let args = bm.args;
      if (intOnly) {
        args = ["-Xint"].concat(args);
      }
      grunt.util.spawn({
        cmd: command,
        args: args
        /*opts: {
          stdio: "inherit"
        }*/
      }, (err, result, code) => {
        if (err || code !== 0) {
          done(new Error("Benchmark failed."));
        } else {
          const time = process.hrtime(start);
          // Convert to ms.
          const timeMs = ((time[0] * 1000) + (time[1]/1000000))|0;
          results[benchmarkName] = timeMs;
          console.log(`${timeMs} ms`);
          done();
        }
      });
    }, (err?: Error) => {
      process.chdir(curdir);
      if (!err) {
        grunt.file.write(outFile, JSON.stringify(results));
        grunt.log.ok(`Wrote benchmark results to ${outFile}.`);
      }
      done(err);
    });
  }

  grunt.registerTask('run-benchmark-native-java', 'Runs benchmarks locally', function() {
    benchmarkLocally(grunt.config.get<string>("build.java"), true, path.resolve(__dirname, 'native_java.json'), this.async());
  });
  grunt.registerTask('run-benchmark-node', 'Runs benchmarks in DoppioJVM in node.', function() {
    const done = this.async();
    grunt.log.writeln(">>> Running with JIT. <<<");
    benchmarkLocally(path.resolve(__dirname, 'doppio'), false, path.join(__dirname, 'node.json'), (e) => {
      if (e) {
        return done(e);
      }
      grunt.log.writeln(">>> Running without JIT. <<<");
      benchmarkLocally(path.resolve(__dirname, 'doppio'), true, path.join(__dirname, 'node-int.json'), done);
    });
  });
  grunt.registerTask('benchmark-node', ['release-cli', 'run-benchmark-node']);
  grunt.registerTask("benchmark-native", ["java", "run-benchmark-native-java"]);
  grunt.registerTask("benchmark-browser",
    ['build-test-release',
     'make_build_dir:benchmark',
     'webpack:benchmark',
     'listings:benchmark',
     'benchmark-browser-server']);
  grunt.registerTask("benchmark-browser-server", 'Runs an HTTP server for serving up benchmarks.', function() {
    const done = this.async();
    const app = express();
    app.use(bodyParser.json());
    app.use(express.static('.'));
    app.put('/results/:name', function(req, res) {
      const data = req.body;
      grunt.log.ok(`Creating ${req.params.name}...`);
      fs.writeFileSync(req.params.name, JSON.stringify(data));
      res.end();
    });
    app.put('/done', function(req, res) {
      grunt.log.ok("Your browser has informed us that it has completed running benchmarks.");
      res.end();
    });
    app.get('/', function(req, res) {
      res.set('Content-Type', 'text/html');
      res.send(`<!doctype html>
<html>
  <script type="text/javascript" src="node_modules/browserfs/dist/browserfs.min.js"></script>
  <script type="text/javascript" src="build/benchmark/benchmark_harness.js"></script>
</html>`);
    });
    app.listen(3000, 'localhost', function() {
      console.log("Visit http://localhost:3000 to run benchmarks in your browser.")
    })
  });

  /**
   * PUBLIC-FACING TARGETS BELOW.
   */

  grunt.registerTask('dev-cli',
    ['make_build_dir:dev-cli',
     'bootstrap',
     'ts:dev-cli',
     'launcher:doppio-dev']);
  grunt.registerTask('fast-dev-cli',
    ['dev-cli',
     'make_build_dir:fast-dev-cli',
     'newer:ice-cream:fast-dev-cli',
     'merge-source-maps:fast-dev-cli',
     'launcher:doppio-fast-dev']);
  grunt.registerTask('release-cli',
    ['dev-cli',
     'make_build_dir:release-cli',
     'newer:ice-cream:release-cli',
     'newer:uglify:release-cli',
     'merge-source-maps:release-cli',
     'launcher:doppio',
     'launcher:doppioh']);
  grunt.registerTask('dev',
    ['dev-cli',
     'make_build_dir:dev',
     'webpack:dev',
     'listings:dev']);
  grunt.registerTask('fast-dev',
    ['fast-dev-cli',
     'make_build_dir:fast-dev',
     'webpack:fast-dev',
     'listings:fast-dev']);
  grunt.registerTask('release',
    ['release-cli',
     'make_build_dir:release',
     'webpack:release',
     'listings:release']);

  grunt.registerTask('examples',
    ['release',
     'newer:javac:examples',
     'copy:examples',
     'listings:examples',
     "connect:examples"
    ]);

  grunt.registerTask('dist',
    [
      'clean', 'release', 'fast-dev', 'dev', 'clean_natives', 'copy:dist'
    ]);
  grunt.registerTask('test',
    ['release-cli',
     'unit_test']);
  grunt.registerTask('build-test-dev',
    [
      'make_build_dir:dev-cli',
      'bootstrap',
      'ts:test'
    ]);
  grunt.registerTask('build-test-fast-dev',
    [
      'build-test-dev',
      'ice-cream:test-fast-dev',
      'merge-source-maps:test-fast-dev'
    ]);
  grunt.registerTask('build-test-release',
    [
      'build-test-dev',
      'ice-cream:test-release',
      'uglify:test-release',
      'merge-source-maps:test-release'
    ]);
  grunt.registerTask('test-browser',
    ['build-test-release',
     'make_build_dir:test-release',
     'webpack:test-release',
     'listings:test-release',
     'connect:server',
     'karma:release']);
  grunt.registerTask('test-browser-fast-dev',
    ['build-test-fast-dev',
     'make_build_dir:test-fast-dev',
     'webpack:test-fast-dev',
     'listings:test-fast-dev',
     'connect:server',
     'karma:fast-dev']);
 grunt.registerTask('test-browser-dev',
     ['build-test-dev',
      'make_build_dir:test-dev',
      'webpack:test-dev',
      'listings:test-dev',
      'connect:server',
      'karma:dev']);
  grunt.registerTask('clean', 'Deletes built files.', function() {
    ['includes', 'dist', 'build', 'doppio', 'doppio-dev'].concat(grunt.file.expand(['tscommand*.txt'])).concat(grunt.file.expand(['classes/*/*.+(class|runout)'])).forEach(function (path: string) {
      if (grunt.file.exists(path)) {
        grunt.file.delete(path);
      }
    });
    grunt.log.writeln('All built files have been deleted, except for Grunt-related tasks (e.g. tasks/*.js and Grunttasks.js).');
  });
  grunt.registerTask('test-browser-travis',
    ['build-test-release',
     'make_build_dir:test-release',
     'webpack:test-release',
     'listings:test-release',
     'connect:server',
     'karma:travis']);
  grunt.registerTask('test-browser-appveyor',
    ['build-test-release',
     'make_build_dir:test-release',
     'webpack:test-release',
     'listings:test-release',
     'connect:server',
     'karma:appveyor']);
};
