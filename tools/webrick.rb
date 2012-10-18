#! /usr/bin/env ruby

require 'webrick'

include WEBrick

class CommandsHandler < HTTPServlet::AbstractServlet

  def do_GET(request, response)
    response.status = 200
    response['Content-Type'] = "text/html"
    response.body = "[\"ls\"]"
  end

end

class MessageHandler < HTTPServlet::AbstractServlet

  def do_POST(request, response)
    puts "Message:"
    puts request
    response.status = 200
    response['Content-Type'] = "text/html"
    response.body = "Success."
  end

end

class CompleteHandler < HTTPServlet::AbstractServlet

  def do_POST(request, response)
    puts "Complete:"
    puts request
    response.status = 200
    response['Content-Type'] = "text/html"
    response.body = "Success."
  end

end

class ErrorHandler < HTTPServlet::AbstractServlet

  def do_POST(request, response)
    puts "Error:"
    puts request
    response.status = 200
    response['Content-Type'] = "text/html"
    response.body = "Success."
  end

end

def start_webrick(config = {}, mountHandlers = false)
  server = HTTPServer.new(config)
  ['INT', 'TERM'].each {|signal|
    trap(signal) {server.shutdown}
  }

  if mountHandlers
    server.mount "/message", MessageHandler
    server.mount "/error", ErrorHandler
    server.mount "/complete", CompleteHandler
    server.mount "/commands", CommandsHandler
  end

  server.start
end

mountHandlers = false
documentRoot = "#{File.dirname __FILE__}/.."
if ARGV[0] == '--dev'
  puts "Starting WEBrick in dev mode"
elsif ARGV[0] == '--benchmark'
  puts "Starting WEBrick in benchmark mode"
  if not File.readable?(ARGV[1])
    puts "ERROR: Cannot read benchmark file " + ARGV[1]
    exit
  else
    file = File.new(ARGV[1], "r")
    contents = file.read()
    mountHandlers = true
    documentRoot += "/build"
  end
else
  documentRoot += "/build"
end
start_webrick({:DocumentRoot => documentRoot,
               :Port         => 8000}, mountHandlers)
