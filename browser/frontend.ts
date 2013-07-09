var underscore = require('../vendor/_.js');
declare var $;  // until we get a jQuery.d.ts file
declare var ace;  // until we get an ace.d.ts file
declare var node;  // until we convert ./node.ts
import ClassData = module('../src/ClassData');
import ClassLoader = module('../src/ClassLoader');
import disassembler = module('../src/disassembler');
import jvm = module('../src/jvm');
import runtime = module('../src/runtime');
import testing = module('../src/testing');
import untar = module('./untar');
import util = module('../src/util');

// To be initialized on document load
var stdout = null;
var user_input = null;
var controller = null;
var editor = null;
var progress = null;
var bs_cl = null;

function preload(): void {
  var data;
  try {
    data = node.fs.readFileSync("/home/doppio/browser/mini-rt.tar");
  } catch (_error) {
    console.error(_error);
  }
  if (data == null) return;
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
    bar.width(display_perc + "%", 150);
    preloading_file.text(display_perc < 100 ? "Loading " + path : "Done!");
  }));
  function on_progress(percent: number, path: string, file: number[]): void {
    update_bar(percent, path);
    var base_dir = 'vendor/classes/';
    var ext = path.split('.')[1];
    if (ext !== 'class') {
      if (percent === 100) {
        on_complete();
      }
      return;
    }
    file_count++;
    untar.asyncExecute(function() {
      // XXX: We convert from bytestr to array to process the tar file, and
      //      then back to a bytestr to store as a file in the filesystem.
      node.fs.writeFileSync(path, util.array_to_bytestr(file), 'utf8', true);
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
  untar.untar(new util.BytesArray(util.bytestr_to_array(data)), on_progress, on_file_done);
}

// Read in a binary classfile synchronously. Return an array of bytes.
function read_classfile(cls: string, cb, failure_cb): void {
  // Convert Lfoo/bar/Baz; -> foo/bar/Baz.
  var cls = cls.slice(1, -1);
  var classpath = jvm.system_properties['java.class.path'];
  for (var i = 0; i < classpath.length; i++) {
    var fullpath = classpath[i] + cls + ".class";
    var data;
    try {
      data = util.bytestr_to_array(node.fs.readFileSync(fullpath));
    } catch (_error) {
      data = null;
    }
    if (data != null) {
      return cb(data);
    }
  }
  failure_cb(function(): void {
    throw new Error("Error: No file found for class " + cls + ".");
  });
}

function process_bytecode(bytecode_string: string): ClassData.ReferenceClassData {
  var bytes_array = util.bytestr_to_array(bytecode_string);
  return new ClassData.ReferenceClassData(bytes_array);
}

function onResize(): void {
  var height = $(window).height() * 0.7;
  $('#console').height(height);
  $('#source').height(height);
}

$(window).resize(onResize);

$(document).ready(function() {
  onResize();
  editor = $('#editor');
  // set up the local file loaders
  $('#file').change(function(ev) {
    if (typeof FileReader === "undefined" || FileReader === null) {
      controller.message("Your browser doesn't support file loading.\nTry using the editor to create files instead.", "error");
      // click to restore focus
      return $('#console').click();
    }
    var num_files = ev.target.files.length;
    var files_uploaded = 0;
    controller.message("Uploading " + num_files + " files...\n", 'success', true);
    // Need to make a function instead of making this the body of a loop so we
    // don't overwrite "f" before the onload handler calls.
    var file_fcn = (function(f) {
      var reader = new FileReader;
      reader.onerror = function(e) {
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
        node.fs.writeFileSync(node.process.cwd() + '/' + f.name, e.target.result);
        controller.message("[" + files_uploaded + "/" + num_files + "] File '" + f.name + "' saved.\n", 'success', files_uploaded !== num_files);
        if (isClass) {
          if (typeof editor.getSession === "function") {
            editor.getSession().setValue("/*\n * Binary file: " + f.name + "\n */");
          }
        } else {
          if (typeof editor.getSession === "function") {
            editor.getSession().setValue(e.target.result);
          }
        }
        // click to restore focus
        $('#console').click();
      };
      if (isClass) {
        return reader.readAsBinaryString(f);
      } else {
        return reader.readAsText(f);
      }
    });
    var files = ev.target.files;
    for (var i = 0; i < num_files; i++) {
      file_fcn(files[i]);
    }
  });
  var jqconsole = $('#console');
  controller = jqconsole.console({
    promptLabel: 'doppio > ',
    commandHandle: function(line) {
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
  function stdout(str: string): void {
    controller.message(str, '', true);
  }
  function user_input(resume): void {
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
    node.fs.writeFileSync(fname, contents);
    controller.message("File saved as '" + fname + "'.", 'success');
    close_editor();
    e.preventDefault();
  });
  $('#close_btn').click(function(e) {
    close_editor();
    e.preventDefault();
  });
  bs_cl = new ClassLoader.BootstrapClassLoader(read_classfile);
  preload();
});

function rpad(str: string, len: number): string {
  return str + Array(len - str.length + 1).join(' ');
}

// helper function for 'ls'
function read_dir(dir: string, pretty?: boolean, columns?: boolean): string {
  if (pretty == null) {
    pretty = true;
  }
  if (columns == null) {
    columns = true;
  }
  var contents = node.fs.readdirSync(dir).sort();
  if (!pretty) {
    return contents.join('\n');
  }
  var pretty_list = [];
  var max_len = 0;
  for (var i = 0; i < contents.length; i++) {
    var c = contents[i];
    if (node.fs.statSync(dir + '/' + c).isDirectory()) {
      c += '/';
    }
    if (c.length > max_len) {
      max_len = c.length;
    }
    pretty_list.push(c);
  }
  if (!columns) {
    return pretty_list.join('\n');
  }
  // XXX: assumes 100-char lines
  var num_cols = (100 / (max_len + 1)) | 0;
  var col_size = Math.ceil(pretty_list.length / num_cols);
  var column_list = [];
  for (var j = 1; 1 <= num_cols; j++) {
    column_list.push(pretty_list.splice(0, col_size));
  }

  var make_row = (i) => column_list.filter((col)=>col[i]!=null).map((col)=>rpad(col[i], max_len + 1)).join('');
  var row_list = [];
  for (var i = 0; i < col_size; i++) {
    row_list.push(make_row(i));
  }
  return row_list.join('\n');
};

var commands = {
  ecj: function(args: string[], cb) {
    jvm.set_classpath('/home/doppio/vendor/classes/', './');
    var rs = new runtime.RuntimeState(stdout, user_input, bs_cl);
    jvm.system_properties['jdt.compiler.useSingleThread'] = true;
    jvm.run_class(rs, 'org/eclipse/jdt/internal/compiler/batch/Main', args, function() {
      for (var i = 0; i < args.length; i++) {
        var c = args[i];
        if (c.match(/\.java$/)) {
          bs_cl.remove_class(util.int_classname(c.slice(0, -5)));
        }
      }
      jvm.reset_system_properties();
      controller.reprompt();
    });
    return null;
  },
  javac: function(args: string[], cb) {
    jvm.set_classpath('/home/doppio/vendor/classes/', './:/home/doppio');
    var rs = new runtime.RuntimeState(stdout, user_input, bs_cl);
    jvm.run_class(rs, 'classes/util/Javac', args, function() {
      for (var i = 0; i < args.length; i++) {
        var c = args[i];
        if (c.match(/\.java$/)) {
          bs_cl.remove_class(util.int_classname(c.slice(0, -5)));
        }
      }
      controller.reprompt();
    });
    return null;
  },
  java: function(args: string[], cb) {
    if ((args[0] == null) || (args[0] === '-classpath' && args.length < 3)) {
      return "Usage: java [-classpath path1:path2...] class [args...]";
    }
    var class_args, class_name;
    if (args[0] === '-classpath') {
      jvm.set_classpath('/home/doppio/vendor/classes/', args[1]);
      class_name = args[2];
      class_args = args.slice(3);
    } else {
      jvm.set_classpath('/home/doppio/vendor/classes/', './');
      class_name = args[0];
      class_args = args.slice(1);
    }
    var rs = new runtime.RuntimeState(stdout, user_input, bs_cl);
    jvm.run_class(rs, class_name, class_args, () => controller.reprompt());
    return null;
  },
  test: function(args: string[]) {
    if (args[0] == null) {
      return "Usage: test all|[class(es) to test]";
    }
    if (args[0] === 'all') {
      testing.run_tests([], stdout, true, false, true, () => controller.reprompt());
    } else {
      testing.run_tests(args, stdout, false, false, true, () => controller.reprompt());
    }
    return null;
  },
  javap: function(args: string[]) {
    if (args[0] == null) {
      return "Usage: javap class";
    }
    var raw_data;
    try {
      raw_data = node.fs.readFileSync("" + args[0] + ".class");
    } catch (_error) {
      return ["Could not find class '" + args[0] + "'.", 'error'];
    }
    return disassembler.disassemble(process_bytecode(raw_data));
  },
  rhino: function(args: string[], cb) {
    jvm.set_classpath('/home/doppio/vendor/classes/', './');
    var rs = new runtime.RuntimeState(stdout, user_input, bs_cl);
    jvm.run_class(rs, 'com/sun/tools/script/shell/Main', args, () => controller.reprompt());
    return null;
  },
  list_cache: function() {
    var cached_classes = bs_cl.get_loaded_class_list(true);
    return '  ' + cached_classes.sort().join('\n  ');
  },
  clear_cache: function() {
    bs_cl = new ClassLoader.BootstrapClassLoader(read_classfile);
    return true;
  },
  ls: function(args: string[]) {
    if (args.length === 0) {
      return read_dir('.');
    } else if (args.length === 1) {
      return read_dir(args[0]);
    } else {
      return args.map((d) => d + ":\n" + read_dir(d) + "\n").join('\n');
    }
  },
  edit: function(args: string[]) {
    var data;
    try {
      data = args[0] != null ? node.fs.readFileSync(args[0]) : defaultFile;
    } catch (_error) {
      data = defaultFile;
    }
    $('#console').fadeOut('fast', function() {
      $('#filename').val(args[0]);
      $('#ide').fadeIn('fast');
      editor = ace.edit('source');
      editor.setTheme('ace/theme/twilight');
      if (args[0] == null || args[0].split('.')[1] === 'java') {
        var JavaMode = require("ace/mode/java").Mode;
        editor.getSession().setMode(new JavaMode);
      } else {
        var TextMode = require("ace/mode/text").Mode;
        editor.getSession().setMode(new TextMode);
      }
      return editor.getSession().setValue(data);
    });
    return true;
  },
  cat: function(args: string[]): string {
    var fname = args[0];
    if (fname == null) {
      return "Usage: cat <file>";
    }
    try {
      return node.fs.readFileSync(fname);
    } catch (_error) {
      return "ERROR: " + fname + " does not exist.";
    }
  },
  mv: function(args: string[]) {
    if (args.length < 2) {
      return "Usage: mv <from-file> <to-file>";
    }
    try {
      node.fs.renameSync(args[0], args[1]);
    } catch (_error) {
      return "Invalid arguments.";
    }
    return true;
  },
  cd: function(args: string[]) {
    if (args.length > 1) {
      return "Usage: cd <directory>";
    }
    if (args.length === 0) {
      args.push("~");
    }
    try {
      node.process.chdir(args[0]);
    } catch (_error) {
      return "Invalid directory.";
    }
    return true;
  },
  rm: function(args: string[]): any {
    if (args[0] == null) {
      return "Usage: rm <file>";
    }
    if (args[0] === '*') {
      var fnames = node.fs.readdirSync('.');
      for (var i = 0; i < fnames.length; i++) {
        var fname = fnames[i];
        if (node.fs.statSync(fname).is_directory) {
          return "ERROR: '" + fname + "' is a directory.";
        }
        node.fs.unlinkSync(fname);
      }
    } else {
      node.fs.unlinkSync(args[0]);
    }
    return true;
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
        if (count++ === 0) {
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
  var args, getCompletions, prefix, promptText;

  var promptText = controller.promptText();
  var args = promptText.split(/\s+/);
  var prefix = longestCommmonPrefix(getCompletions(args));
  if (prefix === '') {
    // TODO: if we're tab-completing a blank, show all options
    return;
  }
  // delete existing text so we can do case correction
  var promptText = promptText.substr(0, promptText.length - util.last(args).length);
  controller.promptText(promptText + prefix);
}

function getCompletions(args: string[]): string[] {
  if (args.length === 1) {
    return commandCompletions(args[0]);
  } else if (args[0] === 'time') {
    return getCompletions(args.slice(1));
  } else {
    return fileNameCompletions(args[0], args);
  }
}

function commandCompletions(cmd: string): string[] {
  var _results = [];
  for (var name in commands) {
    if (name.substr(0, cmd.length) === cmd) {
      _results.push(name);
    }
  }
  return _results;
}

function fileNameCompletions(cmd: string, args: string[]): string[] {
  function validExtension(fname: string): boolean {
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
  var dirList;
  try {
    dirList = node.fs.readdirSync(dirPfx === '' ? '.' : dirPfx);
    // Slight cheat.
    dirList.push('..');
    dirList.push('.');
  } catch (_error) {
    return [];
  }
  var completions = [];
  for (var i = 0; i < dirList.length; i++) {
    var item = dirList[i];
    var stat = node.fs.statSync(dirPfx + item);
    var isDir = stat != null && stat.isDirectory();
    if ((isDir || validExtension(item)) && item.slice(0, searchPfx.length) === searchPfx) {
      if (isDir) {
        completions.push(dirPfx + item + '/');
      } else if (cmd !== 'cd') {
        completions.push(dirPfx + (chopExt ? item.split('.', 1)[0] : item));
      }
    }
  }
  return completions;
}

// use the awesome greedy regex hack, from http://stackoverflow.com/a/1922153/10601
function longestCommmonPrefix(lst: string[]): string {
  return lst.join(' ').match(/^(\S*)\S*(?: \1\S*)*$/i)[1];
}

var defaultFile = "class Test {\n"
  + "  public static void main(String[] args) {\n"
  + "    // enter code here\n  }\n}";
