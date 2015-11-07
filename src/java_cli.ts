import optparse = require('./option_parser');
import JVM = require('./jvm');
import util = require('./util');
import logging = require('./logging');
import {JVMCLIOptions} from './interfaces';

/**
 * Initializes the option parser with the options for the `java` command.
 * Our option parser maintains global state, so we must re-initialize it each
 * time `java` is called.
 */
function setupOptparse() {
  optparse.describe({
    standard: {
      classpath: {
        alias: 'cp',
        description: 'JVM classpath, "path1:...:pathN"',
        has_value: true
      },
      D: { description: 'set a system property, "name[=value]"' },
      jar: {
        description: 'add JAR to classpath and run its Main-Class (if found)',
        has_value: true
      },
      help: { alias: 'h', description: 'print this help message' },
      X: { description: 'print help on non-standard options' },
      enableassertions: { alias: 'ea', description: 'enable debug assertions' }
    },
    non_standard: {
      log: {
        description: 'log level, [0-10]|vtrace|trace|debug|error',
        has_value: true,
        default: "" + logging.ERROR
      },
      'vtrace-methods': {
        description: 'specify particular methods to vtrace separated by colons, e.g. java/lang/Object/getHashCode()I:java/lang/String/charAt(I)C',
        has_value: true
      },
      'list-class-cache': { description: 'list all of the loaded classes after execution' },
      'show-nyi-natives': { description: 'list any NYI native functions in loaded classes' },
      'dump-state': { description: 'write a "core dump" on unusual termination' },
      benchmark: { description: 'time execution, both hot and cold' },
      'dump-compiled-code': { description: 'directory to dump compiled object definitions', has_value: true },
      // TODO: Use -Djava.library.path
      'native-classpath': {
        description: 'directories where package-based native methods can be found',
        has_value: true
      },
      'bootclasspath/a': {
        description: 'append to end of bootstrap class path; separate with :',
        has_value: true
      },
      'bootclasspath/p': {
        description: 'prepend to end of bootstrap class path; separate with :',
        has_value: true
      },
      'bootclasspath': {
        description: 'set the bootstrap classpath',
        has_value: true
      }
    }
  });
}

/**
 * Consumes a `java` command line string. Constructs a JVM, launches the command, and
 * returns the JVM object.
 *
 * Returns `null` if no JVM needed to be constructed (e.g. -h flag).
 *
 * @param {string[]} args - Arguments to the 'java' command.
 * @param {function} done_cb - Called when JVM execution finishes. Passes a
 *   number to the callback indicating the exit value.
 * @param {function} [jvm_started] - Called with the JVM object once we have invoked it.
 * @example <caption>Equivalent to `java classes/demo/Fib 3`</caption>
 *   doppio.java(['classes/demo/Fib', '3'],
 *     {bootstrapClasspath: '/sys/vendor/classes',
 *      javaHomePath: '/sys/vendor/java_home'}, function() {
 *     // Resume whatever your frontend is doing.
 *   });
 */
function java(args: string[], opts: JVMCLIOptions,
                     done_cb: (status: number) => void,
                     jvm_started: (jvm: JVM) => void = function(jvm: JVM): void {}): void {
  setupOptparse();
  var argv = optparse.parse(args), jvm_state: JVM;

  // Default options
  // TODO: Collect these into a 'default option' object, merge w/ user supplied
  // options.
  if (!opts.launcherName) {
    opts.launcherName = 'java';
  }

  if (!opts.classpath) {
    opts.classpath = [];
  }

  // System properties.
  opts.properties = argv.properties;

  if (argv.standard.help) {
    return print_help(opts.launcherName, optparse.show_help(), done_cb, 0);
  } else if (argv.standard.X) {
    return print_help(opts.launcherName, optparse.show_non_standard_help(), done_cb, 0);
  }

  // GLOBAL CONFIGURATION

  if (/[0-9]+/.test(argv.non_standard.log)) {
    logging.log_level = parseInt(argv.non_standard.log, 10) + 0;
  } else {
    var level = (<any> logging)[argv.non_standard.log.toUpperCase()];
    if (level == null) {
      process.stderr.write('Unrecognized log level.');
      return print_help(opts.launcherName, optparse.show_help(), done_cb, 1);
    }
    logging.log_level = level;
  }

  if (argv.non_standard['list-class-cache']) {
    // Redefine done_cb so we print the loaded class files on JVM exit.
    done_cb = ((old_done_cb: (arg: number) => void): (arg: number) => void => {
      return (result: number): void => {
        jvm_state.getBootstrapClassLoader().getLoadedClassFiles((fpaths: string[]) => {
          process.stdout.write(fpaths.join('\n') + '\n');
          old_done_cb(result);
        });
      };
    })(done_cb);
  } else if (argv.non_standard['benchmark']) {
    // Wrap the done_cb so that we trigger a second run once the first finishes.
    done_cb = ((old_done_cb: (status: number) => void): (status: number) => void => {
      var cold_start = (new Date).getTime();
      process.stdout.write('Starting cold-cache run...\n');
      return (status: number): void => {
        var mid_point = (new Date).getTime();
        process.stdout.write('Starting hot-cache run...\n');
        launch_jvm(argv, opts, jvm_state, (status: number) => {
          var finished = (new Date).getTime();
          process.stdout.write("Timing:\n\t" + (mid_point - cold_start) + " ms cold\n\t"
                      + (finished - mid_point) + " ms hot\n");
          old_done_cb(status);
        }, (jvm_state: JVM) => {});
      };
    })(done_cb);
  }

  if (argv.standard.enableassertions) {
    opts.assertionsEnabled = true;
  }

  // Bootstrap classpath items.
  if (argv.non_standard['bootclasspath']) {
    opts.bootstrapClasspath = argv.non_standard['bootclasspath'].split(':');
  }
  if (argv.non_standard['bootclasspath/a']) {
    opts.bootstrapClasspath = opts.bootstrapClasspath.concat(argv.non_standard['bootclasspath/a'].split(':'));
  }
  if (argv.non_standard['bootclasspath/p']) {
    opts.bootstrapClasspath = argv.non_standard['bootclasspath/p'].split(':').concat(opts.bootstrapClasspath);
  }

  // User-supplied classpath items.
  if (argv.standard.jar != null) {
    opts.classpath = opts.classpath.concat([argv.standard.jar]);
  } else if (argv.standard.classpath != null) {
    opts.classpath = opts.classpath.concat(argv.standard.classpath.split(':'));
  } else {
    // DEFAULT: If no user-supplied classpath, add the current directory to
    // the class path.
    opts.classpath.push(process.cwd());
  }

  // User-supplied native classpath.
  if (argv.non_standard['native-classpath']) {
    opts.nativeClasspath = opts.nativeClasspath.concat(argv.non_standard['native-classpath'].split(':'));
  }

  // Construct the JVM.
  jvm_state = new JVM(opts, (err?: any): void => {
    if (err) {
      process.stderr.write("Error constructing JVM:\n");
      process.stderr.write(err.toString() + "\n");
      done_cb(1);
    } else {
      launch_jvm(argv, opts, jvm_state, done_cb, jvm_started);
    }
  });

  if (typeof argv.non_standard['vtrace-methods'] === 'string') {
    argv.non_standard['vtrace-methods'].split(':').forEach((m: string) => jvm_state.vtraceMethod(m));
  }

  if (typeof argv.non_standard['dump-compiled-code'] === 'string') {
    jvm_state.dumpCompiledCode(argv.non_standard['dump-compiled-code']);
  }
}

/**
 * Consumes a fully-configured JVM, parsed arguments, and a callback.
 * Figures out from this how to launch the JVM (e.g. using a JAR file or a
 * particular class).
 */
function launch_jvm(argv: any, opts: JVMCLIOptions, jvm_state: JVM, done_cb: (status: number) => void,
                    jvm_started: (jvm_state: JVM) => void): void {
  var main_args = argv._,
      cname = argv.className,
      isJar = argv.standard.jar != null;

  if (cname != null) {
    // Class specified.
    if (cname.slice(-6) === '.class') {
      cname = cname.slice(0, -6);
    }
    if (cname.indexOf('.') !== -1) {
      // hack: convert java.foo.Bar to java/foo/Bar
      cname = util.descriptor2typestr(util.int_classname(cname));
    }
    jvm_state.runClass(cname, main_args, done_cb);
  } else if (isJar) {
    jvm_state.runJar(main_args, done_cb);
  } else {
    // No class specified, no jar specified!
    return print_help(opts.launcherName, optparse.show_help(), done_cb, 0);
  }
  jvm_started(jvm_state);
}

function print_help(launcherName: string, str: string, done_cb: (arg: number) => void, rv: number): void {
  process.stdout.write("Usage: " + launcherName +
    " [flags]  /path/to/classfile [args for main()]\n" + str + "\n");
  return done_cb(rv);
}

export = java;
