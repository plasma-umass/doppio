/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="../vendor/DefinitelyTyped/jquery/jquery.d.ts" />
/// <amd-dependency path="../vendor/jquery/jquery.min" />
/// <amd-dependency path="../vendor/jquery-migrate/jquery-migrate.min" />
/// <reference path="../vendor/jquery.console.d.ts" />
/// <amd-dependency path="../vendor/jquery.console" />
/// <reference path="../vendor/DefinitelyTyped/ace/ace.d.ts" />
/// <amd-dependency path="../vendor/underscore/underscore" />
declare var BrowserFS: {
  BFSRequire(name: 'process'): NodeProcess;
  BFSRequire(name: 'buffer'): { Buffer: typeof Buffer };
  BFSRequire(name: string): any;
};
declare var Dropbox;
import doppio = require('../src/doppio');
import untar = require('./untar');
// @todo Try to remove this dependency somehow.
import util = require('../src/util');
import fs = require('fs');
import path = require('path');

// Imported for type annotations ONLY
import TJVM = require('../src/jvm');
// End type annotations.

var underscore = require('../vendor/underscore/underscore'),
    disassembler = doppio.disassembler,
    JVM: typeof doppio.JVM = doppio.JVM,
    testing = doppio.testing,
    java_cli = doppio.java_cli,
    process: NodeProcess = BrowserFS.BFSRequire('process'),
    Buffer: typeof Buffer = BrowserFS.BFSRequire('buffer').Buffer,
    // To be initialized on document load
    stdout: (data: NodeBuffer) => void,
    user_input: (resume: (data: any) => void) => void,
    controller: JQConsole,
    editor: AceAjax.Editor,
    jvm_state: TJVM,
    sys_path = '/sys';

function preload(): void {
  fs.readFile(sys_path + "/browser/mini-rt.tar", function(err: Error, data: NodeBuffer): void {
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
    var update_bar = underscore.throttle((function(percent: number, path: string) {
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
    var xhrfs = (<any>fs).getRootFS().mntMap[sys_path];
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
  return process.cwd() + '$ ';
}

$(window).resize(onResize);

// Note: Typescript supposedly has "open interfaces", but I can't get it to
//  work right, so I'm doing this as a hack.

// Add the .files attr for FileReader event targets.
interface FileReaderEvent extends ErrorEvent {
  target: FileReaderEventTarget;
}
interface FileReaderEventTarget extends EventTarget {
  files: File[];
  error: any;
}

// Add the .readAsBinaryString function for FileReader.
interface FileReader2 extends FileReader {
  readAsBinaryString: (f: any) => string;
}

$(document).ready(function() {
  onResize();
  // Put the user in the tmpfs.
  process.chdir('/tmp');
  //editor = $('#editor');
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
    var file_fcn = (function(f: File) {
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
        fs.writeFile(process.cwd() + '/' + f.name, new Buffer(e.target.result), function(err: Error) {
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
    var files = <File[]>ev.target.files;
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
      if (handler == null) {
        return "Unknown command '" + cmd + "'. Enter 'help' for a list of commands.";
      }
      // Check for globs (*) in the arguments, and expand them.
      var expanded_args : string[] = [];
      util.async_foreach(args,
        // runs on each element
        function(arg: string, next_item): void {
          var starIdx = arg.indexOf('*');
          if (starIdx === -1) {
            expanded_args.push(arg);
            return next_item();
          }
          var prefix = arg.slice(0, starIdx);
          var postfix = arg.slice(starIdx+1);
          fileNameCompletions('glob', [prefix], function (comps: string[]) {
            // Filter out completions that don't end in the postfix.
            var comps = comps.filter((c)=>c.indexOf(postfix, c.length-postfix.length) !== -1);
            Array.prototype.push.apply(expanded_args, comps);
            next_item();
          });
        },
        // runs at the end of processing
        function(): void {
          try {
            var response = handler(expanded_args);
            if (response !== null) {
              controller.message(response, 'success');
            }
          } catch (_error) {
            controller.message(_error.toString(), 'error');
          }
        }
      );
    },
    cancelHandle: function(): void {
      if (jvm_state) {
        jvm_state.abort();
      }
    },
    tabComplete: tabComplete,
    autofocus: false,
    animateScroll: true,
    promptHistory: true,
    welcomeMessage: "Welcome to DoppioJVM! You may wish to try the following Java programs:\n" +
      "  cd /sys\n" +
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
      "Enter 'help' for full a list of commands. Ctrl+D is EOF. Ctrl+C is SIGINT. \n\n" +
      "DoppioJVM has been tested with the latest versions of the following desktop browsers:\n" +
      "  Chrome, Safari, Firefox, Opera, Internet Explorer 10, and Internet Explorer 11."
  });
  stdout = function(data: NodeBuffer): void {
    controller.message(data.toString(), '', true);
  }
  user_input = function(resume: (data: any)=>void): void {
    var oldPrompt = controller.promptLabel;
    controller.promptLabel = '';
    controller.reprompt();
    var oldHandle = controller.commandHandle;
    controller.commandHandle = function(line: string) {
      controller.commandHandle = oldHandle;
      controller.promptLabel = oldPrompt;
      if (line === '\0') {
        // EOF
        resume(line);
      } else {
        line += "\n";  // so BufferedReader knows it has a full line
        resume(line);
      }
    };
  }
  function close_editor() {
    $('#ide').fadeOut('fast', function() {
      // click to restore focus
      $('#console').fadeIn('fast').click();
    });
  }
  $('#save_btn').click(function(e: JQueryEventObject) {
    var fname = $('#filename').val();
    var contents = editor.getSession().getValue();
    if (contents[contents.length - 1] !== '\n') {
      contents += '\n';
    }
    fs.writeFile(fname, contents, function(err: Error){
      if (err) {
        controller.message("File could not be saved: " + err, 'error');
      } else {
        controller.message("File saved as '" + fname + "'.", 'success');
      }
    });
    close_editor();
    e.preventDefault();
  });
  $('#close_btn').click(function(e: JQueryEventObject) {
    close_editor();
    e.preventDefault();
  });

  // Set up stdout/stderr/stdin.
  process.stdout.on('data', stdout);
  process.stderr.on('data', stdout);
  process.stdin.on('_read', function() {
    // Something is looking for stdin input.
    user_input(function(data: any) {
      // stdin is typically a readable stream, but it's a duplex in BrowserFS.
      // hence the type hack.
      (<any> process.stdin).write(data);
    });
  });
  new JVM(function(err: any, _jvm_state?: TJVM) {
    if (err) {
      // Throw the error so it appears in the dev console.
      throw err;
    } else {
      jvm_state = _jvm_state;
    }
  }, '/sys/vendor/classes', '/sys/vendor/java_home', '/jars');
  preload();
});

function pad_right(str: string, len: number): string {
  return str + Array(len - str.length + 1).join(' ');
}

// helper function for 'ls'
function read_dir(dir: string, pretty: boolean, columns: boolean, cb: any): void {
  fs.readdir(path.resolve(dir), function(err: Error, contents: string[]){
    if (err || contents.length == 0) {
      return cb('');
    }
    contents = contents.sort();
    if (!pretty) {
      return cb(contents.join('\n'));
    }
    var pretty_list: string[] = [];
    util.async_foreach(contents,
      // runs on each element
      function(c: string, next_item) {
        fs.stat(dir + '/' + c, function(err: Error, stat: fs.Stats) {
          if (err == null) {
            if (stat.isDirectory()) {
              c += '/';
            }
            pretty_list.push(c);
          }
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
  var column_list: string[][] = [];
  for (var j = 1; j <= num_cols; j++) {
    column_list.push(str_list.splice(0, col_size));
  }
  function make_row(i: number): string {
    return column_list.filter((col)=>col[i]!=null)
                      .map((col)=>pad_right(col[i], max_len + 1))
                      .join('');
  }
  var row_list: string[] = [];
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
  view_dump: function(args: string[]): string {
    if (args.length < 1) {
      return "Usage: view_dump <core-file.json>\nUse java -Xdump-state path/to/failing/class to generate one.";
    }
    controller.message('Loading dump file ' + args[0] + '...', 'success', true);
    fs.readFile(args[0], 'utf8', function(err: Error, dump: string) {
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
  ecj: function(args: string[]): string {
    args.unshift('org/eclipse/jdt/internal/compiler/batch/Main');
    args.unshift('-Djdt.compiler.useSingleThread=true');
    java_cli.java(args, {
      jvm_state: jvm_state
    }, function(status: boolean): void {
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
  javac: function(args: string[]): string {
    args.unshift('classes/util/Javac');
    java_cli.java(args, {
      jvm_state: jvm_state,
      implicit_classpath: [sys_path]
    }, function(status: boolean): void {
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
  javac_benchmark: function(): string {
    var args: string[] = ["classes/util/Javac","-d","/tmp","/sys/benchmark/javap/AttrData.java","/sys/benchmark/javap/ClassData.java","/sys/benchmark/javap/Constants.java","/sys/benchmark/javap/CPX.java","/sys/benchmark/javap/CPX2.java","/sys/benchmark/javap/FieldData.java","/sys/benchmark/javap/InnerClassData.java","/sys/benchmark/javap/JavapEnvironment.java","/sys/benchmark/javap/JavapPrinter.java","/sys/benchmark/javap/LineNumData.java","/sys/benchmark/javap/LocVarData.java","/sys/benchmark/javap/Main.java","/sys/benchmark/javap/MethodData.java","/sys/benchmark/javap/RuntimeConstants.java","/sys/benchmark/javap/StackMapData.java","/sys/benchmark/javap/StackMapTableData.java","/sys/benchmark/javap/Tables.java","/sys/benchmark/javap/TrapData.java","/sys/benchmark/javap/TypeSignature.java"];
    java_cli.java(args, {
      jvm_state: jvm_state,
      implicit_classpath: [sys_path]
    }, function(status: boolean): void {
      controller.reprompt();
    });
    return null;
  },
  javap: function(args: string[]): string {
    args.unshift('classes/util/Javap');
    java_cli.java(args, {
      jvm_state: jvm_state,
      implicit_classpath: [sys_path]
    }, function(status: boolean): void {
      controller.reprompt();
    });
    return null;
  },
  javap_benchmark: function(): string {
    var old_stdout = process.stdout.write,
        old_stderr = process.stderr.write,
        old_dir = process.cwd();
    (<any>process.stdout).write = function() {};
    (<any>process.stderr).write = function() {};
    process.chdir('/sys');
    java_cli.java(['classes/util/JavapBenchmark'], {
      jvm_state: jvm_state,
      implicit_classpath: [sys_path]
    }, function(status: boolean): void {
      process.stdout.write = old_stdout;
      process.stderr.write = old_stderr;
      process.chdir(old_dir);
      controller.reprompt();
    });
    return null;
  },
  java: function(args: string[]): string {
    java_cli.java(args, {
      jvm_state: jvm_state,
      launcher_name: 'java'
    }, function(result: boolean): void {
      controller.reprompt();
    });
    return null;
  },
  test: function(args: string[]): string {
    if (args[0] == null) {
      return "Usage: test all|[class(es) to test]";
    }
    // Change dir to $sys_path, because that's where tests expect to be run from.
    var curr_dir = process.cwd();
    function done_cb(): void {
      process.chdir(curr_dir);
      controller.reprompt();
    }
    process.chdir(sys_path);
    if (args[0] === 'all') {
      testing.run_tests({ jvm_state: jvm_state }, sys_path, [], true, false, true, done_cb);
    } else {
      testing.run_tests({ jvm_state: jvm_state }, sys_path, args, false, false, true, done_cb);
    }
    return null;
  },
  disassemble: function(args: string[]): string {
    disassembler.javap(args, function(status: boolean): void {
      controller.reprompt();
    });
    return null;
  },
  rhino: function(args: string[]): string {
    args.unshift('com/sun/tools/script/shell/Main');
    java_cli.java(args, {
      jvm_state: jvm_state
    }, function(result: boolean): void {
      controller.reprompt();
    });
    return null;
  },
  // Disabled for now.
  /*list_cache: function(): string {
    var cached_classes = jvm_state.bs_cl.get_loaded_class_list(true);
    return '  ' + cached_classes.sort().join('\n  ');
  },
  clear_cache: function(): string {
    jvm_state.reset_classloader_cache();
    return 'Class cache cleared';
  },*/
  ls: function(args: string[]): string {
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
    fs.readFile(args[0], 'utf8', function(err: Error, data: string): void {
      if (err) {
        start_editor(defaultFile(args[0]));
      } else {
        start_editor(data);
      }
      controller.reprompt();
    });
  },
  cat: function(args: string[]): string {
    var fname = args[0];
    if (fname == null) {
      return "Usage: cat <file>";
    }
    fs.readFile(fname, 'utf8', function(err: Error, data: string): void {
      if (err) {
        controller.message("Could not open file '" + fname + "': " + err, 'error');
      } else {
        controller.message(data, 'success');
      }
    });
    return null;
  },
  mv: function(args: string[]): string {
    if (args.length < 2) {
      return "Usage: mv <from-file> <to-file>";
    }
    fs.rename(args[0], args[1], function(err?: Error) {
      if (err) {
        controller.message("Could not rename "+args[0]+" to "+args[1]+": "+err, 'error', true);
      }
      controller.reprompt();
    });
    return null;
  },
  mkdir: function(args: string[]): string {
    if (args.length < 1) {
      return "Usage: mkdir <dirname>";
    }
    fs.mkdir(args[0], function(err?: Error) {
      if (err) {
        controller.message("Could not make directory " + args[0] + ".\n", 'error', true);
      }
      controller.reprompt();
    });
    return null;
  },
  cd: function(args: string[]): string {
    if (args.length > 1) {
      return "Usage: cd <directory>";
    }
    var dir: string;
    if (args.length == 0 || args[0] == '~') {
      // Change to the default (starting) directory.
      dir = '/tmp';
    } else {
      dir = path.resolve(args[0]);
    }
    // Verify path exists before going there.
    // chdir does not verify that the directory exists.
    fs.exists(dir, function(doesExist: boolean) {
      if (doesExist) {
        process.chdir(dir);
        controller.promptLabel = ps1();
      } else {
        controller.message("Directory " + dir + " does not exist.\n", 'error', true);
      }
      controller.reprompt();
    })
    return null;
  },
  rm: function(args: string[]): string {
    if (args[0] == null) {
      return "Usage: rm <file>";
    }
    var completed = 0;
    function remove_file(file: string, total: number): void {
      fs.unlink(file, function(err?: Error){
        if (err) {
          controller.message("Could not remove file: " + file + "\n", 'error', true);
        }
        if (++completed == total) {
          controller.reprompt();
        }
      });
    }
    if (args[0] === '*') {
      fs.readdir('.', function(err: Error, fnames: string[]){
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
  mount_dropbox: function(args: string[]): string {
    var api_key: string = "j07r6fxu4dyd08r";
    if (args.length < 1 || args[0] !== 'Y') {
      return "This command may redirect you to Dropbox's site for authentication.\n" +
        "If you would like to proceed with mounting Dropbox into the in-browser " +
        "filesystem, please type \"mount_dropbox Y\".\n" +
        "Once you have successfully authenticated with Dropbox and the page reloads,\n" +
        "you will need to type \"mount_dropbox Y\" again to finish mounting.\n" +
        "If you would like to use your own API key, please type \"mount_dropbox Y your_api_key_here\".";
    }
    if (args.length == 2 && args[1].length === 15) {
      api_key = args[1];
    }
    var client = new Dropbox.Client({ key: api_key });
    client.authenticate(function(error: any, data?: any): void {
      var mfs;
      if (error == null) {
        mfs = (<any>fs).getRootFS();
        mfs.mount('/mnt/dropbox', new (<any>BrowserFS).FileSystem.Dropbox(client));
        controller.message("Successfully connected to your Dropbox account. You can now access files in the /Apps/DoppioJVM folder of your Dropbox account at /mnt/dropbox.", 'success');
        return;
      } else {
        controller.message("Unable to connect to Dropbox: " + error, 'error');
        return;
      }
    });
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
      "  javac <source file>     -- Invoke the Java 6 compiler.\n" +
      "  java <class> [args...]  -- Run with command-line arguments.\n" +
      "  javap [args...] <class> -- Run the Java 6 disassembler.\n" +
      "  disassemble <class>     -- Run our own custom Java disassembler.\n" +
      "  time                    -- Measure how long it takes to run a command.\n" +
      "  rhino                   -- Run Rhino, the Java-based JavaScript engine.\n\n" +
      "File management:\n" +
      "  cat <file>              -- Display a file in the console.\n" +
      "  edit <file>             -- Edit a file.\n" +
      "  ls <dir>                -- List files.\n" +
      "  mv <src> <dst>          -- Move / rename a file.\n" +
      "  rm <file>               -- Delete a file.\n" +
      "  mkdir <dir>             -- Create a directory.\n" +
      "  cd <dir>                -- Change current directory.\n" +
      "  mount_dropbox           -- Mount a Dropbox folder into the file system.\n\n";
      /*"Cache management:\n" +
      "  list_cache              -- List the cached class files.\n" +
      "  clear_cache             -- Clear the cached class files.";*/
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

function getCompletions(args: string[], cb: (c: string[])=>void): void {
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
  } else if (cmd === 'javap' || cmd === 'disassemble') {
    return ext === 'class';
  } else if (cmd === 'java') {
    return ext === 'class' || ext === 'jar';
  }else {
    return true;
  }
}

function fileNameCompletions(cmd: string, args: string[], cb: (c: string[])=>void): void {
  var chopExt = args.length === 2 && (cmd === 'javap' || cmd === 'java');
  var toComplete = util.last(args);
  var lastSlash = toComplete.lastIndexOf('/');
  var dirPfx: string, searchPfx: string;
  if (lastSlash >= 0) {
    dirPfx = toComplete.slice(0, lastSlash + 1);
    searchPfx = toComplete.slice(lastSlash + 1);
  } else {
    dirPfx = '';
    searchPfx = toComplete;
  }
  var dirPath = (dirPfx == '') ? '.' : path.resolve(dirPfx);
  fs.readdir(dirPath, function(err: Error, dirList: string[]){
    var completions: string[] = [];
    if (err != null) {
      return cb(completions)
    }
    dirList = filterSubstring(searchPfx, dirList);
    util.async_foreach(dirList,
      // runs on each element
      function(item: string, next_item: ()=>void) {
        fs.stat(path.resolve(dirPfx + item), function(err: Error, stats) {
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
