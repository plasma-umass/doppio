import {OptionParser, ParseType, PrefixParseResult} from './option_parser';
import JVM = require('./jvm');
import util = require('./util');
import logging = require('./logging');
import {JVMCLIOptions} from './interfaces';

let parser = new OptionParser({
  default: {
    classpath: {
      type: ParseType.NORMAL_VALUE_SYNTAX,
      alias: 'cp',
      optDesc: ' <class search path of directories and zip/jar files>',
      desc: 'A : separated list of directories, JAR archives, and ZIP archives to search for class files.',
    },
    D: {
      type: ParseType.MAP_SYNTAX,
      optDesc: '<name>=<value>',
      desc: 'set a system property'
    },
    jar: {
      type: ParseType.NORMAL_VALUE_SYNTAX,
      stopParsing: true
    },
    help: { alias: '?', desc: 'print this help message' },
    X: { desc: 'print help on non-standard options' },
    enableassertions: {
      type: ParseType.COLON_VALUE_OR_FLAG_SYNTAX,
      optDesc: '[:<packagename>...|:<classname>]',
      alias: 'ea',
      desc: 'enable assertions with specified granularity'
    },
    disableassertions: {
      type: ParseType.COLON_VALUE_OR_FLAG_SYNTAX,
      optDesc: '[:<packagename>...|:<classname>]',
      alias: 'da',
      desc: 'disable assertions with specified granularity'
    },
    enablesystemassertions: { alias: 'esa', desc: 'enable system assertions' },
    disablesystemassertions: { alias: 'dsa', desc: 'disable system assertions '}
  },
  X: {
    log: {
      desc: 'log level, [0-10]|vtrace|trace|debug|error',
      type: ParseType.NORMAL_VALUE_SYNTAX
    },
    'vtrace-methods': {
      type: ParseType.NORMAL_VALUE_SYNTAX,
      optDesc: ' <java/lang/Object/getHashCode()I:...>',
      desc: 'specify particular methods to vtrace separated by colons'
    },
    'list-class-cache': {
      desc: 'list all of the bootstrap loaded classes after execution'
    },
    'dump-compiled-code': {
      type: ParseType.NORMAL_VALUE_SYNTAX,
      optDesc: ' <directory>',
      desc: 'location to dump compiled object definitions'
    },
    // TODO: Use -Djava.library.path
    'native-classpath': {
      type: ParseType.NORMAL_VALUE_SYNTAX,
      optDesc: ' <class search path of directories>',
      desc: 'A : separated list of directories to search for native mathods in JS files.'
    },
    'bootclasspath/a': {
      type: ParseType.COLON_VALUE_SYNTAX,
      optDesc: ':<directories and zip/jar files separated by :>',
      desc: 'append to end of bootstrap class path'
    },
    'bootclasspath/p': {
      type: ParseType.COLON_VALUE_SYNTAX,
      optDesc: ':<directories and zip/jar files separated by :>',
      desc: 'prepend in front of bootstrap class path'
    },
    'bootclasspath': {
      type: ParseType.COLON_VALUE_SYNTAX,
      optDesc: ':<directories and zip/jar files separated by :>',
      desc: 'set search path for bootstrap classes and resources'
    }
  }
});

/**
 * Consumes a `java` command line string. Constructs a JVM, launches the command, and
 * returns the JVM object. Throws an exception if parsing fails.
 *
 * Returns `null` if no JVM needed to be constructed (e.g. -h flag).
 *
 * @param args Arguments to the 'java' command.
 * @param opts Default options.
 * @param doneCb Called when JVM execution finishes. Passes a
 *   number to the callback indicating the exit value.
 * @param [jvmStarted] Called with the JVM object once we have invoked it.
 */
function java(args: string[], opts: JVMCLIOptions,
                     doneCb: (status: number) => void,
                     jvmStarted: (jvm: JVM) => void = function(jvm: JVM): void {}): void {
  let parsedArgs = parser.parse(args),
    standard = parsedArgs['default'],
    nonStandard = parsedArgs['X'],
    jvmState: JVM;

  // System properties.
  opts.properties = standard.mapOption('D');

  if (standard.flag('help', false)) {
    return printHelp(opts.launcherName, parser.help('default'), doneCb, 0);
  } else if (standard.flag('X', false)) {
    return printNonStandardHelp(opts.launcherName, parser.help('X'), doneCb, 0);
  }

  // GLOBAL CONFIGURATION
  let logOption = nonStandard.stringOption('log', 'ERROR');

  if (/^[0-9]+$/.test(logOption)) {
    logging.log_level = parseInt(logOption, 10);
  } else {
    let level = (<any> logging)[logOption.toUpperCase()];
    if (level == null) {
      process.stderr.write(`Unrecognized log level: ${logOption}.`);
      return printHelp(opts.launcherName, parser.help('default'), doneCb, 1);
    }
    logging.log_level = level;
  }

  if (nonStandard.flag('list-class-cache', false)) {
    // Redefine done_cb so we print the loaded class files on JVM exit.
    doneCb = ((old_done_cb: (arg: number) => void): (arg: number) => void => {
      return (result: number): void => {
        let fpaths = jvmState.getBootstrapClassLoader().getLoadedClassFiles();
        process.stdout.write(fpaths.join('\n') + '\n');
        old_done_cb(result);
      };
    })(doneCb);
  }

  if (standard.flag('enablesystemassertions', false)) {
    opts.enableSystemAssertions = true;
  }

  if (standard.flag('disablesystemassertions', false)) {
    opts.enableSystemAssertions = false;
  }

  if (standard.flag('enableassertions', false)) {
    opts.enableAssertions = true;
  } else if (standard.stringOption('enableassertions', null)) {
    opts.enableAssertions = standard.stringOption('enableassertions', null).split(':');
  }

  if (standard.stringOption('disableassertions', null)) {
    opts.disableAssertions = standard.stringOption('disableassertions', null).split(':');
  }
  // NOTE: Boolean form of -disableassertions is a NOP.

  // Bootstrap classpath items.
  let bscl = nonStandard.stringOption('bootclasspath', null);
  if (bscl !== null) {
    opts.bootstrapClasspath = bscl.split(':');
  }
  let bsClAppend = nonStandard.stringOption('bootclasspath/a', null);
  if (bsClAppend) {
    opts.bootstrapClasspath = opts.bootstrapClasspath.concat(bsClAppend.split(':'));
  }
  let bsClPrepend = nonStandard.stringOption('bootclasspath/p', null);
  if (bsClPrepend) {
    opts.bootstrapClasspath = bsClPrepend.split(':').concat(opts.bootstrapClasspath);
  }

  // User-supplied classpath items.
  if (!opts.classpath) {
    opts.classpath = [];
  }

  if (standard.stringOption('jar', null)) {
    opts.classpath.push(standard.stringOption('jar', null));
  } else if (standard.stringOption('classpath', null)) {
    opts.classpath = opts.classpath.concat(standard.stringOption('classpath', null).split(':'));
  } else {
    // DEFAULT: If no user-supplied classpath, add the current directory to
    // the class path.
    opts.classpath.push(process.cwd());
  }

  // User-supplied native classpath.
  let nativeClasspath = standard.stringOption('native-classpath', null);
  if (nativeClasspath) {
    opts.nativeClasspath = opts.nativeClasspath.concat(nativeClasspath.split(':'));
  }

  // Construct the JVM.
  jvmState = new JVM(opts, (err?: any): void => {
    if (err) {
      process.stderr.write("Error constructing JVM:\n");
      process.stderr.write(err.toString() + "\n");
      doneCb(1);
    } else {
      launchJvm(standard, opts, jvmState, doneCb, jvmStarted);
    }
  });

  let vtraceMethods = nonStandard.stringOption('vtrace-methods', null);
  if (vtraceMethods) {
    vtraceMethods.split(':').forEach((m: string) => jvmState.vtraceMethod(m));
  }

  let dumpCompiledCode = nonStandard.stringOption('dumpCompiledCode', null);
  if (dumpCompiledCode) {
    jvmState.dumpCompiledCode(dumpCompiledCode);
  }
}

/**
 * Consumes a fully-configured JVM, parsed arguments, and a callback.
 * Figures out from this how to launch the JVM (e.g. using a JAR file or a
 * particular class).
 */
function launchJvm(standardOptions: PrefixParseResult, opts: JVMCLIOptions, jvmState: JVM, doneCb: (status: number) => void,
                    jvmStarted: (jvmState: JVM) => void): void {
  let mainArgs = standardOptions.unparsedArgs();
  if (standardOptions.stringOption('jar', null)) {
    jvmState.runJar(mainArgs, doneCb);
    jvmStarted(jvmState);
  } else if (mainArgs.length > 0) {
    let cname = mainArgs[0];
    if (cname.slice(-6) === '.class') {
      cname = cname.slice(0, -6);
    }
    if (cname.indexOf('.') !== -1) {
      // hack: convert java.foo.Bar to java/foo/Bar
      cname = util.descriptor2typestr(util.int_classname(cname));
    }
    jvmState.runClass(cname, mainArgs.slice(1), doneCb);
    jvmStarted(jvmState);
  } else {
    // No class specified, no jar specified!
    printHelp(opts.launcherName, parser.help('default'), doneCb, 0);
  }
}

function printHelp(launcherName: string, str: string, doneCb: (arg: number) => void, rv: number): void {
  process.stdout.write(
`Usage: ${launcherName} [-options] class [args...]
        (to execute a class)
or  ${launcherName} [-options] -jar jarfile [args...]
        (to execute a jar file)
where options include:\n${str}`);
  doneCb(rv);
}

function printNonStandardHelp(launcherName: string, str: string, doneCb: (arg: number) => void, rv: number): void {
  process.stdout.write(`${str}\n\nThe -X options are non-standard and subject to change without notice.\n`);
  doneCb(rv);
}

export = java;
