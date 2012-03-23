# To be initialized on document load
user_input = null
controller = null
editor = null
# For caching the runtime state across program runs
rs = null

# convenience functions for reading files from localStorage.
save_file = (fname, data) -> localStorage["file::#{fname}"] = data
load_file = (fname) -> localStorage["file::#{fname}"]
delete_file = (fname) -> localStorage.removeItem "file::#{fname}"

# Read in a binary classfile synchronously. Return an array of bytes.
read_classfile = (cls) ->
  rv = null
  classpath = [ "http://localhost:8000", "http://localhost:8000/third_party/classes" ]
  try_path = (path) ->
    $.ajax "#{path}/#{cls}.class", {
      type: 'GET'
      dataType: 'text'
      async: false
      beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
      success: (data) -> rv = util.bytestr_to_array data
    }
  for path in classpath
    try_path path
    return rv unless rv is null
  throw "AJAX error when loading class #{cls}"

process_bytecode = (bytecode_string) ->
  bytes_array = util.bytestr_to_array bytecode_string
  new ClassFile(bytes_array)

compile_source = (fname, cb) ->
  source = load_file fname
  return cb "Could not find file '#{fname}'" unless source?
  $.ajax 'http://people.cs.umass.edu/~ccarey/javac/', {
    type: 'POST'
    data: { pw: 'coffee', source: source }
    dataType: 'text'
    beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
    success:  (data) ->
      class_name = fname.split('.')[0]
      save_file "#{class_name}.class", data
      class_data = process_bytecode(data)
      cb?(true)
    error: (jqXHR, textStatus, errorThrown) -> 
      cb?("AJAX error: #{errorThrown}")
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
        save_file f.name, e.target.result
        controller.message "File '#{f.name}' saved.", 'success'
        editor.getSession().setValue(e.target.result)
      reader.readAsText(f)
    else if ext == 'class'
      reader.onload = (e) ->
        save_file f.name, e.target.result
        controller.message "File '#{f.name}' saved.", 'success'
        editor.getSession().setValue("/*\n * Binary file: #{f.name}\n */")
        process_bytecode e.target.result
      reader.readAsBinaryString(f)
    else
      alert 'Unrecognized file type!'

  jqconsole = $('#console')
  controller = jqconsole.console
    promptLabel: 'doppio > '
    commandHandle: (line, report) ->
      [cmd,args...] = line.split ' '
      handler = commands[cmd]
      if handler? then handler(args, report)
      else "Unknown command #{cmd}. Enter 'help' for a list of commands."
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
    controller.commandHandle = (line, report) ->
      controller.commandHandle = oldHandle
      resume (line.charCodeAt(i) for i in [0...Math.min(n_bytes,line.length)])
      controller.promptLabel = oldPrompt
      true

  close_editor = ->
    $('#ide').fadeOut 'fast', ->
      $('#console').fadeIn('fast').click() # click to restore focus

  $('#save_btn').click ->
    fname = $('#filename').val()
    save_file fname, editor.getSession().getValue()
    controller.message("File saved as '#{fname}'.", 'success')
    close_editor()

  $('#save_btn').click -> close_editor()

commands =
  javac: (args, report) ->
    return "Usage: javac <source file>" unless args[0]?
    compile_source args[0], report
  java: (args, report) ->
    return "Usage: java class [args...]" unless args[0]?
    class_data = process_bytecode load_file "#{args[0]}.class"
    return "Could not find class '#{args[0]}'" unless class_data?
    stdout = (str) -> report str, true # no reprompting
    rs ?= new runtime.RuntimeState(stdout, user_input, read_classfile)
    jvm.run_class(rs, class_data, args, ->
      $('#heap_size').text rs.heap.length-1
      controller.reprompt()
    )
  javap: (args) ->
    return "Usage: javap class" unless args[0]?
    class_data = process_bytecode load_file "#{args[0]}.class"
    return "Could not find class '#{args[0]}'" unless class_data?
    disassembler.disassemble class_data
  clear_heap: (args) ->
    rs = null
    $('#heap_size').text 0
    "Heap cleared."
  ls: (args) ->
    (name[6..] for name, contents of localStorage when name[..5] == 'file::').join '\n'
  edit: (args) ->
    data = load_file args[0]
    $('#console').fadeOut 'fast', ->
      $('#filename').val args[0]
      $('#ide').fadeIn('fast')
      # initialize the editor. technically we only need to do this once, but more
      # than once is fine too
      editor = ace.edit('source')
      JavaMode = require("ace/mode/java").Mode
      editor.getSession().setMode new JavaMode
      editor.getSession().setValue(data) if data?
    true
  rm: (args) ->
    return "Usage: rm <file>" unless args[0]?
    # technically we should look only for keys starting with 'file::', but at the
    # moment they are the only kinds of keys we use
    if args[0] == '*' then localStorage.clear()
    else delete_file args[0]
    true
  emacs: -> "Try 'vim'."
  vim: -> "Try 'emacs'."
  help: (args) ->
    """
    javac <source file>    -- Compile Java source.
    java <class> [args...] -- Run with command-line arguments.
    javap <class>          -- Display disassembly.
    edit <file>            -- Edit a file.
    ls                     -- List all files.
    rm <file>              -- Delete a file.
    clear_heap             -- Clear the heap.
    """

tabComplete = ->
  promptText = controller.promptText()
  args = promptText.split ' '
  prefix = longestCommmonPrefix(
    if args.length is 1 then commandCompletions args[0]
    else fileNameCompletions args[0], args
  )
  additionalText = prefix.substr(_.last(args).length)
  controller.promptText(promptText + additionalText)

commandCompletions = (cmd) ->
  (name for name, handler of commands when name.substr(0, cmd.length) is cmd)

fileNameCompletions = (cmd, args) ->
  validExtension = (fname) ->
    ext = fname.split('.')[1]
    if cmd is 'javac' then ext is 'java'
    else if cmd is 'javap' or cmd is 'java' then ext is 'class'
    else true
  keepExt = -> return cmd isnt 'javap' and cmd isnt 'java'
  lastArg = _.last(args)
  potentialCompletions = []
  for i in [0...localStorage.length] by 1
    key = localStorage.key(i)
    continue unless key.substr(0, 6) is 'file::'
    fname = key.substr(6)
    continue unless validExtension(fname)
    if (fname.substr(0, lastArg.length) is lastArg)
      potentialCompletions.push(
        if not keepExt() then fname.split('.')[0]
        else fname
      )
  potentialCompletions

longestCommmonPrefix = (lst) ->
  return "" if lst.length is 0
  prefix = lst[0]
  # slow, but should be fine with our small number of completions
  for word in lst
    for c, idx in prefix
      if (c isnt word[idx])
        prefix = prefix.substr(0, idx)
        break
  prefix
