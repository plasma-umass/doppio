/// <reference path="../vendor/jquery.d.ts" />
/// <amd-dependency path="../vendor/jquery/jquery.min" />
/// <amd-dependency path="../vendor/jquery-migrate/jquery-migrate.min" />
/// <reference path="../vendor/jquery.console.d.ts" />
/// <amd-dependency path="../vendor/jquery.console" />
/// <reference path="../vendor/ace.d.ts" />
/// <amd-dependency path="../vendor/underscore/underscore" />
var underscore = require('../vendor/underscore/underscore');
import disassembler = require('../src/disassembler');
import jvm = require('../src/jvm');
import testing = require('../src/testing');
import untar = require('./untar');
import util = require('../src/util');
declare var node;
declare var JSZip;  // hax

// To be initialized on document load
var stdout = null;
var user_input = null;
var controller = null;
var editor = null;
var progress = null;
var jvm_state = null;
var sys_path = '/sys';

function preload(): void {
  node.fs.readFile(sys_path + "/browser/mini-rt.tar", function(err, data): void {
    if (err) {
      console.error("Error downloading mini-rt.tar:", err);
      return;
    }
    var file_count = 0;
    var done = false;
    var start_untar = (new Date).getTime();
    function on_complete(): void {
      var end_untar = (new Date).getTime();
      console.log("Untarring took a total of " + (end_untar - start_untar) + "ms.");
      $('#overlay').fadeOut('slow');
      $('#progress-container').fadeOut('slow');
      $('#console').click();
    }
    var update_bar = underscore.throttle((function(percent, path) {
      var bar = $('#progress > .bar');
      var preloading_file = $('#preloading-file');
      // +10% hack to make the bar appear fuller before fading kicks in
      var display_perc = Math.min(Math.ceil(percent * 100), 100);
      bar.width(display_perc + "%");
      preloading_file.text(display_perc < 100 ? "Loading " + path : "Done!");
    }));
    function on_progress(percent: number, path: string, file: number[]): void {
      if (path[0] != '/') {
        path = '/' + path;
      }
      update_bar(percent, path);
      var ext = path.split('.')[1];
      if (ext !== 'class') {
        if (percent === 100) {
          on_complete();
        }
        return;
      }
      file_count++;
      untar.asyncExecute(function() {
        try {
          xhrfs.preloadFile(path, file);
        } catch (e) {
          console.error("Error writing " + path + ":", e);
        }
        if (--file_count === 0 && done) {
          return on_complete();
        }
      });
    }
    function on_file_done(): void {
      done = true;
      if (file_count === 0) {
        on_complete();
      }
    }
    // Grab the XmlHttpRequest file system.
    var xhrfs = node.fs.getRootFS().mntMap[sys_path];
    // Note: Path is relative to XHR mount point (e.g. /vendor/classes rather than
    // /sys/vendor/classes). They must also be absolute paths.
    untar.untar(new util.BytesArray(data), on_progress, on_file_done);
  });
}

function onResize(): void {
  var height = $(window).height() * 0.7;
  $('#console').height(height);
  $('#source').height(height);
}

// Returns prompt text, ala $PS1 in bash.
function ps1(): string {
  return node.process.cwd() + '$ ';
}

$(window).resize(onResize);

// Note: Typescript supposedly has "open interfaces", but I can't get it to
//  work right, so I'm doing this as a hack.

// Add the .files attr for FileReader event targets.
interface FileReaderEvent extends ErrorEvent {
  target: FileReaderEventTarget;
}
interface FileReaderEventTarget extends EventTarget {
  files: string[];
  error: any;
}

// Add the .readAsBinaryString function for FileReader.
interface FileReader2 extends FileReader {
  readAsBinaryString: (f: any) => string;
}

$(document).ready(function() {
  onResize();
  editor = $('#editor');
  // set up the local file loaders
  $('#file').change(function(ev: FileReaderEvent) {
    if (typeof FileReader === "undefined" || FileReader === null) {
      controller.message("Your browser doesn't support file loading.\nTry using the editor to create files instead.", "error");
      // click to restore focus
      return $('#console').click();
    }
    var num_files = ev.target.files.length;
    var files_uploaded = 0;
    if (num_files > 0) {
      controller.message("Uploading " + num_files + " files...\n", 'success', true);
    }
    // Need to make a function instead of making this the body of a loop so we
    // don't overwrite "f" before the onload handler calls.
    var file_fcn = (function(f) {
      var reader = <FileReader2> new FileReader;
      reader.onerror = function(e: FileReaderEvent): void {
        switch (e.target.error.code) {
          case e.target.error.NOT_FOUND_ERR:
            return alert("404'd");
          case e.target.error.NOT_READABLE_ERR:
            return alert("unreadable");
          case e.target.error.SECURITY_ERR:
            return alert("only works with --allow-file-access-from-files");
        }
      };
      var ext = f.name.split('.')[1];
      var isClass = ext === 'class';
      reader.onload = function(e) {
        files_uploaded++;
        var progress = "[" + files_uploaded + "/" + num_files
                           + "] File '" + f.name + "'";
        node.fs.writeFile(node.process.cwd() + '/' + f.name, new Buffer(e.target.result), function(err){
          if (err) {
            controller.message(progress + " could not be saved: " + err + ".\n",
                               'error', files_uploaded !== num_files);
          } else {
            controller.message(progress + " saved.\n",
                               'success', files_uploaded !== num_files);
            if (typeof editor.getSession === "function") {
              if (isClass) {
                editor.getSession().setValue("/*\n * Binary file: " + f.name + "\n */");
              } else {
                editor.getSession().setValue(e.target.result);
              }
            }
          }
          // click to restore focus
          $('#console').click();
        });
      };
      return reader.readAsArrayBuffer(f);
    });
    var files = ev.target.files;
    for (var i = 0; i < num_files; i++) {
      file_fcn(files[i]);
    }
  });
  var jqconsole = $('#console');
  controller = jqconsole.console({
    promptLabel: ps1(),
    commandHandle: function(line: string): any {
      var parts = line.trim().split(/\s+/);
      var cmd = parts[0];
      var args = parts.slice(1).filter((a)=> a.length > 0).map((a)=>a.trim());
      if (cmd === '') {
        return true;
      }
      var handler = commands[cmd];
      try {
        if (handler != null) {
          return handler(args);
        } else {
          return "Unknown command '" + cmd + "'. Enter 'help' for a list of commands.";
        }
      } catch (_error) {
        return controller.message(_error.toString(), 'error');
      }
    },
    tabComplete: tabComplete,
    autofocus: false,
    animateScroll: true,
    promptHistory: true,
    welcomeMessage: "Welcome to Doppio! You may wish to try the following Java programs:\n" +
      "  java classes/test/FileRead\n" +
      "  java classes/demo/Fib <num>\n" +
      "  java classes/demo/Chatterbot\n" +
      "  java classes/demo/RegexTestHarness\n" +
      "  java classes/demo/GzipDemo c Hello.txt hello.gz (compress)\n" +
      "  java classes/demo/GzipDemo d hello.gz hello.tmp (decompress)\n" +
      "  java classes/demo/DiffPrint Hello.txt hello.tmp\n\n" +
      "We support the stock Sun Java Compiler:\n" +
      "  javac classes/test/FileRead.java\n" +
      "  javac classes/demo/Fib.java\n\n" +
      "(Note: if you edit a program and recompile with javac, you'll need\n" +
      "  to run 'clear_cache' to see your changes when you run the program.)\n\n" +
      "We can run Rhino, the Java-based JS engine:\n" +
      "  rhino\n\n" +
      "Text files can be edited by typing `edit [filename]`.\n\n" +
      "You can also upload your own files using the uploader above the top-right\n" +
      "corner of the console.\n\n" +
      "Enter 'help' for full a list of commands. Ctrl-D is EOF.\n\n" +
      "Doppio has been tested with the latest versions of the following desktop browsers:\n" +
      "  Chrome, Safari, Firefox, Opera, Internet Explorer 10, and Internet Explorer 9."
  });
  stdout = function(str: string): void {
    controller.message(str, '', true);
  }
  user_input = function(resume): void {
    var oldPrompt = controller.promptLabel;
    controller.promptLabel = '';
    controller.reprompt();
    var oldHandle = controller.commandHandle;
    controller.commandHandle = function(line) {
      controller.commandHandle = oldHandle;
      controller.promptLabel = oldPrompt;
      if (line === '\0') {
        // EOF
        resume(0);
      } else {
        line += "\n";  // so BufferedReader knows it has a full line
        resume(line.map((c,i)=>line.charCodeAt(i)));
      }
    };
  }
  function close_editor() {
    $('#ide').fadeOut('fast', function() {
      // click to restore focus
      $('#console').fadeIn('fast').click();
    });
  }
  $('#save_btn').click(function(e) {
    var fname = $('#filename').val();
    var contents = editor.getSession().getValue();
    if (contents[contents.length - 1] !== '\n') {
      contents += '\n';
    }
    node.fs.writeFile(fname, contents, function(err){
      if (err) {
        controller.message("File could not be saved: " + err, 'error');
      } else {
        controller.message("File saved as '" + fname + "'.", 'success');
      }
    });
    close_editor();
    e.preventDefault();
  });
  $('#close_btn').click(function(e) {
    close_editor();
    e.preventDefault();
  });
  jvm_state = new jvm.JVM();
  preload();
});

function pad_right(str: string, len: number): string {
  return str + Array(len - str.length + 1).join(' ');
}

// helper function for 'ls'
function read_dir(dir: string, pretty: boolean, columns: boolean, cb: any): void {
  node.fs.readdir(node.path.resolve(dir), function(err: any, contents: string[]){
    if (err || contents.length == 0) {
      return cb('');
    }
    contents = contents.sort();
    if (!pretty) {
      return cb(contents.join('\n'));
    }
    var pretty_list = [];
    util.async_foreach(contents,
      // runs on each element
      function(c: string, next_item) {
        node.fs.stat(dir + '/' + c, function(err, stat){
          if (stat.isDirectory()) {
            c += '/';
          }
          pretty_list.push(c);
          next_item();
        });
      },
      // runs at the end of processing
      function() {
        if (columns)
          cb(columnize(pretty_list));
        else
          cb(pretty_list.join('\n'));
      });
  });
}

function columnize(str_list: string[], line_length: number = 100): string {
  var max_len = 0;
  for (var i = 0; i < str_list.length; i++) {
    var len = str_list[i].length;
    if (len > max_len) {
      max_len = len;
    }
  }
  var num_cols = (line_length / (max_len + 1)) | 0;
  var col_size = Math.ceil(str_list.length / num_cols);
  var column_list = [];
  for (var j = 1; j <= num_cols; j++) {
    column_list.push(str_list.splice(0, col_size));
  }
  function make_row(i: number): string {
    return column_list.filter((col)=>col[i]!=null)
                      .map((col)=>pad_right(col[i], max_len + 1))
                      .join('');
  }
  var row_list = [];
  for (var i = 0; i < col_size; i++) {
    row_list.push(make_row(i));
  }
  return row_list.join('\n');
}

// Set the origin location, if it's not already.
if (location['origin'] == null) {
  location['origin'] = location.protocol + "//" + location.host;
}

var commands = {
  view_dump: function(args: string[], cb) {
    if (args.length < 1) {
      return "Usage: view_dump <core-file.json>\nUse java -Xdump-state path/to/failing/class to generate one.";
    }
    controller.message('Loading dump file ' + args[0] + '...', 'success', true);
    node.fs.readFile(args[0], 'utf8', function(err, dump) {
      if (err) {
        controller.message(" failed.\nError reading core dump: " + err.toString() + "\n", 'success', true);
        return controller.reprompt();
      }
      // Open the core viewer in a new window and save a reference to it.
      var viewer = window.open('core_viewer.html?source=browser');
      // Create a function to send the core dump to the new window.
      function send_dump(): void {
        try {
          viewer.postMessage(dump, location['origin']);
          controller.message(' success.\n', 'success', true);
        } catch (e) {
          controller.message(" failed.\nUnable to send dump information to new window. Check your popup blocker settings.\n", 'success', true);
        }
        controller.reprompt();
      }
      // RACE CONDITION: The window could load and trigger `onload` before we
      // configure a callback.
      // Start a timer to send the message after 5 seconds - the window should
      // have loaded by then.
      var delay = 5000;
      var timer = setTimeout(send_dump, delay);
      // If the window loads before 5 seconds, send the message straight away
      // and cancel the timer.
      viewer.onload = function() {
        clearTimeout(timer);
        send_dump();
      }
    });
    return null;
  },
  ecj: function(args: string[], cb) {
    jvm_state.set_classpath(sys_path + '/vendor/classes/', './');
    // XXX: -D args unsupported by the console.
    jvm_state.system_properties['jdt.compiler.useSingleThread'] = true;
    jvm_state.run_class(stdout, user_input, 'org/eclipse/jdt/internal/compiler/batch/Main', args, function() {
      // XXX: remove any classes that just got compiled from the class cache
      for (var i = 0; i < args.length; i++) {
        var c = args[i];
        if (c.match(/\.java$/)) {
          jvm_state.bs_cl.remove_class(util.int_classname(c.slice(0, -5)));
        }
      }
      jvm_state.reset_system_properties();
      controller.reprompt();
    });
    return null;
  },
  javac: function(args: string[], cb) {
    jvm_state.set_classpath(sys_path + '/vendor/classes/', './:/sys');
    jvm_state.run_class(stdout, user_input, 'classes/util/Javac', args, function() {
      // XXX: remove any classes that just got compiled from the class cache
      for (var i = 0; i < args.length; i++) {
        var c = args[i];
        if (c.match(/\.java$/)) {
          jvm_state.bs_cl.remove_class(util.int_classname(c.slice(0, -5)));
        }
      }
      controller.reprompt();
    });
    return null;
  },
  java: function(args: string[], cb) {
    jvm_state.should_dump_state = false
    // XXX: dump-state support
    for (var i = 0; i < args.length; i++) {
      if (args[i] === '-Xdump-state') {
        jvm_state.should_dump_state = true;
        args.splice(i, 1);
        break;
      }
    }
    if ((args[0] == null) ||
        ((args[0] === '-classpath' || args[0] === '-cp') && args.length < 3)) {
      return "Usage: java [-classpath path1:path2...] [-jar path.jar] class [args...]";
    }
    var class_args, class_name;
    if (args[0] === '-classpath' || args[0] === '-cp') {
      jvm_state.set_classpath(sys_path + '/vendor/classes/', args[1]);
      class_name = args[2];
      class_args = args.slice(3);
    } else if (args[0] === '-jar') {
      // TODO: extract common functionality with console/runner.ts
      // TODO: make this asynchronous
      // TODO: error checking / tab-complete fixes
      var jar_path = args[1];
      var tmp_dir = '/tmp/jars/' + node.path.basename(jar_path.slice(0,-4)) + '/';
      if (!node.fs.existsSync(tmp_dir)) {
        node.fs.mkdirSync(tmp_dir);
      }
      var jar = node.fs.readFileSync(jar_path);
      var jarfile = new JSZip(jar.buff.buffer);
      // TODO: avoid loading every single file into memory (BFS ZipFS backend?)
      for (var filepath in jarfile.files) {
        var file = jarfile.files[filepath];
        filepath = node.path.join(tmp_dir, filepath);
        if (file.options.dir || filepath.slice(-1) === '/') {
          if (!node.fs.existsSync(filepath)) {
            node.fs.mkdirSync(filepath);
          }
        } else {
          node.fs.writeFileSync(filepath, file.asBinary(), 'binary');
        }
      }
      jvm_state.set_classpath(sys_path + '/vendor/classes/', tmp_dir+':./');
      class_name = args[2];  // TODO: infer this from the manifest
      class_args = args.slice(3);
    } else {
      jvm_state.set_classpath(sys_path + '/vendor/classes/', './');
      class_name = args[0];
      class_args = args.slice(1);
    }
    jvm_state.run_class(stdout, user_input, class_name, class_args, () => controller.reprompt());
    return null;
  },
  test: function(args: string[]) {
    if (args[0] == null) {
      return "Usage: test all|[class(es) to test]";
    }
    // Change dir to $sys_path, because that's where tests expect to be run from.
    var curr_dir = node.process.cwd();
    function done_cb(): void {
      node.process.chdir(curr_dir);
      controller.reprompt();
    }
    node.process.chdir(sys_path);
    if (args[0] === 'all') {
      testing.run_tests([], stdout, true, false, true, done_cb);
    } else {
      testing.run_tests(args, stdout, false, false, true, done_cb);
    }
    return null;
  },
  javap: function(args: string[]) {
    if (args[0] == null) {
      return "Usage: javap class";
    }
    node.fs.readFile(args[0] + '.class', function(err, buf){
      if (err) {
        controller.message("Could not find class '" + args[0] + "'.", 'error');
      } else {
        controller.message(disassembler.disassemble(buf), 'success');
      }
    });
    return null;
  },
  rhino: function(args: string[], cb) {
    jvm_state.set_classpath(sys_path + '/vendor/classes/', './');
    jvm_state.run_class(stdout, user_input, 'com/sun/tools/script/shell/Main', args, () => controller.reprompt());
    return null;
  },
  list_cache: function() {
    var cached_classes = jvm_state.bs_cl.get_loaded_class_list(true);
    return '  ' + cached_classes.sort().join('\n  ');
  },
  clear_cache: function() {
    jvm_state.reset_classloader_cache();
    return true;
  },
  ls: function(args: string[]) {
    if (args.length === 0) {
      read_dir('.', true, true, (listing) => controller.message(listing, 'success'));
    } else if (args.length === 1) {
      read_dir(args[0], true, true, (listing) => controller.message(listing, 'success'));
    } else {
      util.async_foreach(args,
        function(dir: string, next_item: ()=>void) {
          read_dir(dir, true, true, function(listing: string){
            controller.message(dir + ':\n' + listing + '\n\n', 'success', true);
            next_item();
          });
        }, controller.reprompt);
    }
    return null;
  },
  edit: function(args: string[]) {
    function start_editor(data: string): void {
      $('#console').fadeOut('fast', function(): void {
        $('#filename').val(args[0]);
        $('#ide').fadeIn('fast');
        // Initialize the editor. Technically we only need to do this once,
        // but more is fine too.
        editor = ace.edit('source');
        editor.setTheme('ace/theme/twilight');
        if (args[0] == null || args[0].split('.')[1] === 'java') {
          var JavaMode = ace.require("ace/mode/java").Mode;
          editor.getSession().setMode(new JavaMode);
        } else {
          var TextMode = ace.require("ace/mode/text").Mode;
          editor.getSession().setMode(new TextMode);
        }
        editor.getSession().setValue(data);
      });
    }
    if (args[0] == null) {
      start_editor(defaultFile('Test.java'));
      return true;
    }
    node.fs.readFile(args[0], 'utf8', function(err, data: string): void {
      if (err) {
        start_editor(defaultFile(args[0]));
      } else {
        start_editor(data);
      }
      controller.reprompt();
    });
  },
  cat: function(args: string[]) {
    var fname = args[0];
    if (fname == null) {
      return "Usage: cat <file>";
    }
    node.fs.readFile(fname, 'utf8', function(err, data: string): void {
      if (err) {
        controller.message("Could not open file '" + fname + "': " + err, 'error');
      } else {
        controller.message(data, 'success');
      }
    });
    return null;
  },
  mv: function(args: string[]) {
    if (args.length < 2) {
      return "Usage: mv <from-file> <to-file>";
    }
    node.fs.rename(args[0], args[1], function(err) {
      if (err) {
        controller.message("Could not rename "+args[0]+" to "+args[1]+": "+err, 'error', true);
      }
      controller.reprompt();
    });
    return null;
  },
  cd: function(args: string[]) {
    if (args.length > 1) {
      return "Usage: cd <directory>";
    }
    var dir;
    if (args.length == 0 || args[0] == '~') {
      // Change to the default (starting) directory.
      dir = '/demo';
    } else {
      dir = node.path.resolve(args[0]);
    }
    // Verify path exists before going there.
    // chdir does not verify that the directory exists.
    node.fs.exists(dir, function(doesExist: boolean) {
      if (doesExist) {
        node.process.chdir(dir);
        controller.promptLabel = ps1();
      } else {
        controller.message("Directory " + dir + " does not exist.\n", 'error', true);
      }
      controller.reprompt();
    })
    return null;
  },
  rm: function(args: string[]) {
    if (args[0] == null) {
      return "Usage: rm <file>";
    }
    var completed = 0;
    function remove_file(file: string, total: number): void {
      node.fs.unlink(file, function(err){
        if (err) {
          controller.message("Could not remove file: " + file + "\n", 'error', true);
        }
        if (++completed == total) {
          controller.reprompt();
        }
      });
    }
    if (args[0] === '*') {
      node.fs.readdir('.', function(err, fnames: string[]){
        if (err) {
          controller.message("Could not read '.': " + err, 'error');
          return;
        }
        for (var i = 0; i < fnames.length; i++) {
          remove_file(fnames[i], fnames.length);
        }
      });
    } else {
      remove_file(args[0], 1);
    }
    return null;
  },
  emacs: function(): string {
    return "Try 'vim'.";
  },
  vim: function(): string {
    return "Try 'emacs'.";
  },
  time: function(args: string[]) {
    var start = (new Date).getTime();
    console.profile(args[0]);
    controller.onreprompt = function() {
      controller.onreprompt = null;
      console.profileEnd();
      var end = (new Date).getTime();
      controller.message("\nCommand took a total of " + (end - start) + "ms to run.\n", '', true);
    };
    return commands[args.shift()](args);
  },
  profile: function(args: string[]) {
    var count = 0;
    var runs = 5;
    var duration = 0;
    function time_once(): void {
      var start = (new Date).getTime();
      controller.onreprompt = function() {
        if (!(count < runs)) {
          controller.onreprompt = null;
          controller.message("\n" + args[0] + " took an average of " + (duration / runs) + "ms.\n", '', true);
          return;
        }
        var end = (new Date).getTime();
        if (count++ === 0) { // first one to warm the cache
          return time_once();
        }
        duration += end - start;
        return time_once();
      };
      return commands[args.shift()](args);
    }
    return time_once();
  },
  help: function(args: string[]): string {
    return "Ctrl-D is EOF.\n\n" +
      "Java-related commands:\n" +
      "  javac <source file>    -- Invoke the Java 6 compiler.\n" +
      "  java <class> [args...] -- Run with command-line arguments.\n" +
      "  javap <class>          -- Display disassembly.\n" +
      "  time                   -- Measure how long it takes to run a command.\n" +
      "  rhino                  -- Run Rhino, the Java-based JavaScript engine.\n\n" +
      "File management:\n" +
      "  cat <file>             -- Display a file in the console.\n" +
      "  edit <file>            -- Edit a file.\n" +
      "  ls <dir>               -- List files.\n" +
      "  mv <src> <dst>         -- Move / rename a file.\n" +
      "  rm <file>              -- Delete a file.\n" +
      "  cd <dir>               -- Change current directory.\n\n" +
      "Cache management:\n" +
      "  list_cache             -- List the cached class files.\n" +
      "  clear_cache            -- Clear the cached class files.";
  }
};

function tabComplete(): void {
  var promptText = controller.promptText();
  var args = promptText.split(/\s+/);
  var last_arg = util.last(args);
  getCompletions(args, function(completions: string[]) {
    var prefix = longestCommmonPrefix(completions);
    if (prefix == '' || prefix == last_arg) {
      // We've no more sure completions to give, so show all options.
      var common_len = last_arg.lastIndexOf('/') + 1;
      var options = columnize(completions.map((c) => c.slice(common_len)));
      controller.message(options, 'success');
      controller.promptText(promptText);
      return;
    }
    // Delete existing text so we can do case correction.
    promptText = promptText.substr(0, promptText.length -  last_arg.length);
    controller.promptText(promptText + prefix);
  });
}

function getCompletions(args: string[], cb): void {
  if (args.length == 1) {
    cb(filterSubstring(args[0], Object.keys(commands)));
  } else if (args[0] === 'time') {
    getCompletions(args.slice(1), cb);
  } else {
    fileNameCompletions(args[0], args, cb);
  }
}

function filterSubstring(prefix: string, lst: string[]): string[] {
  return lst.filter((x) => x.substr(0, prefix.length) == prefix);
}

function validExtension(cmd: string, fname: string): boolean {
  var dot = fname.lastIndexOf('.');
  var ext = dot === -1 ? '' : fname.slice(dot + 1);
  if (cmd === 'javac') {
    return ext === 'java';
  } else if (cmd === 'javap' || cmd === 'java') {
    return ext === 'class';
  } else {
    return true;
  }
}

function fileNameCompletions(cmd: string, args: string[], cb): void {
  var chopExt = args.length === 2 && (cmd === 'javap' || cmd === 'java');
  var toComplete = util.last(args);
  var lastSlash = toComplete.lastIndexOf('/');
  var dirPfx, searchPfx;
  if (lastSlash >= 0) {
    dirPfx = toComplete.slice(0, lastSlash + 1);
    searchPfx = toComplete.slice(lastSlash + 1);
  } else {
    dirPfx = '';
    searchPfx = toComplete;
  }
  var dirPath = (dirPfx == '') ? '.' : node.path.resolve(dirPfx);
  node.fs.readdir(dirPath, function(err, dirList){
    if (err != null) {
      return cb([])
    }
    dirList = filterSubstring(searchPfx, dirList);
    var completions = [];
    util.async_foreach(dirList,
      // runs on each element
      function(item: string, next_item: ()=>void) {
        node.fs.stat(node.path.resolve(dirPfx + item), function(err, stats) {
          if (err != null) {
            // Do nothing.
          } else if (stats.isDirectory()) {
            completions.push(dirPfx + item + '/');
          } else if (validExtension(cmd, item)) {
            if (chopExt) {
              completions.push(dirPfx + item.split('.', 1)[0]);
            } else {
              completions.push(dirPfx + item);
            }
          }
          next_item();
        });
      },
      // runs at the end of processing
      () => cb(completions));
  });
}

// use the awesome greedy regex hack, from http://stackoverflow.com/a/1922153/10601
function longestCommmonPrefix(lst: string[]): string {
  return lst.join(' ').match(/^(\S*)\S*(?: \1\S*)*$/i)[1];
}

function defaultFile(filename: string): string {
  if (filename.indexOf('.java', filename.length - 5) != -1) {
    return "class " + filename.substr(0, filename.length - 5) + " {\n"
        + "  public static void main(String[] args) {\n"
        + "    // enter code here\n  }\n}";
  }
  return "";
}
