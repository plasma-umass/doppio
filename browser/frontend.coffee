# To be initialized on document load
user_input = null
controller = null
editor = null

class_cache = {}

# Read in a binary classfile synchronously. Return an array of bytes.
read_classfile = (cls) ->
  unless class_cache[cls]?
    classpath = [ "http://localhost:8000", "http://localhost:8000/third_party/classes" ]
    try_path = (path) ->
      rv = null
      $.ajax "#{path}/#{cls}.class", {
        type: 'GET'
        dataType: 'text'
        async: false
        beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
        success: (data) -> rv = util.bytestr_to_array data
      }
      rv
    for path in classpath
      class_cache[cls] = try_path path
      break if class_cache[cls]?
  throw "AJAX error when loading class #{cls}" unless class_cache[cls]?
  class_cache[cls].slice(0) # return a copy

process_bytecode = (bytecode_string) ->
  bytes_array = util.bytestr_to_array bytecode_string
  new ClassFile(bytes_array)

compile_source = (fname) ->
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
      class_data = process_bytecode(data)
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
    reader = new FileReader
    reader.onerror = (e) ->
      switch e.target.error.code
        when e.target.error.NOT_FOUND_ERR then alert "404'd"
        when e.target.error.NOT_READABLE_ERR then alert "unreadable"
        when e.target.error.SECURITY_ERR then alert "only works with --allow-file-access-from-files"
    ext = f.name.split('.')[1]
    if ext == 'java'
      reader.onload = (e) ->
        (new DoppioFile f.name).write(e.target.result).save()
        controller.message "File '#{f.name}' saved.", 'success'
        editor.getSession?().setValue(e.target.result)
      reader.readAsText(f)
    else if ext == 'class'
      reader.onload = (e) ->
        (new DoppioFile f.name).write(e.target.result).save()
        controller.message "File '#{f.name}' saved.", 'success'
        editor.getSession?().setValue("/*\n * Binary file: #{f.name}\n */")
        process_bytecode e.target.result
      reader.readAsBinaryString(f)
    else
      alert 'Unrecognized file type!'

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
    welcomeMessage: "Enter 'help' for a list of commands."

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
    (new DoppioFile fname).write(editor.getSession().getValue()).save()
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
    rs = new runtime.RuntimeState(stdout, user_input, fs, read_classfile)
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
    (f.name for f in files).sort().join '\n'
  edit: (args) ->
    data = DoppioFile.load(args[0])?.read() or defaultFile
    $('#console').fadeOut 'fast', ->
      $('#filename').val args[0]
      $('#ide').fadeIn('fast')
      # initialize the editor. technically we only need to do this once, but more
      # than once is fine too
      editor = ace.edit('source')
      JavaMode = require("ace/mode/java").Mode
      editor.getSession().setMode new JavaMode
      editor.getSession().setValue(data)
    true
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
  emacs: -> "Try 'vim'."
  vim: -> "Try 'emacs'."
  time: (args) ->
    start = (new Date).getTime()
    controller.onreprompt = ->
      controller.onreprompt = null
      end = (new Date).getTime()
      controller.message "\nCommand took a total of #{end-start}ms to run.", '', true
    commands[args.shift()](args)
  help: (args) ->
    """
    javac <source file>    -- Compile Java source.
    java <class> [args...] -- Run with command-line arguments.
    javap <class>          -- Display disassembly.
    edit <file>            -- Edit a file.
    ls                     -- List all files.
    rm <file>              -- Delete a file.
    list_cache             -- List the cached class data.
    clear_cache            -- Clear the cached class data.
    time                   -- Measure how long it takes to run a command.
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
    continue unless validExtension(file.name)
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
