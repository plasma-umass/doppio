# what the go_button should say when we're not doing anything
button_idle_text = 'Compile and Parse'
# stores the parsed ClassFile object
class_data = undefined

html_escape = (str) ->
  str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
     .replace(/</g, '&lt;').replace(/>/g, '&gt;')

# Read in a binary classfile synchronously. Return an array of bytes.
read_classfile = (cls) ->
 rv = []
 $.ajax "http://localhost:8000/third_party/classes/#{cls}.class", {
   type: 'GET'
   dataType: 'text'
   async: false
   beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
   success: (data) -> rv = util.bytestr_to_array data
   error: (jqXHR, textStatus, errorThrown) ->
     throw "AJAX error when loading class #{cls}: #{errorThrown}"
 }
 rv

process_bytecode = (bytecode_string) ->
  $('#go_button').text('Parsing...')
  bytes_array = util.bytestr_to_array bytecode_string
  class_data = new ClassFile(bytes_array)
  $('#disassembly').html html_escape(disassembler.disassemble(class_data))
  $('#run_button').removeAttr('disabled')
  $('#go_button').text(button_idle_text)

run_jvm = () ->
  # this is a silly hack to pass a "print"-like function to our JVM
  output = $('#output')[0]
  output.innerText = ''
  print = (msg) -> output.innerText += msg
  $('#run_button').text('Running...')
  jvm.run class_data, print, read_classfile, $('#cmdline').val().split(' ')
  $('#run_button').text('Run with args:')

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
  editor = ace.edit('source')
  JavaMode = require("ace/mode/java").Mode
  editor.getSession().setMode new JavaMode
  $('#go_button').text(button_idle_text)
  $('#go_button').click (ev) -> compile_source editor.getSession().getValue()
  $('#run_button').click (ev) -> run_jvm()
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
