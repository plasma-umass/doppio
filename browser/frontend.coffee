root = this

"use strict"

# To be initialized on document load
stdout = null
user_input = null
controller = null
editor = null
progress = null

class_cache = {}
raw_cache = {}

$.ajax "browser/mini-rt.tar", {
  type: 'GET'
  dataType: 'text'
  beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
  success: (data) ->
    file_count = 0
    done = false
    start_untar = (new Date).getTime()
    on_complete = ->
      end_untar = (new Date).getTime()
      console.log "Untarring took a total of #{end_untar-start_untar}ms."
      $('#overlay').fadeOut 'slow'
      $('#progress-container').fadeOut 'slow'
      $('#console').click()
    update_bar = _.throttle ((percent, path) ->
      bar = $('#progress > .bar')
      preloading_file = $('#preloading-file')
      # +10% hack to make the bar appear fuller before fading kicks in
      display_perc = Math.min Math.ceil(percent*100), 100
      bar.width "#{display_perc}%", 150
      preloading_file.text(
        if display_perc < 100 then "Loading #{path}"  else "Done!"))

    untar new util.BytesArray(util.bytestr_to_array data), ((percent, path, file) ->
      update_bar(percent, path)
      raw_cache[path] = file
      base_dir = 'vendor/classes/'
      [base,ext] = path.split('.')
      unless ext is 'class'
        on_complete() if percent == 100
        return
      file_count++
      cls = base.substr(base_dir.length)
      asyncExecute (->
        class_cache[cls] = new ClassFile file
        on_complete() if --file_count == 0 and done
      ), 0),
      ->
        done = true
        on_complete() if file_count == 0
  error: (jqXHR, textStatus, errorThrown) ->
    console.error errorThrown
}

$.ajax "vendor/classes/com/sun/tools/script/shell/Main.class", {
  type: 'GET'
  dataType: 'text'
  beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
  success: (data) -> class_cache['!rhino'] = process_bytecode data
}

try_path = (path) ->
  try
    return util.bytestr_to_array node.fs.readFileSync(path)
  catch e
    return null

# Read in a binary classfile synchronously. Return an array of bytes.
read_classfile = (cls) ->
  unless class_cache[cls]?
    for path in jvm.classpath
      fullpath = "#{path}#{cls}.class"
      if fullpath of raw_cache
        continue if raw_cache[fullpath] == null # we tried this path previously & it failed
        class_cache[cls] = new ClassFile raw_cache[fullpath]
        break
      raw_cache[fullpath] = try_path fullpath
      if raw_cache[fullpath]?
        class_cache[cls] = new ClassFile raw_cache[fullpath]
        break
  class_cache[cls]

root.read_raw_class = (path) ->
  unless raw_cache[path]?
    data = try_path path
    raw_cache[path] = data if data?
  raw_cache[path]

process_bytecode = (bytecode_string) ->
  bytes_array = util.bytestr_to_array bytecode_string
  new ClassFile(bytes_array)

$(document).ready ->
  editor = $('#editor')
  # set up the local file loaders
  $('#file').change (ev) ->
    f = ev.target.files[0]
    unless FileReader?
      controller.message """
        Your browser doesn't support file loading.
        Try using the editor to create files instead.
        """, "error"
      return $('#console').click() # click to restore focus
    reader = new FileReader
    reader.onerror = (e) ->
      switch e.target.error.code
        when e.target.error.NOT_FOUND_ERR then alert "404'd"
        when e.target.error.NOT_READABLE_ERR then alert "unreadable"
        when e.target.error.SECURITY_ERR then alert "only works with --allow-file-access-from-files"
    ext = f.name.split('.')[1]
    isClass = ext == 'class'
    reader.onload = (e) ->
      node.fs.writeFileSync(f.name, e.target.result)
      controller.message "File '#{f.name}' saved.", 'success'
      if isClass
        editor.getSession?().setValue("/*\n * Binary file: #{f.name}\n */")
      else
        editor.getSession?().setValue(e.target.result)
      $('#console').click() # click to restore focus
      if isClass then reader.readAsBinaryString(f) else reader.readAsText(f)

  jqconsole = $('#console')
  controller = jqconsole.console
    promptLabel: 'doppio > '
    commandHandle: (line) ->
      [cmd,args...] = line.trim().split(/\s+/)
      if cmd == '' then return true
      handler = commands[cmd]
      try
        if handler? then handler(a.trim() for a in args when a.length>0)
        else "Unknown command '#{cmd}'. Enter 'help' for a list of commands."
      catch e
        controller.message e.toString(), 'error'
    tabComplete: tabComplete
    autofocus: false
    animateScroll: true
    promptHistory: true
    welcomeMessage: """
      Welcome to Doppio! You may wish to try the following Java programs:
        java classes/test/FileRead
        java classes/demo/Fib <num>
        java classes/demo/Chatterbot
        java classes/demo/RegexTestHarness
        java classes/demo/Lzw c Hello.txt hello.lzw (compress)
        java classes/demo/Lzw d hello.lzw hello (decompress)
        java classes/demo/DiffPrint Hello.txt hello

      We support the stock Sun Java Compiler:
        javac classes/test/FileRead.java
        javac classes/demo/Fib.java

      And we can even run Rhino, the Java-based JS engine!
        rhino

      Text files can be edited by typing `edit [filename]`.

      You can also upload your own files using the uploader above the top-right
      corner of the console.

      Enter 'help' for full a list of commands. Ctrl-D is EOF.
      """

  stdout = (str) -> controller.message str, '', true # noreprompt

  user_input = (n_bytes, resume) ->
    oldPrompt = controller.promptLabel
    controller.promptLabel = ''
    controller.reprompt()
    oldHandle = controller.commandHandle
    controller.commandHandle = (line) ->
      controller.commandHandle = oldHandle
      controller.promptLabel = oldPrompt
      if line == '\0' # EOF
        resume 0
      else
        line += "\n" # so BufferedReader knows it has a full line
        resume (line.charCodeAt(i) for i in [0...Math.min(n_bytes,line.length)] by 1)

  close_editor = ->
    $('#ide').fadeOut 'fast', ->
      $('#console').fadeIn('fast').click() # click to restore focus

  $('#save_btn').click (e) ->
    fname = $('#filename').val()
    contents = editor.getSession().getValue()
    contents += '\n' unless contents[contents.length-1] == '\n'
    node.fs.writeFileSync(fname, contents)
    controller.message("File saved as '#{fname}'.", 'success')
    close_editor()
    e.preventDefault()

  $('#close_btn').click (e) -> close_editor(); e.preventDefault()

commands =
  javac: (args, cb) ->
    jvm.classpath = [ "./", "/home/doppio/vendor/classes/", "/home/doppio" ]
    rs = new runtime.RuntimeState(stdout, user_input, read_classfile)
    jvm.run_class(rs, 'classes/util/Javac', args, -> controller.reprompt())
    return null  # no reprompt, because we handle it ourselves
  java: (args, cb) ->
    if !args[0]? or (args[0] == '-classpath' and args.length < 3)
      return "Usage: java [-classpath path1:path2...] class [args...]"
    if args[0] == '-classpath'
      jvm.classpath = args[1].split(':')
      jvm.classpath.push "/home/doppio/vendor/classes/"
      class_name = args[2]
      class_args = args[3..]
    else
      jvm.classpath = [ "./", "/home/doppio/vendor/classes/" ]
      class_name = args[0]
      class_args = args[1..]
    rs = new runtime.RuntimeState(stdout, user_input, read_classfile)
    jvm.run_class(rs, class_name, class_args, -> controller.reprompt())
    return null  # no reprompt, because we handle it ourselves
  test: (args) ->
    return "Usage: test all|[class(es) to test]" unless args[0]?
    if args[0] == 'all'
      testing.run_tests [], stdout, false, true, -> controller.reprompt()
    else
      testing.run_tests args, stdout, false, true, -> controller.reprompt()
    return null
  javap: (args) ->
    return "Usage: javap class" unless args[0]?
    try
      raw_data = node.fs.readFileSync("#{args[0]}.class")
    catch e
      return ["Could not find class '#{args[0]}'.",'error']
    disassembler.disassemble process_bytecode raw_data
    return null  # no reprompt, because we handle it ourselves
  rhino: (args, cb) ->
    jvm.classpath = [ "./", "/home/doppio/vendor/classes/" ]
    rs = new runtime.RuntimeState(stdout, user_input, read_classfile)
    jvm.run_class(rs, '!rhino', args, -> controller.reprompt())
    return null  # no reprompt, because we handle it ourselves
  list_cache: ->
    ((if val? then '' else '-') + name for name, val of raw_cache).join '\n'
  clear_cache: (args) ->
    raw_cache = {}
    class_cache = {}
    "Cache cleared."
  ls: (args) ->
    read_dir = (dir) -> node.fs.readdirSync(dir).sort().join '\n'
    if args.length == 0
      read_dir '.'
    else if args.length == 1
      read_dir args[0]
    else
      ("#{d}:\n#{read_dir d}\n" for d in args).join '\n'
  edit: (args) ->
    try
      data = if args[0]? then node.fs.readFileSync(args[0]) else defaultFile
    catch e
      data = defaultFile
    $('#console').fadeOut 'fast', ->
      $('#filename').val args[0]
      $('#ide').fadeIn('fast')
      # initialize the editor. technically we only need to do this once, but more
      # than once is fine too
      editor = ace.edit('source')
      editor.setTheme 'ace/theme/twilight'
      ext = args[0]?.split('.')[1]
      if ext is 'java' or not args[0]?
        JavaMode = require("ace/mode/java").Mode
        editor.getSession().setMode(new JavaMode)
      else
        TextMode = require("ace/mode/text").Mode
        editor.getSession().setMode(new TextMode)
      editor.getSession().setValue(data)
    true
  cat: (args) ->
    fname = args[0]
    return "Usage: cat <file>" unless fname?
    try
      return node.fs.readFileSync(fname)
    catch e
      return "ERROR: #{fname} does not exist."
  mv: (args) ->
    if args.length < 2 then return "Usage: mv <from-file> <to-file>"
    try
      node.fs.renameSync(args[0], args[1])
    catch e
      return "Invalid arguments."
    true
  cd: (args) ->
    if args.length > 1 then return "Usage: cd <directory>"
    if args.length == 0 then args.push("~")
    try
      node.process.chdir(args[0])
    catch e
      return "Invalid directory."
    true
  rm: (args) ->
    return "Usage: rm <file>" unless args[0]?
    if args[0] == '*'
      fnames = node.fs.readdirSync('.')
      for fname in fnames
        fstat = node.fs.statSync(fname)
        if fstat.is_directory
          return "ERROR: '#{fname}' is a directory."
        node.fs.unlinkSync(fname)
    else node.fs.unlinkSync args[0]
    true
  emacs: -> "Try 'vim'."
  vim: -> "Try 'emacs'."
  time: (args) ->
    start = (new Date).getTime()
    console.profile args[0]
    controller.onreprompt = ->
      controller.onreprompt = null
      console.profileEnd()
      end = (new Date).getTime()
      controller.message "\nCommand took a total of #{end-start}ms to run.\n", '', true
    commands[args.shift()](args)
  profile: (args) ->
    count = 0
    runs = 5
    duration = 0
    time_once = ->
      start = (new Date).getTime()
      controller.onreprompt = ->
        unless count < runs
          controller.onreprompt = null
          controller.message "\n#{args[0]} took an average of #{duration/runs}ms.\n", '', true
          return
        end = (new Date).getTime()
        if count++ == 0 # first one to warm the cache
          return time_once()
        duration += end - start
        time_once()
      commands[args.shift()](args)
    time_once()
  help: (args) ->
    """
    Ctrl-D is EOF.

    Java-related commands:
      javac <source file>    -- Invoke the Java 6 compiler.
      java <class> [args...] -- Run with command-line arguments.
      javap <class>          -- Display disassembly.
      time                   -- Measure how long it takes to run a command.

    File management:
      cat <file>             -- Display a file in the console.
      edit <file>            -- Edit a file.
      ls <dir>               -- List files.
      mv <src> <dst>         -- Move / rename a file.
      rm <file>              -- Delete a file.
      cd <dir>               -- Change current directory.

    Cache management:
      list_cache             -- List the cached class files.
      clear_cache            -- Clear the cached class files.
    """

tabComplete = ->
  promptText = controller.promptText()
  args = promptText.split /\s+/
  getCompletions = (args) ->
    if args.length is 1 then commandCompletions args[0]
    else if args[0] is 'time' then getCompletions(args[1..])
    else fileNameCompletions args[0], args
  prefix = longestCommmonPrefix(getCompletions(args))
  return if prefix == ''  # TODO: if we're tab-completing a blank, show all options
  # delete existing text so we can do case correction
  promptText = promptText.substr(0, promptText.length - util.last(args).length)
  controller.promptText(promptText + prefix)

commandCompletions = (cmd) ->
  (name for name, handler of commands when name.substr(0, cmd.length) is cmd)

fileNameCompletions = (cmd, args) ->
  validExtension = (fname) ->
    dot = fname.lastIndexOf('.')
    ext = if dot is -1 then '' else fname.slice(dot+1)
    if cmd is 'javac' then ext is 'java'
    else if cmd is 'javap' or cmd is 'java' then ext is 'class'
    else true
  chopExt = args.length == 2 and (cmd is 'javap' or cmd is 'java')
  toComplete = util.last(args)
  lastSlash = toComplete.lastIndexOf('/')
  if lastSlash >= 0
    dirPfx = toComplete.slice(0, lastSlash+1)
    searchPfx = toComplete.slice(lastSlash+1)
  else
    dirPfx = ''
    searchPfx = toComplete
  try
    dirList = node.fs.readdirSync(if dirPfx == '' then '.' else dirPfx)
    # Slight cheat.
    dirList.push('..')
    dirList.push('.')
  catch e
    return []

  completions = []
  for item in dirList
    isDir = node.fs.statSync(dirPfx + item)?.isDirectory()
    continue unless validExtension(item) or isDir
    if item.slice(0, searchPfx.length) == searchPfx
      if isDir
        completions.push(dirPfx + item + '/')
      else if cmd != 'cd'
        completions.push(dirPfx + (if chopExt then item.split('.',1)[0] else item))
  completions

# use the awesome greedy regex hack, from http://stackoverflow.com/a/1922153/10601
longestCommmonPrefix = (lst) -> lst.join(' ').match(/^(\S*)\S*(?: \1\S*)*$/i)[1]

defaultFile =
  """
  class Test {
    public static void main(String[] args) {
      // enter code here
    }
  }
  """
