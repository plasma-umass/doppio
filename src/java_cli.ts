import optparse = require('./option_parser');
import JVM = require('./jvm');
import util = require('./util');
import logging = require('./logging');
import path = require('path');
var underscore = require('../vendor/underscore/underscore');

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
      X: { description: 'print help on non-standard options' }
    },
    non_standard: {
      log: {
        description: 'log level, [0-10]|vtrace|trace|debug|error',
        has_value: true, default: logging.ERROR
      },
      'count-logs': { description: 'count log messages instead of printing them' },
      'skip-logs': {
        description: 'number of log messages to skip before printing',
        has_value: true
      },
      'list-class-cache': { description: 'list all of the loaded classes after execution' },
      'show-nyi-natives': { description: 'list any NYI native functions in loaded classes' },
      'dump-state': { description: 'write a "core dump" on unusual termination' },
      benchmark: { description: 'time execution, both hot and cold' }
    }
  });
}

/**
 * Doppio-specific configuration options passed to this Java interface.
 */
export interface JavaOptions {
  // Path to the Java Class Library.
  jcl_path?: string;
  // Path to `java_home`.
  java_home_path?: string;
  // Folder to extract JAR files to.
  jar_file_path?: string;
  // Classpath item that should go after the bootstrap classpath, but before
  // classpath items specified via the -classpath flag.
  implicit_classpath?: string[];
  // Name of the command used to launch `java`. Used in the 'usage' portion of
  // the help message.
  launcher_name?: string;
  // An existing instance of the JVM to use.
  jvm_state?: JVM;
}

/**
 * Consumes a `java` command line string. Constructs a JVM, launches the command, and
 * returns the JVM object.
 *
 * Returns `null` if no JVM needed to be constructed (e.g. -h flag).
 *
 * @param {string[]} args - Arguments to the 'java' command.
 * @param {function} done_cb - Called when JVM execution finishes. Passes a
 *   boolean to the callback. If `false`, the JVM terminated with an error status.
 * @param {function} [jvm_started] - Called with the JVM object once we have invoked it.
 * @example <caption>Equivalent to `java classes/demo/Fib 3`</caption>
 *   doppio.java(['classes/demo/Fib', '3'],
 *     {jcl_path: '/sys/vendor/classes',
 *      java_home_path: '/sys/vendor/java_home'}, function() {
 *     // Resume whatever your frontend is doing.
 *   });
 */
export function java(args: string[], opts: JavaOptions,
                     done_cb: (arg: boolean) => void,
                     jvm_started: (jvm: JVM) => void = function(jvm: JVM): void {}): void {
  setupOptparse();
  var argv = optparse.parse(args), jvm_state: JVM, classpath: string[] = [],
      jvm_cb;

  // Default options
  if (!opts.launcher_name) {
    opts.launcher_name = 'java';
  }

  if (argv.standard.help) {
    return print_help(opts.launcher_name, optparse.show_help(), done_cb, true);
  } else if (argv.standard.X) {
    return print_help(opts.launcher_name, optparse.show_non_standard_help(), done_cb, true);
  }

  // GLOBAL CONFIGURATION

  if (/[0-9]+/.test(argv.non_standard.log)) {
    logging.log_level = argv.non_standard.log + 0;
  } else {
    var level = logging[argv.non_standard.log.toUpperCase()];
    if (level == null) {
      process.stderr.write('Unrecognized log level.');
      return print_help(opts.launcher_name, optparse.show_help(), done_cb, false);
    }
    logging.log_level = level;
  }

  JVM.show_NYI_natives = argv.non_standard['show-nyi-natives'];

  // Function that performs processing on the JVM, once constructed/ready.
  jvm_cb = function() {
    // JVM CONFIGURATION
    underscore.extend(jvm_state.system_properties, argv.properties);

    if (argv.non_standard['dump-state']) {
      jvm_state.should_dump_state = argv.non_standard['dump-state'];
    }

    if (argv.non_standard['list-class-cache']) {
      // Redefine done_cb so we print the loaded class files on JVM exit.
      done_cb = (function(old_done_cb: (arg: boolean) => void): (arg: boolean) => void {
        return function(result: boolean): void {
          jvm_state.list_class_cache(function(fpaths: string[]) {
            process.stdout.write(fpaths.join('\n') + '\n');
            old_done_cb(result);
          });
        };
      })(done_cb);
    } else if (argv.non_standard['count-logs']) {
      // Redefine done_cb so we print the number of times `console.log` was called on
      // JVM exit.
      done_cb = (function (old_done_cb: (result: boolean) => void): (result: boolean) => void {
        var count = 0,
          old_log = console.log,
          new_log = function () { ++count; };
        console.log = new_log;
        return function(result: boolean): void {
          console.log = old_log;
          process.stdout.write("console.log was called a total of " + count + " times.");
          old_done_cb(result);
        };
      })(done_cb);
    } else if (argv.non_standard['skip-logs'] != null) {
      // avoid generating unnecessary log data
      done_cb = (function (old_done_cb: (result: boolean) => void): (result: boolean) => void {
        var count = parseInt(argv.non_standard['skip-logs'], 10),
            old_log = console.log;
        console.log = function () {
          if (--count === 0) {
            console.log = old_log;
          }
        };
        return function(result: boolean): void {
          // Ensure we replace log, even if count didn't decrement to 0.
          console.log = old_log;
          old_done_cb(result);
        };
      })(done_cb);
    } else if (argv.non_standard['benchmark']) {
      // Wrap the done_cb so that we trigger a second run once the first finishes.
      done_cb = (function (old_done_cb: (result: boolean) => void): (result: boolean) => void {
        var cold_start = (new Date).getTime();
        process.stdout.write('Starting cold-cache run...\n');
        return function(result: boolean): void {
          var mid_point = (new Date).getTime();
          process.stdout.write('Starting hot-cache run...\n');
          launch_jvm(argv, opts, jvm_state, function(result: boolean) {
            var finished = (new Date).getTime();
            process.stdout.write("Timing:\n\t" + (mid_point - cold_start) + " ms cold\n\t"
                        + (finished - mid_point) + " ms hot\n");
            old_done_cb(result);
          }, function(jvm_state: JVM){});
        };
      })(done_cb);
    }

    // Programmer-supplied classpath items.
    if (opts.hasOwnProperty('implicit_classpath')) {
      classpath = opts.implicit_classpath;
    }

    // User-supplied classpath items.
    if (argv.standard.classpath != null) {
      classpath = classpath.concat(argv.standard.classpath.split(':'));
    } else {
      // DEFAULT: If no user-supplied classpath, add the current directory to
      // the class path.
      classpath.push(process.cwd());
    }

    jvm_state.push_classpath_items(classpath, function(status: boolean[]): void {
      // Launch the JVM.
      launch_jvm(argv, opts, jvm_state, done_cb, jvm_started);
    });
  };

  if (opts.jvm_state) {
    jvm_state = opts.jvm_state;
    jvm_cb();
  } else {
    // Construct the JVM.
    jvm_state = new JVM(function(err?: any): void {
      if (err) {
        process.stderr.write("Error constructing JVM:\n");
        process.stderr.write(err.toString() + "\n");
        done_cb(false);
      } else {
        jvm_cb();
      }
    }, opts.jcl_path, opts.java_home_path, opts.jar_file_path);
  }
}

/**
 * Consumes a fully-configured JVM, parsed arguments, and a callback.
 * Figures out from this how to launch the JVM (e.g. using a JAR file or a
 * particular class).
 */
function launch_jvm(argv: any, opts: JavaOptions, jvm_state: JVM, done_cb: (result: boolean) => void,
                    jvm_started: (jvm_state: JVM) => void): void {
  var main_args = argv._,
      cname = argv.className,
      jar_file = argv.standard.jar;

  // Wrap done_cb in a function that resets the JVM's state when finished.
  done_cb = (function(old_done_cb: (result: boolean) => void): (result: boolean) => void {
    return function(result: boolean): void {
      jvm_state.reset_system_properties();
      jvm_state.reset_classpath();
      // XXX: Remove at some point when we fix this.
      jvm_state.reset_classloader_cache();
      old_done_cb(result);
    };
  })(done_cb);

  if (cname != null) {
    // Class specified.
    if (cname.slice(-6) === '.class') {
      cname = cname.slice(0, -6);
    }
    if (cname.indexOf('.') !== -1) {
      // hack: convert java.foo.Bar to java/foo/Bar
      cname = util.descriptor2typestr(util.int_classname(cname));
    }
    jvm_state.run_class(cname, main_args, done_cb);
  } else if (jar_file != null) {
    jvm_state.run_jar(jar_file, main_args, done_cb);
  } else {
    // No class specified, no jar specified!
    return print_help(opts.launcher_name, optparse.show_help(), done_cb, true);
  }
  jvm_started(jvm_state);
}

function print_help(launcherName, str: string, done_cb: (arg: boolean) => void, rv: boolean): void {
  process.stdout.write("Usage: " + launcherName +
    " [flags]  /path/to/classfile [args for main()]\n" + str + "\n");
  return done_cb(rv);
}
