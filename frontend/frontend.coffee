# what the go_button should say when we're not doing anything
button_idle_text = 'Compile and Run'

run_bytecode = (bytecode) ->
	$('#go_button').text('Running...')
	$('#output').text(bytecode.toString())
	alert "TODO: actually implement the JVM"
	$('#go_button').text(button_idle_text)

compile_source = (java_source) ->
	$('#go_button').text('Compiling...')
	$.ajax 'http://www.cs.umass.edu/~ccarey/javac/', {
		type: 'POST'
		data: { pw: 'coffee', source: java_source }
		dataType: 'text'
		beforeSend: (jqXHR) -> jqXHR.overrideMimeType('text/plain; charset=x-user-defined')
		dataFilter: (data,type) -> parse_bytecode(data)
		success: run_bytecode
		error: (jqXHR, textStatus, errorThrown) -> 
			$('#output').text("AJAX error: #{errorThrown}")
			$('#go_button').text(button_idle_text)
	}

$(document).ready ->
	$('#go_button').text(button_idle_text)
	$('#go_button').click (event) ->
		compile_source $('#source').val()
