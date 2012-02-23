# what the go_button should say when we're not doing anything
button_idle_text = 'Compile and Parse'
# stores the parsed ClassFile object
class_data = undefined

process_bytecode = (bytecode_string) ->
  $('#go_button').text('Parsing...')
  bytes_array = (bytecode_string.charCodeAt(i) & 0xff for i in [0...bytecode_string.length])
  class_data = new ClassFile(bytes_array)
  $('#disassembly').val disassemble(class_data)
  $('#run_button').removeAttr('disabled')
  $('#go_button').text(button_idle_text)

run_jvm = () ->
  # this is a silly hack to pass a "print"-like function to our JVM
  output = $('#output')[0]
  output.value = ''
  $('#run_button').text('Running...')
  jvm.run class_data, ((msg) -> output.value += msg), $('#cmdline').val().split(' ')
  $('#run_button').text('Run with args:')

compile_source = (java_source) ->
  $('#go_button').text('Compiling...')
  $.ajax 'http://www.cs.umass.edu/~ccarey/javac/', {
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
