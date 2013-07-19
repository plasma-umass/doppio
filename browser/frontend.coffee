"use strict"

root = this

# To be initialized on document load
stdout = null
user_input = null
controller = null
editor = null
progress = null
bs_cl = null

sys_path = '/sys'

preload = ->
  node.fs.readFile "#{sys_path}/browser/mini-rt.tar", (err, data) ->
    if err
      console.error "Error downloading mini-rt.tar: #{err}"
      return
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
      bar.width "#{display_perc}%"
      preloading_file.text(
        if display_perc < 100 then "Loading #{path}"  else "Done!"))

    # Grab the XmlHttpRequest file system.
    xhrfs = node.fs.getRootFS().mntMap[sys_path]

    # Note: Path is relative to XHR mount point (e.g. /vendor/classes rather than
    # /sys/vendor/classes). They must also be absolute paths.
    untar new util.BytesArray(data), ((percent, path, file) ->
      if path[0] != '/' then path = "/#{path}"
      update_bar(percent, path)
      ext = path.split('.')[1]
      unless ext is 'class'
        on_complete() if percent == 100
        return
      file_count++
      asyncExecute (->
        try
          xhrfs.preloadFile path, file
        catch e
          console.error "Error writing #{path}: #{e}"
        on_complete() if --file_count == 0 and done
      ), 0),
      ->
        done = true
        on_complete() if file_count == 0
    return

process_bytecode = (buffer) -> new ClassData.ReferenceClassData(buffer)

onResize = ->
  h = $(window).height() * 0.7
  $('#console').height(h)
  $('#source').height(h)

ps1 = -> node.process.cwd() + '$ '

$(window).resize(onResize)

$(document).ready ->
  onResize()
  editor = $('#editor')
  # set up the local file loaders
  $('#file').change (ev) ->
    unless FileReader?
      controller.message """
        Your browser doesn't support file loading.
        Try using the editor to create files instead.
        """, "error"
      return $('#console').click() # click to restore focus
    num_files = ev.target.files.length
    files_uploaded = 0
    controller.message "Uploading #{num_files} files...\n", 'success', true
    # Need to make a function instead of making this the body of a loop so we
    # don't overwrite "f" before the onload handler calls.
    file_fcn = ((f) ->
      reader = new FileReader
      reader.onerror = (e) ->
        switch e.target.error.code
          when e.target.error.NOT_FOUND_ERR then alert "404'd"
          when e.target.error.NOT_READABLE_ERR then alert "unreadable"
          when e.target.error.SECURITY_ERR then alert "only works with --allow-file-access-from-files"
      ext = f.name.split('.')[1]
      isClass = ext == 'class'
      reader.onload = (e) ->
        files_uploaded++
        node.fs.writeFile node.process.cwd() + '/' + f.name, e.target.result, (err) ->
          if err
            controller.message "[#{files_uploaded}/#{num_files}] File '#{f.name}' could not be saved: #{err}\n", 'error', files_uploaded != num_files
          else
            controller.message "[#{files_uploaded}/#{num_files}] File '#{f.name}' saved.\n",
              'success', files_uploaded != num_files
            if isClass
              editor.getSession?().setValue("/*\n * Binary file: #{f.name}\n */")
            else
              editor.getSession?().setValue(e.target.result)
          $('#console').click() # click to restore focus
      if isClass then reader.readAsBinaryString(f) else reader.readAsText(f)
    )
    for f in ev.target.files
      file_fcn(f)
    return

  jqconsole = $('#console')
  controller = jqconsole.console
    promptLabel: ps1()
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
        java classes/demo/GzipDemo c Hello.txt hello.gz (compress)
        java classes/demo/GzipDemo d hello.gz hello.tmp (decompress)
        java classes/demo/DiffPrint Hello.txt hello.tmp

      We support the stock Sun Java Compiler:
        javac classes/test/FileRead.java
        javac classes/demo/Fib.java

      (Note: if you edit a program and recompile with javac, you'll need
        to run 'clear_cache' to see your changes when you run the program.)

      We can run Rhino, the Java-based JS engine:
        rhino

      Text files can be edited by typing `edit [filename]`.

      You can also upload your own files using the uploader above the top-right
      corner of the console.

      Enter 'help' for full a list of commands. Ctrl-D is EOF.

      Doppio has been tested with the latest versions of the following desktop browsers:
        Chrome, Safari, Firefox, Opera, Internet Explorer 10, and Internet Explorer 9.
      """

  stdout = (str) -> controller.message str, '', true # noreprompt

  user_input = (resume) ->
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
        resume (line.charCodeAt(i) for __,i in line)

  close_editor = ->
    $('#ide').fadeOut 'fast', ->
      $('#console').fadeIn('fast').click() # click to restore focus

  $('#save_btn').click (e) ->
    fname = $('#filename').val()
    contents = editor.getSession().getValue()
    contents += '\n' unless contents[contents.length-1] == '\n'
    node.fs.writeFile fname, contents, (err) ->
      if err
        controller.message "File could not be saved: #{err}", 'error'
      else
        controller.message("File saved as '#{fname}'.", 'success')
    close_editor()
    e.preventDefault()

  $('#close_btn').click (e) -> close_editor(); e.preventDefault()
  bs_cl = new ClassLoader.BootstrapClassLoader(jvm.read_classfile)
  preload()

# helper function for 'ls'
read_dir = (dir, pretty=true, columns=true, cb) ->
  node.fs.readdir node.path.resolve(dir), (err, contents) ->
    if err or contents.length is 0 then return cb('')
    contents = contents.sort()
    return cb(contents.join('\n')) unless pretty
    pretty_list = []
    i = 0
    next_content = ->
      c = contents[i++]
      node.fs.stat (dir+'/'+c), (err, stat) ->
        if stat.isDirectory()
          c += '/'
        pretty_list.push c
        unless i is contents.length
          next_content()
          return
        cb(if columns then columnize(pretty_list) else pretty_list.join('\n'))
    next_content()

pad_right = (str,len) ->
  str + Array(len - str.length + 1).join(' ')

columnize = (str_list, line_length=100) ->
  max_len = 0
  for s in str_list
    max_len = s.length if s.length > max_len
  num_cols = (line_length/(max_len+1))|0
  col_size = Math.ceil(str_list.length/num_cols)
  column_list = []
  for [1..num_cols]
    column_list.push str_list.splice(0, col_size)
  row_list = []
  for i in [0...col_size] by 1
    row = (pad_right(col[i],max_len+1) for col in column_list when col[i]?)
    row_list.push row.join('')
  return row_list.join('\n')

commands =
  ecj: (args, cb) ->
    jvm.set_classpath "#{sys_path}/vendor/classes/", './'
    rs = new runtime.RuntimeState(stdout, user_input, bs_cl)
    # HACK: -D args unsupported by the console.
    jvm.system_properties['jdt.compiler.useSingleThread'] = true
    jvm.run_class rs, 'org/eclipse/jdt/internal/compiler/batch/Main', args, ->
        # HACK: remove any classes that just got compiled from the class cache
        for c in args when c.match /\.java$/
          bs_cl.remove_class(util.int_classname(c.slice(0,-5)))
        jvm.reset_system_properties()
        controller.reprompt()
    return null  # no reprompt, because we handle it ourselves
  javac: (args, cb) ->
    jvm.set_classpath "#{sys_path}/vendor/classes/", "./:#{sys_path}/"
    rs = new runtime.RuntimeState(stdout, user_input, bs_cl)
    jvm.run_class rs, 'classes/util/Javac', args, ->
        # HACK: remove any classes that just got compiled from the class cache
        for c in args when c.match /\.java$/
          bs_cl.remove_class(util.int_classname(c.slice(0,-5)))
        controller.reprompt()
    return null  # no reprompt, because we handle it ourselves
  java: (args, cb) ->
    jvm.dump_state = false
    # XXX: dump-state support
    for i in [0...args.length]
      if args[i] is '-Xdump-state'
        jvm.dump_state = true
        args.splice i, 1
        break

    if !args[0]? or (args[0] in ['-classpath', '-cp'] and args.length < 3)
      return "Usage: java [-classpath path1:path2...] class [args...]"
    if args[0] in ['-classpath', '-cp']
      jvm.set_classpath "#{sys_path}/vendor/classes/", args[1]
      class_name = args[2]
      class_args = args[3..]
    else
      jvm.set_classpath "#{sys_path}/vendor/classes/", './'
      class_name = args[0]
      class_args = args[1..]
    rs = new runtime.RuntimeState(stdout, user_input, bs_cl)
    jvm.run_class(rs, class_name, class_args, -> controller.reprompt())
    return null  # no reprompt, because we handle it ourselves
  test: (args) ->
    return "Usage: test all|[class(es) to test]" unless args[0]?
    # Change dir to $sys_path, because that's where tests expect to be run from.
    curr_dir = node.process.cwd()
    done_cb = ->
      node.process.chdir curr_dir
      controller.reprompt()
    node.process.chdir sys_path
    # method signature is:
    # run_tests(args,stdout,hide_diffs,quiet,keep_going,done_callback)
    if args[0] == 'all'
      testing.run_tests [], stdout, true, false, true, done_cb
    else
      testing.run_tests args, stdout, false, false, true, done_cb
    return null
  javap: (args) ->
    return "Usage: javap class" unless args[0]?
    node.fs.readFile "#{args[0]}.class", (err, buf) ->
      if err
        controller.message "Could not find class '#{args[0]}'.",'error'
      else
        controller.message(disassembler.disassemble(process_bytecode(buf)), 'success')
    return null
  rhino: (args, cb) ->
    jvm.set_classpath "#{sys_path}/vendor/classes/", './'
    rs = new runtime.RuntimeState(stdout, user_input, bs_cl)
    jvm.run_class(rs, 'com/sun/tools/script/shell/Main', args, -> controller.reprompt())
    return null  # no reprompt, because we handle it ourselves
  list_cache: ->
    cached_classes = bs_cl.get_loaded_class_list(true)
    '  ' + cached_classes.sort().join('\n  ')
  # Reset the bootstrap classloader
  clear_cache: ->
    bs_cl = new ClassLoader.BootstrapClassLoader(jvm.read_classfile)
    return true
  ls: (args) ->
    if args.length == 0
      read_dir '.', null, null, (list) ->
        controller.message list, 'success'
    else if args.length == 1
      read_dir args[0], null, null, (list) ->
        controller.message list, 'success'
    else
      i = 0
      read_next_dir = ->
        read_dir args[i++], null, null, (list) ->
          controller.message "#{d}:\n#{list}\n\n", 'success', true
          if i is args.length then return controller.reprompt()
          read_next_dir()
      read_next_dir()
    return null
  edit: (args) ->
    startEditor = (data) ->
      $('#console').fadeOut 'fast', ->
        $('#filename').val args[0]
        $('#ide').fadeIn('fast')
        # initialize the editor. technically we only need to do this once, but more
        # than once is fine too
        editor = ace.edit('source')
        editor.setTheme 'ace/theme/twilight'
        if not args[0]? or args[0].split('.')[1] is 'java'
          JavaMode = require("ace/mode/java").Mode
          editor.getSession().setMode(new JavaMode)
        else
          TextMode = require("ace/mode/text").Mode
          editor.getSession().setMode(new TextMode)
        editor.getSession().setValue(data)
    if args[0]?
      node.fs.readFile args[0], 'utf8', (err, data) ->
        if err then data = defaultFile
        startEditor data
        controller.reprompt()
      return null
    else
      startEditor defaultFile
      return true
  cat: (args) ->
    fname = args[0]
    return "Usage: cat <file>" unless fname?
    node.fs.readFile fname, 'utf8', (err, data) ->
      if err
        controller.message "Could not open file #{fname}: #{err}", 'error'
      else
        controller.message data
    return null
  mv: (args) ->
    if args.length < 2 then return "Usage: mv <from-file> <to-file>"
    node.fs.rename args[0], args[1], (err) ->
      if err then controller.message "Could not rename #{args[0]} to #{args[1]}: #{err}", 'error', true
      controller.reprompt()
    return null
  cd: (args) ->
    if args.length > 1 then return "Usage: cd <directory>"
    dir = if args.length == 0 or args[0] is '~'
      # Change to the default (starting) directory.
      '/demo'
    else node.path.resolve(args[0])
    # Verify path exits before going there. chdir does not verify that the
    # directory exists.
    node.fs.exists dir, (doesExist) ->
      if doesExist
        node.process.chdir(dir)
        controller.promptLabel = ps1()
      else
        controller.message "Directory #{dir} does not exist.\n", 'error', true
      controller.reprompt()
    return null
  rm: (args) ->
    return "Usage: rm <file>" unless args[0]?
    if args[0] == '*'
      node.fs.readdir '.', (err, fnames) ->
        if err
          controller.message "Could not remove '.': #{err}\n", 'error'
        else
          for fname in fnames
            completed = 0
            node.fs.stat fname, (err, fstat) ->
              if err
                controller.message "Could not remove '.': #{err}\n", 'error'
              else if fstat.is_directory
                controller.message "ERROR: '#{fname}' is a directory.\n", 'error'
              else
                node.fs.unlink fname, (err) ->
                  if err then controller.message "Could not remove file: #{err}\n", 'error', true
                  if ++completed is fname.length then controller.reprompt()
    else node.fs.unlink args[0], (err) ->
      if err then controller.message "Could not remove file: #{err}\n", 'error', true
      controller.reprompt()
    return null
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
      rhino                  -- Run Rhino, the Java-based JavaScript engine.

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
  last_arg = util.last(args)
  getCompletions args, (completions) ->
    prefix = longestCommmonPrefix(completions)
    if prefix == '' or prefix == last_arg
      # We've no more sure completions to give, so show all options.
      common_len = last_arg.lastIndexOf('/') + 1
      options = columnize(c.slice(common_len) for c in completions)
      controller.message options, 'success'
      controller.promptText(promptText)
      return
    # delete existing text so we can do case correction
    promptText = promptText.substr(0, promptText.length - last_arg.length)
    controller.promptText(promptText + prefix)

getCompletions = (args, cb) ->
  if args.length is 1
    cb filterSubstring(args[0], Object.keys(commands))
  else if args[0] is 'time'
    getCompletions(args[1..], cb)
  else
    fileNameCompletions args[0], args, cb
  return

filterSubstring = (prefix, lst) ->
  (x for x in lst when x.substr(0, prefix.length) is prefix)

validExtension = (cmd, fname) ->
  dot = fname.lastIndexOf('.')
  ext = if dot is -1 then '' else fname.slice(dot+1)
  if cmd is 'javac' then ext is 'java'
  else if cmd is 'javap' or cmd is 'java' then ext is 'class'
  else if cmd is 'cd' then false
  else true

fileNameCompletions = (cmd, args, cb) ->
  chopExt = args.length == 2 and (cmd is 'javap' or cmd is 'java')
  toComplete = util.last(args)
  lastSlash = toComplete.lastIndexOf('/')
  if lastSlash >= 0
    dirPfx = toComplete.slice(0, lastSlash+1)
    searchPfx = toComplete.slice(lastSlash+1)
  else
    dirPfx = ''
    searchPfx = toComplete
  dirPath = if dirPfx == '' then '.' else node.path.resolve(dirPfx)
  node.fs.readdir dirPath, (err, dirList) ->
    return cb([]) if err?
    dirList = filterSubstring searchPfx, dirList
    completions = []
    num_back = 0
    for item in dirList
      do (item) ->
        node.fs.stat node.path.resolve(dirPfx+item), (err, stats) ->
          if err?
          else if stats.isDirectory()
            completions.push(dirPfx + item + '/')
          else if validExtension(cmd, item)
            completions.push(dirPfx + (if chopExt then item.split('.',1)[0] else item))
          if ++num_back == dirList.length
            cb(completions)
    return  # void function
  return  # void function

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
