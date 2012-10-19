#! /usr/bin/env ruby
require 'webrick'
require 'optparse'
require 'ostruct'

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

  # third_party's location is the same for all configurations, so manually
  # fix it in place.
  server.mount("/third_party", HTTPServlet::FileHandler, "#{File.dirname __FILE__}/../third_party", {:FancyIndexing=>true})

  if mountHandlers
    server.mount "/message", MessageHandler
    server.mount "/error", ErrorHandler
    server.mount "/complete", CompleteHandler
    server.mount "/commands", CommandsHandler
  end

  server.start
end

module Mode
  DEV = 0
  BMK = 1
  REL = 2
end

options = OpenStruct.new
options.verbosity = 1
options.mode = Mode::REL

opts = OptionParser.new do |opts|
  opts.banner = "Usage: webrick.rb -[r|d|b [scripts] -w [browsers]] [options]"

  opts.on("-r", "--release", "Host Doppio in release mode") do |r|
    options.mode = Mode::REL
  end

  opts.on("-d", "--dev", "Host Doppio in development mode") do |d|
    options.mode = Mode::DEV
  end

  opts.on("-b", "--benchmark script1,script2,...", Array, "Host Doppio in " +
    "benchmark mode with the specified benchmark scripts") do |scripts|
    if scripts.empty?
      opts.abort "You must specify at least one benchmark script."
    end
    scripts.each do |script|
      if !File::readable? script
        opts.abort "Unable to read benchmark script " + script + "."
      elsif !File::file? script
        opts.abort "Not a file: " + script
      end
    end

    options.mode = Mode::BMK
    options.scripts = scripts
  end

  opts.on("-w", "--browser browser1,browser2,...", Array, "Run benchmarking " +
    "scripts in the given browsers") do |browsers|
    if browsers.empty?
      opts.abort "You must specify at least one browser."
    end

    browsers.each do |browser|
      if !File::exists? browser
        opts.abort "File not found: " + browser
      elsif !File::file? browser
        # If it's a Mac application, it's a folder ending in .app.
        if !File::directory? browser or !browser.split('.').last == 'app'
          opts.abort "Not a file or Mac application: " + browser
        end
      elsif !File::executable? browser
        opts.abort "The following browser is not executable: " + browser
      end
    end
    options.browsers = browsers
  end

  opts.on("-m", "--mount path1,path2,...", Array, "Mounts the specified " +
    "paths to their directory's name (e.g. `/home/jvilk/Files' => /Files)") do |paths|
    paths.each do |path|
      if !File.directory? path
        opts.abort "The following is not a directory: " + path
      elsif !File.readable? path
        opts.abort "You do not have read access to directory " + path
      end
    end
    options.mounts = paths
  end

  opts.separator ""
  opts.separator "Common options:"

  opts.on_tail("-h", "--help", "Show this message") do
    puts opts
    exit
  end

  opts.on_tail("-v", "--verbosity N", OptionParser::DecimalInteger, "Specify " +
    "the level of verbosity [0-3]") do |v|
    if v > 3 || v < 0
      opts.abort "Invalid verbosity option " + v + "."
    end
    options.verbosity = v
  end
end

opts.parse!(ARGV)

mountHandlers = false
doppioRoot = "#{File.dirname __FILE__}/.."

if ARGV[0] == '--dev'
  puts "Starting WEBrick in dev mode"
  documentRoot = doppioRoot
elsif ARGV[0] == '--benchmark'
  puts "Starting WEBrick in benchmark mode"
  #if not File.readable?(ARGV[1])
  #  puts "ERROR: Cannot read benchmark file " + ARGV[1]
  #  exit
  #else
  #  file = File.new(ARGV[1], "r")
  #  contents = file.read()
  mountHandlers = true
  documentRoot = doppioRoot + "/build/benchmark"
  #end
else
  documentRoot = doppioRoot + "/build/release"
end

#start_webrick({:DocumentRoot => documentRoot,
#               :Port         => 8000}, mountHandlers)
