/// <reference path="../src/node.d.ts" />

var underscore = require('../vendor/_.js');
var fs = require('fs');
var path = require('path');
import jvm = module('../src/jvm');
import util = module('../src/util');
import logging = module('../src/logging');
import methods = module('../src/methods');
import runtime = module('../src/runtime');
import ClassLoader = module('../src/ClassLoader');
import optparse = module('../src/option_parser');
var BootstrapClassLoader = ClassLoader.BootstrapClassLoader;

function stub(obj, name, replacement, wrapped) {
  var old_fn;

  old_fn = obj[name];
  try {
    obj[name] = replacement;
    return wrapped();
  } finally {
    obj[name] = old_fn;
  }
}

function extract_all_to(files: string[], dest_dir: string): void {
  for (var filepath in files) {
    var file = files[filepath];
    filepath = path.join(dest_dir, filepath);
    if (file.options.dir || filepath.slice(-1) === '/') {
      if (!fs.existsSync(filepath)) {
        fs.mkdirSync(filepath);
      }
    } else {
      fs.writeFileSync(filepath, file.data, 'binary');
    }
  }
}

function extract_jar(jar_path: string, main_class_name?: string): string {
  var JSZip = require('node-zip');
  var unzipper = new JSZip(fs.readFileSync(jar_path, 'binary'), {
    base64: false,
    checkCRC32: true
  });
  var jar_name = path.basename(jar_path, '.jar');
  if (!fs.existsSync('/tmp/doppio')) {
    fs.mkdirSync('/tmp/doppio');
  }
  var tmpdir = "/tmp/doppio/" + jar_name;
  if (!fs.existsSync(tmpdir)) {
    fs.mkdirSync(tmpdir);
  }
  extract_all_to(unzipper.files, tmpdir);
  jvm.system_properties['java.class.path'].unshift(tmpdir);
  return tmpdir;
}

function find_main_class(extracted_jar_dir: string): string {
  // find the main class in the manifest
  var manifest_path = extracted_jar_dir + "/META-INF/MANIFEST.MF";
  var manifest = fs.readFileSync(manifest_path, 'utf8');
  var manifest_lines = manifest.split('\n');
  for (var i = 0; i < manifest_lines.length; i++) {
    var match = manifest_lines[i].match(/Main-Class: (\S+)/);
    if (match != null) {
      return match[1].replace(/\./g, '/');
    }
  }
}

function print_help(option_descriptions) {
  var launcher = process.argv[0];
  var script = require('path').relative(process.cwd(), process.argv[1]);
  console.log("Usage: " + launcher + " " + script + " [flags] /path/to/classfile [args for main()]\n");
  return console.log(option_descriptions);
}


// note that optimist does not know how to parse quoted string parameters, so we must
// place the arguments to the java program after '--' rather than as a normal flag value.
optparse.describe({
  standard: {
    classpath: {
      alias: 'cp',
      description: 'JVM classpath, "path1:...:pathN"',
      has_value: true
    },
    D: {
      description: 'set a system property, "name[=value]"'
    },
    jar: {
      description: 'add JAR to classpath and run its Main-Class (if found)',
      has_value: true
    },
    help: {
      alias: 'h',
      description: 'print this help message'
    },
    X: 'print help on non-standard options'
  },
  non_standard: {
    log: {
      description: 'log level, [0-10]|vtrace|trace|debug|error',
      has_value: true
    },
    'count-logs': 'count log messages instead of printing them',
    'skip-logs': {
      description: 'number of log messages to skip before printing',
      has_value: true
    },
    'list-class-cache': 'list all of the loaded classes after execution',
    'show-nyi-natives': 'list any NYI native functions in loaded classes',
    'dump-state': 'write a "core dump" on unusual termination',
    benchmark: 'time execution, both hot and cold'
  }
});

var argv = optparse.parse(process.argv);
if (argv.standard.help) {
  return print_help(optparse.show_help());
}
if (argv.standard.X) {
  return print_help(optparse.show_non_standard_help());
}

if (argv.non_standard.log != null) {
  if (/[0-9]+/.test(argv.non_standard.log)) {
    logging.log_level = argv.non_standard.log + 0;
  } else {
    var level = logging[argv.non_standard.log.toUpperCase()];
    if (level == null) {
      throw 'Unrecognized log level: should be one of [0-10]|vtrace|trace|debug|error.';
    }
    logging.log_level = level;
  }
} else {
  logging.log_level = logging.ERROR;
}

jvm.show_NYI_natives = argv.non_standard['show-nyi-natives'];
jvm.dump_state = argv.non_standard['dump-state'];
if (argv.standard.classpath != null) {
  jvm.set_classpath(__dirname + "/../vendor/classes", argv.standard.classpath);
} else {
  jvm.set_classpath(__dirname + "/../vendor/classes", '.');
}
underscore.extend(jvm.system_properties, argv.properties);
var cname = argv.className;
if (cname != null && cname.slice(-6) === '.class') {
  cname = cname.slice(0, -6);
}
if (!((cname != null) || (argv.standard.jar != null))) {
  return print_help(optparse.show_help());
}
var main_args = argv._;
var stdout = process.stdout.write.bind(process.stdout);
function read_stdin(resume): void {
  process.stdin.resume();
  process.stdin.once('data', function (data) {
    process.stdin.pause();
    resume(data);
  });
}

var bs_cl = new BootstrapClassLoader(jvm.read_classfile);
var rs = new runtime.RuntimeState(stdout, read_stdin, bs_cl);
if (argv.standard.jar != null) {
  var jar_dir = extract_jar(argv.standard.jar);
  cname = find_main_class(jar_dir);
  if (cname == null) {
    console.error("No Main-Class found in " + argv.standard.jar);
  }
}
function run(done_cb): void {
  jvm.run_class(rs, cname, main_args, done_cb);
}
var done_cb;
if (argv.non_standard['list-class-cache']) {
  done_cb = function () {
    var scriptdir = path.resolve(__dirname + "/..");
    var classes = rs.get_bs_cl().get_loaded_class_list(true);
    var cpaths = jvm.system_properties['java.class.path'];
    for (var i = 0; i < classes.length; i++) {
      var file = classes[i] + ".class";
      // Find where the file was loaded from.
      for (var j = 0; j < cpaths.length; j++) {
        var fpath = cpaths[j] + file;
        try {
          if (fs.statSync(fpath).isFile()) {
            fpath = path.resolve(fpath).substr(scriptdir.length + 1);
            if (fs.existsSync(fpath)) {
              console.log(fpath);
            }
            break;
          }
        } catch (_error) {
          // Do nothing; iterate.
        }
      }
    }
  };
} else if (argv.non_standard['count-logs']) {
    var count = 0;
    var old_log = console.log;
    console.log = function () { ++count; };
    done_cb = function () {
      console.log = old_log;
      console.log("console.log() was called a total of " + count + " times.");
    };
    } else if (argv.non_standard['skip-logs'] != null) {
    count = parseInt(argv.non_standard['skip-logs'], 10);
    old_log = console.log;
    console.log = function () {
      if (--count === 0) {
        console.log = old_log;
      }
    };
    done_cb = function () {};
  } else if (argv.non_standard['benchmark']) {
    console.log('Starting cold-cache run...');
    var cold_start = (new Date).getTime();
    done_cb = function () {
      var mid_point = (new Date).getTime();
      console.log('Starting hot-cache run...');
      rs = new runtime.RuntimeState(stdout, read_stdin, bs_cl);
      run(function () {
        var finished = (new Date).getTime();
        console.log("Timing:\n\t" + (mid_point - cold_start) + " ms cold\n\t"
                    + (finished - mid_point) + " ms hot");
      });
    };
  } else {
    done_cb = function (success) { process.exit(!success ? 1 : 0); };
}

process.on('SIGINT', function () {
  console.error('Doppio caught SIGINT');
  if (jvm.dump_state) {
    rs.dump_state();
  }
  process.exit(0);
});
run(done_cb);
