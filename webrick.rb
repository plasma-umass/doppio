require 'webrick'

include WEBrick

def start_webrick(config = {})
  server = HTTPServer.new(config)
  ['INT', 'TERM'].each {|signal|
    trap(signal) {server.shutdown}
  }
  server.start
end
  
if ARGV[0] == '--dev'
  puts "Starting WEBrick in dev mode"
  start_webrick(:DocumentRoot => '.',
                :Port         => 8000)
else
  start_webrick(:DocumentRoot => './build',
                :Port         => 8000)
end
