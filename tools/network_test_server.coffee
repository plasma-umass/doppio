sys = require('sys')
spawn = require('child_process').spawn
net = require('net')

usage_and_exit = ->
  sys.puts "#{process.argv[0]} #{process.argv[1]} [--doppio|--native]"
  process.exit 1

if not process.argv[2]?
  usage_and_exit()

# Determine operating mode
if process.argv[2] is '--doppio'
  mode = 0
else if process.argv[2] is '--native'
  mode = 1
else
  sys.puts "Unrecognized option #{process.argv[2]}"
  usage_and_exit()

dest_port = 7070
src_port = if mode is 0 then 7000 else dest_port

sys.puts "Started on localhost:#{dest_port}"

connection = (socket) ->
  address = socket.remoteAddress
  sys.puts "#{address} connected"
  socket.addListener 'data', (data) ->
    sys.puts "#{address} says \"#{data}\""
    socket.write data
  socket.addListener 'close', -> sys.puts "#{address} disconnected"

# Setup a tcp server
server = net.createServer connection

server.listen src_port, "localhost"

websockify = spawn 'python', ['vendor/websockify-git/websockify.py', "#{dest_port}", "localhost:#{src_port}"] if mode is 0

cleanup = ->
  websockify.kill() if websockify?
  server.close()

if websockify?
  websockify.on 'close', (code) ->
    if code isnt 0
      console.log "Websockify exited with error code #{code}!"
    cleanup()
    process.exit code
