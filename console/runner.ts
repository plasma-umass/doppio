/// <reference path="../src/node.d.ts" />
declare module 'vendor/_.js' {
  export function extend(x: any, y: any): any;
}
import underscore = module('vendor/_.js');
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

function extract_all_to(files, dest_dir) {
  var file, filepath;

  for (filepath in files) {
    file = files[filepath];
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

function extract_jar(jar_path, main_class_name?) {
  var JSZip, jar_name, tmpdir, unzipper;

  JSZip = require('node-zip');
  unzipper = new JSZip(fs.readFileSync(jar_path, 'binary'), {
    base64: false,
    checkCRC32: true
  });
  jar_name = path.basename(jar_path, '.jar');
  if (!fs.existsSync('/tmp/doppio')) {
    fs.mkdirSync('/tmp/doppio');
  }
  tmpdir = "/tmp/doppio/" + jar_name;
  if (!fs.existsSync(tmpdir)) {
    fs.mkdirSync(tmpdir);
  }
  extract_all_to(unzipper.files, tmpdir);
  jvm.system_properties['java.class.path'].unshift(tmpdir);
  return tmpdir;
}

function find_main_class(extracted_jar_dir) {
  var line, manifest, manifest_path, match, _i, _len, _ref;

  manifest_path = "" + extracted_jar_dir + "/META-INF/MANIFEST.MF";
  manifest = fs.readFileSync(manifest_path, 'utf8');
  _ref = manifest.split('\n');
  for (_i = 0, _len = _ref.length; _i < _len; _i++) {
    line = _ref[_i];
    match = line.match(/Main-Class: (\S+)/);
    if (match != null) {
      return match[1].replace(/\./g, '/');
    }
  }
}

function print_help(option_descriptions) {
  var launcher, script;

  launcher = process.argv[0];
  script = require('path').relative(process.cwd(), process.argv[1]);
  console.log("Usage: " + launcher + " " + script + " [flags] /path/to/classfile [args for main()]\n");
  return console.log(option_descriptions);
}


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

logging.log_level = (function () {
  var _ref;

  if (argv.non_standard.log != null) {
    if (/[0-9]+/.test(argv.non_standard.log)) {
      return argv.non_standard.log + 0;
    } else {
      level = logging[(_ref = argv.non_standard.log) != null ? _ref.toUpperCase() : void 0];
      if (level == null) {
        throw 'Unrecognized log level: should be one of [0-10]|vtrace|trace|debug|error.';
      }
      return level;
    }
  } else {
    return logging.ERROR;
  }
})();

jvm.show_NYI_natives = argv.non_standard['show-nyi-natives'];
jvm.dump_state = argv.non_standard['dump-state'];
if (argv.standard.classpath != null) {
  jvm.set_classpath("" + __dirname + "/../vendor/classes", argv.standard.classpath);
} else {
  jvm.set_classpath("" + __dirname + "/../vendor/classes", '.');
}
underscore.extend(jvm.system_properties, argv.properties);
var cname = argv.className;
if ((cname != null ? cname.slice(-6) : void 0) === '.class') {
  cname = cname.slice(0, -6);
}
if (!((cname != null) || (argv.standard.jar != null))) {
  return print_help(optparse.show_help());
}
var main_args = argv._;
var stdout = process.stdout.write.bind(process.stdout);
function read_stdin(resume) {
  process.stdin.resume();
  return process.stdin.once('data', function (data) {
    process.stdin.pause();
    return resume(data);
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
function run(done_cb) {
  return jvm.run_class(rs, cname, main_args, done_cb);
}
var done_cb = (function () {
  switch (false) {
    case !argv.non_standard['list-class-cache']:
      return function () {
        var cpath, e, file, fpath, k, scriptdir, _i, _len, _ref, _results;

        scriptdir = path.resolve(__dirname + "/..");
        _ref = rs.get_bs_cl().get_loaded_class_list(true);
        _results = [];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          k = _ref[_i];
          file = "" + k + ".class";
          _results.push((function () {
            var _j, _len1, _ref1, _results1;

            _ref1 = jvm.system_properties['java.class.path'];
            _results1 = [];
            for (_j = 0, _len1 = _ref1.length; _j < _len1; _j++) {
              cpath = _ref1[_j];
              fpath = cpath + file;
              try {
                if (fs.statSync(fpath).isFile()) {
                  fpath = path.resolve(fpath).substr(scriptdir.length + 1);
                  if (fs.existsSync(fpath)) {
                    console.log(fpath);
                  }
                  break;
                } else {
                  _results1.push(void 0);
                }
              } catch (_error) {
                e = _error;
              }
            }
            return _results1;
          })());
        }
        return _results;
      };
    case !argv.non_standard['count-logs']:
      var count = 0;
      var old_log = console.log;
      console.log = function () {
        return ++count;
      };
      return function () {
        console.log = old_log;
        return console.log("console.log() was called a total of " + count + " times.");
      };
    case argv.non_standard['skip-logs'] == null:
      count = parseInt(argv.non_standard['skip-logs'], 10);
      old_log = console.log;
      console.log = function () {
        if (--count === 0) {
          return console.log = old_log;
        }
      };
      return function () { };
    case !argv.non_standard['benchmark']:
      console.log('Starting cold-cache run...');
      var cold_start = (new Date).getTime();
      return function () {
        var mid_point;

        mid_point = (new Date).getTime();
        console.log('Starting hot-cache run...');
        rs = new runtime.RuntimeState(stdout, read_stdin, bs_cl);
        return run(function () {
          var finished;

          finished = (new Date).getTime();
          return console.log("Timing:\n\t" + (mid_point - cold_start) + " ms cold\n\t" + (finished - mid_point) + " ms hot");
        });
      };
    default:
      return function (success) {
        return process.exit(!success ? 1 : 0);
      };
  }
})();
process.on('SIGINT', function () {
  console.error('Doppio caught SIGINT');
  if (jvm.dump_state) {
    rs.dump_state();
  }
  return process.exit(0);
});
run(done_cb);
