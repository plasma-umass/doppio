#(function($){
#    $.fn.console = function(config){
#        if (config === undefined) config = {};
# var extern = {};
# extern.reset = function(){
# extern.notice = function(msg,style){
# extern.message = function (msg, type, noreprompt) {
# extern.reprompt = function() { commandResult(); }
# extern.promptText = function(text)
# extern.promptLabel = "> ";
# extern.continuedPromptLabel = "> ";
# extern.commandHandle = config.commandHandle;
# extern.inner = inner;
# extern.typer = typer;
# extern.scrollToBottom = scrollToBottom;

# jQuery module for a mock console that can be controlled through automated
# tests.
#
# FEATURES:
# * Can be used with a 'shell script' that executes each console command one
#   by one.
# * Buffers output and asynchronously sends it to a server running locally.

$ = jQuery

$.fn.console = () ->

  outBuffer = ""
  bufferSize = 1024

  nopCommandHandle = (line) ->
    return

  sendBufferToServer = ->
    if outBuffer.length != 0
      # Send to server.
      # Empty buffer.
      outBuffer = ""

    return

  sendErrorToServer = (text) ->
    return


  runNextCommand = ->

  extern.reset = () ->
    # NOP
    return

  extern.notice = (msg, style) ->
    # NOP
    return

  extern.message = (msg, type, noreprompt) ->
    # Emulates behavior of jQuery console.
    if typeof msg == 'string'
      outBuffer += msg
    else if $.isArray msg
      outBuffer += msg[0]
    # jQuery console assumes input is a DOM node or something.
    else
      outBuffer += msg

    if outBuffer.length >= bufferSize
      sendBufferToServer outBuffer

    if !noreprompt
      extern.reprompt

    return

  extern.reprompt = () ->
    # Clear buffer.
    sendBufferToServer

    # Yield JS thread for at least 100ms. On resume, call 'runNextCommand'.
    setTimeout runNextCommand, 100

  extern.promptText = (text) ->
    sendErrorToServer "PromptText called during a test."

  extern.commandHandle = nopCommandHandle

  return extern