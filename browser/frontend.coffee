# what the go_button should say when we're not doing anything
button_idle_text = 'Compile and Parse'
# stores the parsed ClassFile object
class_data = undefined

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
  $('#go_button').text('Parsing...')
  bytes_array = util.bytestr_to_array bytecode_string
  class_data = new ClassFile(bytes_array)
  $('#disassembly').text disassembler.disassemble class_data
  $('#run_button').removeAttr('disabled')
  $('#go_button').text(button_idle_text)

run_jvm = (rs) ->
  $('#run_button').text('Running...')
  $('#output')[0].innerText = ''
  args = $('#cmdline').val().split(' ')
  args = [] if args is ['']
  jvm.run_class(rs, class_data, args)
  $('#run_button').text('Run with args:')
  $('#clear_heap').text("Clear #{rs.heap.length-1} heap entries")

compile_source = (java_source) ->
  $('#go_button').text('Compiling...')
  $.ajax 'http://people.cs.umass.edu/~ccarey/javac/', {
    type: 'POST'
    data: { pw: 'coffee', source: java_source }
    dataType: 'text'
    beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
    success:  process_bytecode
    error: (jqXHR, textStatus, errorThrown) -> 
      $('#output').text("AJAX error: #{errorThrown}")
      $('#go_button').text('Compile')
  }

$(document).ready ->
  util.log_level = 0
  # initialize the editor
  editor = ace.edit('source')
  JavaMode = require("ace/mode/java").Mode
  editor.getSession().setMode new JavaMode
  # set up the compile/parse button
  $('#go_button').text(button_idle_text)
  $('#go_button').click (ev) -> compile_source editor.getSession().getValue()
  # convenience for making new runtime states
  output = $('#output')[0]
  make_rs = () -> new runtime.RuntimeState(((msg) -> output.innerText += msg), read_classfile)
  # set up heap clearance
  $('#clear_heap').click (ev) ->
    $('#run_button').off('click')
    rs = make_rs()  # blow the old state away
    $('#clear_heap').text("Clear #{rs.heap.length-1} heap entries")
    $('#run_button').on('click', (ev) -> run_jvm(rs))
  $('#clear_heap').click()  # creates a runtime state
  # set up the local file loader
  $('#srcfile').change (ev) ->
    f = ev.target.files[0]
    reader = new FileReader
    reader.onerror = (e) ->
      switch e.target.error.code
        when e.target.error.NOT_FOUND_ERR then alert "404'd"
        when e.target.error.NOT_READABLE_ERR then alert "unreadable"
        when e.target.error.SECURITY_ERR then alert "only works with --allow-file-access-from-files"
    reader.onload = (e) -> editor.getSession().setValue(e.target.result)
    reader.readAsText(f)
