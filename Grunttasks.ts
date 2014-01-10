/// <reference path="vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/**
 * Contains all of doppio's grunt build tasks in TypeScript.
 */
import path = require('path');
import fs = require('fs');
import child_process = require('child_process');
import os = require('os');
import url = require('url');
var exec = child_process.exec,
    NUM_CPUS = os.cpus().length,
    DOWNLOAD_DIR: string = "/var/folders/_f/gq2b3cyd3qv8r4dl642488w80000gq/T/jdk-download84508",//path.resolve(os.tmpDir(), "jdk-download" + Math.floor(Math.random()*100000)),
    DEBS_DOMAIN: string = "http://security.ubuntu.com/ubuntu/pool/main/o/openjdk-6/",
    DEBS: string[] = [
        "openjdk-6-jre-headless_6b27-1.12.6-1ubuntu0.12.04.4_i386.deb",
        "openjdk-6-jdk_6b27-1.12.6-1ubuntu0.12.04.4_i386.deb",
        "openjdk-6-jre-lib_6b27-1.12.6-1ubuntu0.12.04.4_all.deb"
    ],
    ECJ_URL: string = "http://www.eclipse.org/downloads/download.php?file=/eclipse/downloads/drops/R-3.7.1-201109091335/ecj-3.7.1.jar",
    JAZZLIB_URL: string = "http://downloads.sourceforge.net/project/jazzlib/jazzlib/0.07/jazzlib-binary-0.07-juz.zip",
    DOWNLOAD_URLS: string[] = [];

// Prepare DOWNLOAD_URLS prior to Grunt configuration.
DEBS.forEach(function(e) {
  DOWNLOAD_URLS.push(DEBS_DOMAIN + e);
});
DOWNLOAD_URLS.push(ECJ_URL);
DOWNLOAD_URLS.push(JAZZLIB_URL);

export function setup(grunt: IGrunt) {
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    // Configuration information for doppio's custom build tasks.
    build: {
      // Path to Java CLI utils. Will be updated by find_native_java_home task
      // if needed.
      java: 'java',
      javap: 'javap',
      javac: 'javac',
      // Where we download JCL stuff.
      download_dir: DOWNLOAD_DIR
    },
    'ice-cream': {
      'release-cli': {
        files: [{
          expand: true,
          cwd: 'build/dev-cli',
          src: '(console|src)/*.js',
          dest: 'build/release-cli'
        }]
      }
    },
    launcher: {
      'dev-cli': {
        name: 'doppio-dev'
      },
      'release-cli': {
        name: 'doppio'
      }
    },
    // Compiles TypeScript files.
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
    // Downloads files.
    'curl-dir': {
      long: {
        src: DOWNLOAD_URLS,
        dest: DOWNLOAD_DIR
      }
    },
    // Unzips files.
    unzip: {
      options: {
        dest_dir: 'vendor/classes'
      },
      jcl: {
        files: [{
          expand: true,
          src: [
            DOWNLOAD_DIR + "/**/rt.jar",
            DOWNLOAD_DIR + "/**/tools.jar",
            DOWNLOAD_DIR + "/**/resources.jar",
            DOWNLOAD_DIR + "/**/rhino.jar",
            DOWNLOAD_DIR + "/**/jsse.jar"
          ]
        }]
      },
      ecj: {
        // We can't get the pathname from the URL, since it has an argument
        // in it that contains the actual filename.
        files: [{src: DOWNLOAD_DIR + "/ecj*.jar"}]
      },
      jazzlib: {
        options: {
          dest_dir: DOWNLOAD_DIR + "/jazzlib"
        },
        files: [{src: DOWNLOAD_DIR + "/" + path.basename(url.parse(JAZZLIB_URL).pathname)}]
      }
    },
    extract_deb: {
      default: {
        options: {
          dest_dir: DOWNLOAD_DIR
        },
        files: [{
          expand: true,
          cwd: DOWNLOAD_DIR,
          src: "*.deb"
        }]
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
          cwd: 'build/dev-cli',
          src: '(console|src)/*.js',
          dest: 'build/release-cli'
        }]
      }
    },
    copy: {
      jazzlib: {
        // Patches Jazzlib.
        files: [{
          expand: true,
          flatten: true,
          src: DOWNLOAD_DIR + "/jazzlib/java/util/zip/*.class",
          dest: "vendor/classes/java/util/zip"
        }]
      }
    }
	});

  grunt.registerMultiTask('launcher', 'Creates a launcher for the given CLI release.', function() {
    var launcherName: string, buildPath: string,
        doppioPath: string, options: {name: string} = this.options();
    buildPath = path.resolve('build', this.target);
    launcherName = options.name;
    // Relative path for the launcher.
    doppioPath = path.relative(__dirname, path.resolve(buildPath, "console", "runner"));

    if (!fs.existsSync(launcherName)) {
      try {
        // Write with mode 755.
        fs.writeFileSync(launcherName, 'node $(dirname $0)/' + doppioPath + ' "$@"', {mode: 493});
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
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-curl');
  // Load our custom tasks.
  grunt.loadTasks('tasks');

  grunt.registerTask('setup', "Sets up doppio's environment prior to building.", function() {
    var need_jcl: boolean, need_ecj: boolean, need_jazzlib: boolean;
    // (Required) Finds local installation of Java.
    grunt.task.run('find_native_java');
    need_jcl = !fs.existsSync('vendor/classes/java/lang/Object.class');
    need_ecj =!fs.existsSync('vendor/classes/org/eclipse/jdt/internal/compiler/batch/Main.class');
    need_jazzlib = !fs.existsSync('vendor/classes/java/util/zip/DeflaterEngine.class');
    if (need_jcl || need_ecj || need_jazzlib) {
      // Create download folder.
      try { fs.mkdirSync(DOWNLOAD_DIR); } catch (e) { }
      // Schedule download task.
      // grunt.task.run('curl-dir');
    }
    if (need_jcl) {
      grunt.task.run('extract_deb');
      grunt.task.run('unzip:jcl');
    }
    if (need_ecj) {
      grunt.task.run('unzip:ecj');
    }
    if (need_jazzlib) {
      grunt.task.run('unzip:jazzlib');
      grunt.task.run('copy:jazzlib');
    }
    if (!fs.existsSync('vendor/java_home')) {
      grunt.task.run('setup_java_home');
    }
  });

  grunt.registerTask('dev-cli',
    ['setup',
     'make_build_dir:dev_cli',
     'ts:dev_cli',
     'launcher:dev_cli']);
  grunt.registerTask('release-cli',
    ['setup',
     'dev-cli',
     'make_build_dir:release_cli',
     'ice-cream:release_cli',
     'uglify:release_cli',
     'launcher:release_cli']);
  /**
   * $(TSC) --module amd --declaration --outDir build/dev browser/frontend.ts
   * style.css <-- cat
   * index.html <-- $(COFFEEC) browser/render.coffee $* > $@
   * DEMO CLASSES <--    compile
   * UTIL CLASSES <--    compile
   * mini-rt.tar.gz <--  construct
   *   COPYFILE_DISABLE=true && tar -c -h -T <(sort -u tools/preload) -f $@
   * require_config <-- copy over
   * favicon.ico <--    copy over
   *
   * TODO:
   * - Task for invoking javac on tons of files.
   *   OR simply invoke javac on all files at once???
   * - Task for copying files from one location to another.
   * - Task for catting together files into one file.
   * - Task for *.tar.gz'ing up a bunch of files (use streams).
   * - Render task for HTML.
   * - Generic ice-cream task (input files, output folder)
   *   -> Use streams to stream to file?
   *
   * MORE generic tasks, LESS task code!
   */
  grunt.registerTask('dev',
    ['make_build_dir:dev',
     'symlink:dev',
     ])
  /**
   * release:
   * - build dev
   * - $(R_JS) -o browser/build.js
   * - $(R_JS) -o browser/build_frontend.js
   * Stuff with HTML
   * Stuff with favico
   * Stuff with mini-rt
   * Stuff with style.css
   * Copy over assets (SVG/PNG/etc)
   * Compile core-viewer
   *release: $(patsubst %,build/release/%,$(notdir $(BROWSER_HTML))) \
  build/release/doppio.js build/release/browser/frontend.js \
  build/release/favicon.ico build/release/browser/mini-rt.tar \
  build/release/browser/style.css
  rsync browser/*.svg browser/*.png build/release/browser/
  rsync browser/core_viewer/core_viewer.css build/release/browser/core_viewer/
  $(COFFEEC) -c -o build/release/browser/core_viewer browser/core_viewer/core_viewer.coffee
  cp browser/core_viewer.html build/release
  cd build/release; $(COFFEEC) $(DOPPIO_DIR)/tools/gen_dir_listings.coffee > browser/listings.json

   */
  grunt.registerTask('release',
    ['make_build_dir:release',
     'symlink:release']);
};
