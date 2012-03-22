# what the go_button should say when we're not doing anything
button_idle_text = 'Compile and Parse'
# stores the parsed ClassFile object
class_data = undefined
controller = null

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
  class_data = new ClassFile(bytes_array)

compile_source = (java_source, cb) ->
  $('#go_button').text('Compiling...')
  $.ajax 'http://people.cs.umass.edu/~ccarey/javac/', {
    type: 'POST'
    data: { pw: 'coffee', source: java_source }
    dataType: 'text'
    beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
    success:  (data) -> process_bytecode(data); cb?(disassembler.disassemble class_data)
    error: (jqXHR, textStatus, errorThrown) -> 
      cb?("AJAX error: #{errorThrown}")
  }

$(document).ready ->
  util.log_level = 0
  # initialize the editor
  editor = ace.edit('source')
  JavaMode = require("ace/mode/java").Mode
  editor.getSession().setMode new JavaMode
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
      reader.onload = (e) -> editor.getSession().setValue(e.target.result)
      reader.readAsText(f)
    else if ext == 'class'
      reader.onload = (e) ->
        editor.getSession().setValue("/*\n * Binary file: #{f.name}\n */")
        process_bytecode e.target.result
      reader.readAsBinaryString(f)
    else
      alert 'Unrecognized file type!'

  controller = null
  java_handler = null
  showPrompt = null
  user_input = (n_bytes, resume) ->
    oldPrompt = controller.promptLabel
    controller.promptLabel = '> '
    controller.reprompt()
    java_handler = (line, report) ->
      java_handler = null
      resume (line.charCodeAt(i) for i in [0...Math.min(n_bytes,line.length)])
      controller.promptLabel = oldPrompt
      true

  jqconsole = $('#console')
  rs = null
  controller = jqconsole.console
    promptLabel: 'coffee-jvm > '
    commandHandle: (line, report) ->
      return java_handler(line, report) if java_handler?
      [cmd,args...] = line.split ' '
      switch cmd
        when 'javac'
          compile_source editor.getSession().getValue(), report
        when 'java'
          return false unless class_data?
          stdout = (str) -> report str, true # no reprompting
          rs ?= new runtime.RuntimeState(stdout, user_input, read_classfile)
          jvm.run_class(rs, class_data, args, ->
            $('#heap_size').text rs.heap.length-1
            controller.reprompt()
          )
        when 'clear_heap'
          rs = null
          $('#heap_size').text 0
          "Heap cleared."
        when 'help'
          """
javac -- Compile and display disassembly.
java [args...] -- Run with command-line arguments.
clear_heap -- Clear the heap.
          """
        else
          "Unknown command #{cmd}. Enter 'help' for a list of commands."
    autofocus: true
    animateScroll: true
    promptHistory: true
    welcomeMessage: "Enter 'help' for a list of commands."
