# To be initialized on document load
user_input = null
controller = null
editor = null
progress = null

class_cache = {}

$.ajax "browser/mini-rt.tar", {
  type: 'GET'
  dataType: 'text'
  beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
  success: (data) ->
    file_count = 0
    done = false
    bar = $('#progress > .bar')
    preloading_file = $('#preloading-file')
    on_complete = ->
      $('#overlay').fadeOut 'slow'
      $('#progress-container').fadeOut 'slow'
    update_bar = _.throttle ((percent, path) ->
      # +10% hack to make the bar appear fuller before fading kicks in
      display_perc = Math.min Math.ceil(percent*100) + 10, 100
      bar.width "#{display_perc}%", 150
      preloading_file.text(
        if display_perc < 100 then "Loading #{_.last path.split '/'}"  else "Done!"))

    untar util.bytestr_to_array(data), ((percent, path, file) ->
      file_count++
      update_bar(percent, path)
      cls = /third_party\/classes\/([^.]*).class/.exec(path)[1]
      setTimeout (->
        class_cache[cls] = new ClassFile file
        on_complete() if --file_count == 0 and done
      ), 0),
      ->
        done = true
        on_complete() if file_count == 0
  error: (jqXHR, textStatus, errorThrown) ->
    console.error errorThrown
}

# Read in a binary classfile synchronously. Return an array of bytes.
read_classfile = (cls) ->
  unless class_cache[cls]?
    classpath = [ "", "third_party/classes/" ]
    try_path = (path) ->
      rv = null
      $.ajax "#{path}#{cls}.class", {
        type: 'GET'
        dataType: 'text'
        async: false
        beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
        success: (data) -> rv = util.bytestr_to_array data
      }
      rv
    for path in classpath
      data = try_path path
      if data?
        class_cache[cls] = new ClassFile data
        break
  class_cache[cls]

process_bytecode = (bytecode_string) ->
  bytes_array = util.bytestr_to_array bytecode_string
  new ClassFile(bytes_array)

compile_source = (fname, quiet) ->
  throw 'Sorry, the compiler has been disabled.' if RELEASE?
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
  util.log_level = 0
  editor = $('#editor')
  # set up the local file loaders
  $('#file').change (ev) ->
    f = ev.target.files[0]
    unless FileReader?
      controller.message """
        Your browser doesn't support file loading.
        Try using the editor to create files instead.
        """, "error"
      return
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
        process_bytecode e.target.result
      reader.readAsBinaryString(f)
    else # assume a text file
      reader.onload = (e) ->
        (new DoppioFile f.name).write(e.target.result).save()
        controller.message "File '#{f.name}' saved.", 'success'
        editor.getSession?().setValue(e.target.result)
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
    autofocus: true
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
    return "Usage: javac <source file>" unless args[0]?
    compile_source args[0], cb
  java: (args, cb) ->
    return "Usage: java class [args...]" unless args[0]?
    raw_data = DoppioFile.load("#{args[0]}.class").read()
    return ["Could not find class '#{args[0]}'.",'error'] unless raw_data?
    class_data = process_bytecode raw_data
    stdout = (str) -> controller.message str, '', true # noreprompt
    rs = new runtime.RuntimeState(stdout, user_input, read_classfile)
    jvm.run_class(rs, class_data, args[1..], ->
      controller.reprompt()
    )
  javap: (args) ->
    return "Usage: javap class" unless args[0]?
    raw_data = DoppioFile.load("#{args[0]}.class").read()
    return ["Could not find class '#{args[0]}'.",'error'] unless raw_data?
    class_data = process_bytecode raw_data
    disassembler.disassemble class_data
  list_cache: ->
    (name for name of class_cache).join '\n'
  clear_cache: (args) ->
    class_cache = {}
    "Cache cleared."
  ls: (args) ->
    files =
      for key, file of localStorage when key[..5] == 'file::'
        DoppioFile.load key[6..]
    (f.name for f in files when f?).sort().join '\n'
  edit: (args) ->
    data = DoppioFile.load(args[0])?.read() or defaultFile
    $('#console').fadeOut 'fast', ->
      $('#filename').val args[0]
      $('#ide').fadeIn('fast')
      # initialize the editor. technically we only need to do this once, but more
      # than once is fine too
      editor = ace.edit('source')
      ext = args[0].split('.')[1]
      if ext is 'java'
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
  return if prefix == ''
  # delete existing text so we can do case correction
  promptText = promptText.substr(0, promptText.length - _.last(args).length)
  controller.promptText(promptText + prefix)

commandCompletions = (cmd) ->
  (name for name, handler of commands when name.substr(0, cmd.length) is cmd)

fileNameCompletions = (cmd, args) ->
  validExtension = (fname) ->
    ext = fname.split('.')[1]
    if cmd is 'javac' then ext is 'java'
    else if cmd is 'javap' or cmd is 'java' then ext is 'class'
    else true
  keepExt = -> return cmd isnt 'javap' and cmd isnt 'java'
  lastArg = _.last(args).toLowerCase()
  potentialCompletions = []
  for i in [0...localStorage.length] by 1
    key = localStorage.key(i)
    continue unless key.substr(0, 6) is 'file::'
    file = DoppioFile.load key.substr(6) # hack
    continue unless file? and validExtension(file.name)
    if (file.name.substr(0, lastArg.length).toLowerCase() is lastArg)
      potentialCompletions.push(
        if not keepExt() then file.name.split('.')[0]
        else file.name
      )
  potentialCompletions

longestCommmonPrefix = (lst) ->
  return "" if lst.length is 0
  prefix = lst[0]
  # slow, but should be fine with our small number of completions
  for word in lst
    lower = word.toLowerCase()
    for c, idx in prefix
      if (c.toLowerCase() isnt lower[idx])
        prefix = prefix.substr(0, idx)
        break
  prefix

defaultFile =
  """
  class Test {
    public static void main(String[] args) {
      // enter code here
    }
  }
  """
