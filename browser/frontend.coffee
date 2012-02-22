# what the go_button should say when we're not doing anything
button_idle_text = 'Compile and Run'

process_bytecode = (bytecode_string) ->
  $('#go_button').text('Running...')
  bytes_array = (bytecode_string.charCodeAt(i) for i in [0...bytecode_string.length])
  class_data = new ClassFile(bytes_array)
  # this is a silly hack to pass a "print"-like function to our JVM
  disassembly = $('#disassembly')[0]
  disassembly.value = disassemble(class_data)
  output = $('#output')[0]
  output.value = ''
  jvm.run class_data, (msg) -> output.value += msg
  $('#go_button').text(button_idle_text)

compile_source = (java_source) ->
  $('#go_button').text('Compiling...')
  $.ajax 'http://www.cs.umass.edu/~ccarey/javac/', {
    type: 'POST'
    data: { pw: 'coffee', source: java_source }
    dataType: 'text'
    beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
    success: process_bytecode
    error: (jqXHR, textStatus, errorThrown) -> 
      $('#output').text("AJAX error: #{errorThrown}")
      $('#go_button').text(button_idle_text)
  }

$(document).ready ->
  editor = ace.edit('source')
  JavaMode = require("ace/mode/java").Mode
  editor.getSession().setMode new JavaMode
  $('#go_button').text(button_idle_text)
  $('#go_button').click (event) ->
    compile_source editor.getSession().getValue()
