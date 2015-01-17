/// <reference path="../../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../../vendor/DefinitelyTyped/jasmine/jasmine.d.ts" />
/**
* Sets up the test environment, and launches everything.
* NOTE: Do not import or export anything from this file, as that will trigger
* TypeScript to generate an AMD module. This is meant to execute at load time.
*/
declare var __karma__;
declare var __numWaiting: number;
declare var doppio;
declare var BrowserFS;

(function() {
  var isRelease: boolean = true,
    finishTest: (result: boolean) => void,
    process = BrowserFS.BFSRequire('process'),
    fs = BrowserFS.BFSRequire('fs'),
    stdoutput = '';

  // dev version of doppio expects Buffer, process as globals.
  window['Buffer'] = BrowserFS.BFSRequire('buffer').Buffer;
  window['process'] = process;


  function getBuildPath(): string {
    return '../build/' + (isRelease ? 'release' : 'dev') + '/';
  }

  if (typeof doppio === 'undefined') {
    // Testing with dev version.
    isRelease = false;
    window['require'].config({
      // Karma serves files under /base, which is the basePath from your config file
      baseUrl: '/base/build/dev',
      // XXX: Copied from browser/require_config.js
      shim: {
        'vendor/underscore/underscore': {
          exports: '_'
        },
        'vendor/jquery/dist/jquery.min': {
          exports: '$'
        },
        'vendor/jquery-migrate/jquery-migrate.min': {
          deps: ['vendor/jquery/dist/jquery.min']
        },
        'vendor/jquery.console': {
          deps: ['vendor/jquery/dist/jquery.min']
        }
      },
      paths: {
        fs: 'browser/fs',
        path: 'browser/path'
      },
      // dynamically load all test files
      deps: ['src/doppio'],
      // we have to kickoff jasmine, as it is asynchronous
      callback: (doppio) => {
        window['doppio'] = doppio;
        runTests();
        // RequireJS mode: Tests begin asynchronously.
        __karma__.start();
      }
    });
  } else {
    // Testing with release version.
    runTests();
  }

  function configureJasmine(tests: string[]): void  {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 300000;

    describe("Unit Tests", function() {
      tests.forEach((test: string) => {
        it(test, function(done: () => void) {
          stdoutput = "";
          finishTest = (result: boolean) => {
            if (result) {
              // Pass.
              done();
            } else {
              // Fail.
              console.log(stdoutput);
              expect(false).toBe(true);
              done();
            }
          };
        });
      });
    });
  }

  /**
   * Set up BrowserFS.
   */
  function configureFS() {
    var xhr = new BrowserFS.FileSystem.XmlHttpRequest('listings.json', getBuildPath()),
      mfs = new BrowserFS.FileSystem.MountableFileSystem();
    mfs.mount('/sys', xhr);
    mfs.mkdirSync('/tmp');
    BrowserFS.initialize(mfs);
  }

  /**
   * Once DoppioJVM is properly set up, this function runs tests.
   */
  function runTests() {
    configureFS();
    // Tests expect to be run from the system path.
    process.chdir('/sys');
    // XXX testing.findTestClasses;
    var tests = fs.readdirSync('/sys/classes/test').filter((p: string) => p.indexOf('.java') !== -1);

    // Collect output in a string, print if failure.
    function stdout(data: Buffer) {
      stdoutput += data.toString();
    }
    process.stdout.on('data', stdout);
    process.stderr.on('data', stdout);

    configureJasmine(tests);

    // LAUNCH THE TESTS!
    if (typeof __karma__ !== 'undefined') {
      // Normal unit testing.
      // __karma__.start();
    }

    doppio.testing.runTests({
      bootstrapClasspath: ['/sys/vendor/java_home/classes'],
      doppioDir: '/sys',
      testClasses: null,
      hideDiffs: false,
      quiet: true,
      keepGoing: true,
      classpath: [],
      javaHomePath: '/sys/vendor/java_home',
      extractionPath: '/tmp',
      nativeClasspath: ['/sys/src/natives'],
      assertionsEnabled: false,
      postTestHook: (testName: string, result: boolean) => {
        finishTest(result);
      }
    }, () => {
      // NOP.
    });
  }
})();
