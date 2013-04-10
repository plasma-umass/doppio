"use strict"

# jQuery module for a mock console that can be controlled through automated
# tests.
#
# FEATURES:
# * Can be used with a 'shell script' that executes each console command one
#   by one.
# * Buffers output and asynchronously sends it to a server running locally.

$ = jQuery

$.fn.console = (config) ->
  outBuffer = ""
  bufferSize = 1024
  commands = []
  uploading = false
  isComplete = false

  # Helper function for making errors purty.
  getErrorDetails = (url, type, data, textStatus, errorThrown) ->
    "Error during HTTP " + type + " to server.\n" +
    "---------------------------------\n" +
    "Details:\n" +
    "  URL: " + url + "\n" +
    "  Error Type: " + textStatus + "\n" +
    "  Additional Error Info: " + errorThrown + "\n" +
    "  Data: '" + data + "'\n"

  # All errors involving GET/PUT statements during benchmarks indicate failure.
  getFromServer = (url, doneFn) ->
    $.ajax({
      url: url
    }).done(doneFn).fail(
      (data, textStatus, errorThrown) ->
        printErrorInBrowser(
          getErrorDetails(url, "POST", data, textStatus, errorThrown))
    )

  postToServer = (url, data, doneFn) ->
    $.ajax({
      type: "POST"
      url: url
      data: outBuffer
    }).done(doneFn).fail(
      (data, textStatus, errorThrown) ->
        printErrorInBrowser(
          getErrorDetails(url, "POST", data, textStatus, errorThrown))
    )

  sendBufferToServer = ->
    if outBuffer.length != 0 and !uploading
      uploading = true
      # Send to server.
      postToServer("message", outBuffer,
        (->
          uploading = false
          # In case we prevented further uploads...
          if outBuffer.length > bufferSize
            sendBufferToServer()
        )
      )
      # Empty buffer.
      outBuffer = ""

  printInBrowser = (msg, className) ->
    mesg = $('<div class="jquery-console-message"></div>')
    if className
      mesg.addClass(className)
    mesg.text(msg)
    mesg.hide()
    inner.append(mesg)
    mesg.show()

  printErrorInBrowser = (msg) ->
    printInBrowser(msg, "jquery-console-message-error")

  error = (text) ->
    # We don't buffer errors.
    printErrorInBrowser text
    postToServer("error", text)
    # A single error invalidates benchmark results. Fail fast.
    complete()

  # Tells the server we are done benchmarking and halts all command processing.
  complete = ->
    if isComplete
      return
    if !uploading
      isComplete = true
      printInBrowser "\nTest complete. The browser will be killed now. Have " +
                     "a wonderful day! :)\n"
      postToServer "complete"
      commands = []
    else # Need to wait for buffer upload to complete.
      setTimeout complete, 10

  message = (text) ->
    outBuffer += text
    if outBuffer.length >= bufferSize
      sendBufferToServer()

  runNextCommand = ->
    # Clear the buffer before we run another command.
    sendBufferToServer()

    if commands.length > 0
      command = commands.shift()
      printInBrowser extern.promptLabel + command
      ret = extern.commandHandle command
      # Emulate jQuery console's behavior for different return types.
      if typeof ret == "boolean"
        if ret
          # Command succeeded without a result.
          extern.reprompt()
        else
          # Command failed.
          error "Command \"" + command + "\" failed."
          extern.reprompt()
      else if typeof ret == "string"
        extern.message(ret + "\n")
      else if typeof ret == "object" && ret.length
        extern.message(ret + "\n")
      else
        extern.reprompt()
    else
      # We're done. The browser can be killed now.
      complete()

  extern = {}

  extern.promptLabel = config.promptLabel ? "> "

  # The default command handler.
  errorCommandHandle = (line) ->
    error "Command handle called before it was set."

  extern.commandHandle = config.commandHandle ? errorCommandHandle
  extern.onreprompt = config.onreprompt ? null

  extern.reset = ->
    # NOP

  extern.notice = ->
    # NOP

  extern.message = (msg, type, noreprompt) ->
    if $.isArray msg
      message msg[0]
    else
      # TODO: jQuery console supports DOM nodes, so there could be a DOM node
      # here...
      message msg

    if !noreprompt
      extern.reprompt()

  extern.reprompt = () ->
    if typeof extern.onreprompt == "function"
      extern.onreprompt()
    setTimeout(runNextCommand, 10)

  extern.promptText = (text) ->
    error "PromptText called during a non-interactive test."


  # Set up the console for printing stuff.
  container = $(this)
  inner = $('<pre class="jquery-console-inner"></div>')
  container.append(inner)
  printInBrowser(
    "Doppio Automated Benchmark Mode\n" +
    "-------------------------------\n" +
    "Doppio will only print fatal errors and running commands to this " +
    "console. All other output is sent to the benchmark server.\n\n"
  )

  # Grab commands.
  getFromServer("commands",
    ((data) ->
      commands = $.parseJSON(data)
      if not $.isArray commands
        error("Retrieved commands are not in an array format.")
    )
  )

  # When the console is 'clicked', the test begins. Doppio automatically clicks
  # the console when loading completes.
  container.click(-> extern.reprompt())

  return extern
