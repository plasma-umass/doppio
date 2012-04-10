root = this

# To be initialized on document load
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
      bar ?= $('#progress > .bar')
      preloading_file ?= $('#preloading-file')
      # +10% hack to make the bar appear fuller before fading kicks in
      display_perc = Math.min Math.ceil(percent*100) + 10, 100
      bar.width "#{display_perc}%", 150
      preloading_file.text(
        if display_perc < 100 then "Loading #{_.last path.split '/'}"  else "Done!"))

    untar new util.BytesArray(util.bytestr_to_array data), ((percent, path, file) ->
      update_bar(percent, path)
      raw_cache[path] = file[0..]
      base_dir = 'third_party/classes/'
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

if RELEASE?
  $.ajax "third_party/classes/sun/tools/javac/Main.class", {
    type: 'GET'
    dataType: 'text'
    beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
    success: (data) -> class_cache['!javac'] = process_bytecode data
  }

try_path = (path) ->
  # hack. we should implement proper directories
  local_file = DoppioFile.load _.last(path.split '/')
  return util.bytestr_to_array local_file.data if local_file?
  rv = null
  $.ajax path, {
    type: 'GET'
    dataType: 'text'
    async: false
    beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
    success: (data) -> rv = util.bytestr_to_array data
  }
  rv

# Read in a binary classfile synchronously. Return an array of bytes.
read_classfile = (cls) ->
  unless class_cache[cls]?
    classpath = [ "third_party/classes/", "" ]
    for path in classpath
      fullpath = "#{path}#{cls}.class"
      if fullpath of raw_cache
        class_cache[cls] = new ClassFile raw_cache[fullpath]
        break
      data = try_path fullpath
      if data?
        raw_cache[fullpath] = data
        class_cache[cls] = new ClassFile data
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

compile_source = (fname, quiet) ->
  source = DoppioFile.load(fname).read()
  return controller.message "Could not find file '#{fname}'.", 'error' unless source?
  $.ajax 'http://people.cs.umass.edu/~ccarey/javac/', {
    type: 'POST'
    data: { pw: 'coffee', source: source }
    dataType: 'text'
    beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
    success:  (data) ->
      class_name = fname.split('.')[0]
      (new DoppioFile "#{class_name}.class").write(data).save()
      unless quiet
        controller.reprompt()
    error: (jqXHR, textStatus, errorThrown) -> 
      controller.message "AJAX error: #{errorThrown}", 'error'
  }

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
    if ext == 'class'
      reader.onload = (e) ->
        (new DoppioFile f.name).write(e.target.result).save()
        controller.message "File '#{f.name}' saved.", 'success'
        editor.getSession?().setValue("/*\n * Binary file: #{f.name}\n */")
        $('#console').click() # click to restore focus
      reader.readAsBinaryString(f)
    else # assume a text file
      reader.onload = (e) ->
        (new DoppioFile f.name).write(e.target.result).save()
        controller.message "File '#{f.name}' saved.", 'success'
        editor.getSession?().setValue(e.target.result)
        $('#console').click() # click to restore focus
      reader.readAsText(f)

  jqconsole = $('#console')
  controller = jqconsole.console
    promptLabel: 'doppio > '
    commandHandle: (line) ->
      [cmd,args...] = line.split /\s+/
      if cmd == '' then return true
      handler = commands[cmd]
      try
        if handler? then handler(args)
        else "Unknown command '#{cmd}'. Enter 'help' for a list of commands."
      catch e
        controller.message e.toString(), 'error'
    tabComplete: tabComplete
    autofocus: false
    animateScroll: true
    promptHistory: true
    welcomeMessage: "Enter 'help' for a list of commands. Ctrl-D is EOF."

  user_input = (n_bytes, resume) ->
    oldPrompt = controller.promptLabel
    controller.promptLabel = '> '
    controller.reprompt()
    oldHandle = controller.commandHandle
    controller.commandHandle = (line) ->
      controller.commandHandle = oldHandle
      controller.promptLabel = oldPrompt
      if line == '\0' # EOF
        resume 0
      else
        line += "\n" # so BufferedReader knows it has a full line
        resume (line.charCodeAt(i) for i in [0...Math.min(n_bytes,line.length)])

  close_editor = ->
    $('#ide').fadeOut 'fast', ->
      $('#console').fadeIn('fast').click() # click to restore focus

  $('#save_btn').click (e) ->
    fname = $('#filename').val()
    contents = editor.getSession().getValue()
    contents += '\n' unless contents[contents.length-1] == '\n'
    (new DoppioFile fname).write(contents).save()
    controller.message("File saved as '#{fname}'.", 'success')
    close_editor()
    e.preventDefault()

  $('#close_btn').click (e) -> close_editor(); e.preventDefault()

commands =
  javac: (args, cb) ->
    unless RELEASE?
      return "Usage: javac <source file>" unless args[0]?
      return compile_source args[0], cb
    stdout = (str) -> controller.message str, '', true # noreprompt
    rs = new runtime.RuntimeState(stdout, user_input, read_classfile)
    # hack: use a special class name that won't clash with real ones
    jvm.run_class(rs, '!javac', args, -> controller.reprompt())
  java: (args, cb) ->
    return "Usage: java class [args...]" unless args[0]?
    stdout = (str) -> controller.message str, '', true # noreprompt
    rs = new runtime.RuntimeState(stdout, user_input, read_classfile)
    jvm.run_class(rs, args[0], args[1..], -> controller.reprompt())
  javap: (args) ->
    return "Usage: javap class" unless args[0]?
    raw_data = DoppioFile.load("#{args[0]}.class").read()
    return ["Could not find class '#{args[0]}'.",'error'] unless raw_data?
    disassembler.disassemble process_bytecode raw_data
  list_cache: ->
    (name for name of raw_cache).join '\n'
  clear_cache: (args) ->
    raw_cache = {}
    class_cache = {}
    "Cache cleared."
  ls: (args) ->
    (node.fs.readdirSync '.').sort().join '\n'
  edit: (args) ->
    data = if args[0]? then DoppioFile.load(args[0]).read() else defaultFile
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
    DoppioFile.load(fname).read()
  mv: (args) ->
    f = DoppioFile.load args[0]
    f.name = args[1]
    f.save()
    DoppioFile.delete args[0]
    true
  rm: (args) ->
    return "Usage: rm <file>" unless args[0]?
    # technically we should look only for keys starting with 'file::', but at the
    # moment they are the only kinds of keys we use
    if args[0] == '*' then localStorage.clear()
    else DoppioFile.delete args[0]
    true
  load_demos: ->
    demos = ['special/DiffPrint.class', 'special/Chatterbot.java', 'special/Lzw.java',
      'special/RegexTestHarness.java', 'special/FileRead.java', 'special/foo',
      'special/bar']
    for demo in demos
      $.ajax "test/#{demo}", {
        type: 'GET'
        dataType: 'text'
        async: false
        beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
        success: (data) ->
          fname = _.last(demo.split '/')
          (new DoppioFile fname).write(data).save()
          controller.message "Loaded '#{fname}'.\n", 'success', true
        error: ->
          fname = _.last(demo.split '/')
          controller.message "Could not load '#{fname}'.\n", 'error', true
      }
    controller.message """
      All files should have been loaded.

      After compiling them, you may wish to try the following commands:
        java Chatterbot
        java DiffPrint foo bar
        java RegexTestHarness
        java FileRead
        java Lzw c foo foo_lzw (use 'cat' or 'edit' to see the result)
        java Lzw d foo_lzw foo

      After running these programs, use 'list_cache' to see the Java Class
      Library files that they depended upon.
    """
  emacs: -> "Try 'vim'."
  vim: -> "Try 'emacs'."
  time: (args) ->
    start = (new Date).getTime()
    controller.onreprompt = ->
      controller.onreprompt = null
      end = (new Date).getTime()
      controller.message "\nCommand took a total of #{end-start}ms to run.", '', true
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
          controller.message "\n#{args[0]} took an average of #{duration/runs}ms.", '', true
          return
        end = (new Date).getTime()
        if count++ == 0 # first one to warm the cache
          return time_once()
        duration += end - start
        time_once()
      commands['java'](args)
    time_once()
  help: (args) ->
    """
    Ctrl-D is EOF.

    Java-related commands:
      javac <source file>    -- Compile Java source.
      java <class> [args...] -- Run with command-line arguments.
      javap <class>          -- Display disassembly.
      time                   -- Measure how long it takes to run a command.

    File management:
      load_demos             -- Load all demos.
      cat <file>             -- Display a file in the console.
      edit <file>            -- Edit a file.
      ls                     -- List all files.
      mv <src> <dst>         -- Move / rename a file.
      rm <file>              -- Delete a file.

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
  promptText = promptText.substr(0, promptText.length - _.last(args).length)
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
  lastArg = new RegExp('^'+_.last(args),flags='i')
  completions = []
  for i in [0...localStorage.length] by 1
    key = localStorage.key(i)
    continue unless key.substr(0, 6) is 'file::'
    file = DoppioFile.load key.substr(6) # hack
    continue unless file? and validExtension(file.name)
    if file.name.match(lastArg)?
      completions.push(if chopExt then file.name.split('.',1)[0] else file.name)
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
