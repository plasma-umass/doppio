#! /usr/bin/env ruby
require 'webrick'
require 'optparse'
require 'ostruct'

include WEBrick

# We are a servlet for the WEBRick server that we are creating.
class DoppioServer
  attr_accessor :server, :serverpid, :expIndex, :experiments

  module Mode
    DEV = 0
    BMK = 1
    REL = 2
  end

  module Browser
    CHROME = "chrome"
    FIREFOX = "firefox"
    SAFARI = "safari"
    OPERA = "opera"
  end

  ##############################################################################
  # Attributes
  ##############################################################################

  # Contains all of the command line options.
  def options
    @options
  end
  # While long, this performs all of the needed sanity checks for command line
  # options.
  def options=(args)
    options = OpenStruct.new
    # Defaults.
    options.verbosity = 1
    options.mode = Mode::REL
    options.logdir = "./logs"

    opts = OptionParser.new do |opts|
      opts.banner = "Usage: webrick.rb -[r|d|b [scripts] -w [browsers] -e " +
                    "[experiment]] [options]"

      opts.on("-r", "--release", "Host Doppio in release mode") do |r|
        options.mode = Mode::REL
      end

      opts.on("-d", "--dev", "Host Doppio in development mode") do |d|
        options.mode = Mode::DEV
      end

      opts.on("-b", "--benchmark script1,script2,...", Array, "Host Doppio " +
        "in benchmark mode with the specified benchmark scripts") do |scripts|
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

      opts.on("-w", "--browser browsername:browser1,browsername:browser2,...",
        Array, "Run benchmarking scripts in the given browsers. Recognized " +
        "browsers are [firefox|chrome|opera|safari].") do |browsers|
        if browsers.empty?
          opts.abort "You must specify at least one browser."
        end
        # Map return value of loop back into browsers array.
        browsers.collect! do |browser|
          spBrowser = browser.split(':')
          browserName = spBrowser[0]
          # Gross
          case browserName
          when Browser::FIREFOX
          when Browser::OPERA
          when Browser::CHROME
          when Browser::SAFARI
          else
            opts.abort "ERROR: Invalid browser type: " + browserName
          end

          browserFilename = spBrowser[1]
          # See if we can find it on the path.
          errorMsg = ''
          error = false
          paths = ENV['PATH'].split(':')
          # For Mac users.
          paths.unshift('/Applications')
          # Current directory takes second priority.
          paths.unshift('.')
          # Absolute path takes first priority.
          paths.unshift('')
          browserPath = ""

          # Finds the true browserPath, or sets error to 'true' with an optional
          # error message.
          # Ugly, but it works! 8D
          paths.each do |path|
            if path != ''
              browserPath = path + "/" + browserFilename
            else
              browserPath = browserFilename
            end

            # Bad if File exists.
            if !File::exists? browserPath
              # NOP
            # Bad if not a file and not a directory that is a Mac application.
            elsif !File::file? browserPath and (!File::directory? browserPath or
              !browserPath.split('.').last == 'app')
              errorMsg = "Not a file or Mac application: " + browserPath
            # Bad if it's not executable, whether a file or a Mac app directory.
            elsif !File::executable? browserPath
              errorMsg = "The following browser is not executable: " +
                         browserPath
            else
              # It's either a Mac application or an executable file, which is
              # what we want.
              error = false
              break
            end

            # Last ditch effort: Is it a .app w/o the extension?
            newBp = browserPath + ".app"
            if File::directory? newBp and File::executable? newBp
              browserPath = newBp
              error = false
              break
            end

            # Loop didn't terminate yet. We encountered an error.
            error = true
          end

          if error
            if errorMsg != ""
              opts.abort errorMsg
            else
              opts.abort "Unable to find browser: " + browserFilename
            end
          end
          browserName + ":" + browserPath
        end
        options.browsers = browsers
      end

      opts.on("-e", "--experiment name", "Specifies the name of the " +
        "experiment. Used for log file naming.") do |e|
        options.exp = e
      end

      opts.separator ""
      opts.separator "Common options:"

      opts.on_tail("-h", "--help", "Show this message") do
        puts opts
        exit
      end

      opts.on_tail("-v", "--verbosity N", OptionParser::DecimalInteger,
        "Specify the level of verbosity [0-3]") do |v|
        if v > 3 || v < 0
          opts.abort "Invalid verbosity option (verbosity should be in the "+
                     "range [0-3])."
        end
        options.verbosity = v
      end
    end
    opts.parse!(ARGV)

    # Sanity checks. Need to specify *browsers* and *scripts* for benchmark
    # mode.
    if options.mode == Mode::BMK and (options.browsers == nil or
      options.scripts == nil or options.exp == nil)
      abort "In benchmark mode, you must specify at least one browser, at " +
            "least one script, and an experiment name."
    end

    # Create needed Experiment objects.
    if options.mode == Mode::BMK
      # Create log directory if needed.
      fullLogDir = options.logdir + "/" + options.exp
      Dir::mkdir(options.logdir) unless File::exists? options.logdir
      Dir::mkdir(fullLogDir) unless File::exists? fullLogDir

      logNum = 0

      options.browsers.each do |browser|
        options.scripts.each do |script|
          logFile = fullLogDir + "/log" + logNum.to_s +
            ".log"
          if File::exists? logFile
            puts "ERROR: Log file exists: " + logFile
            exit()
          end

          @experiments.push(Experiment.new(self, browser, script, logFile))
          logNum += 1
        end
      end
    end

    @options = options
    p3 "Input options: "
    p3 options
  end

  ##############################################################################
  # Experiment Class + Experiment Helper Methods
  ##############################################################################
  def addExperiment(exp)
    @experiments.push(exp)
  end

  def getCurrentExperiment()
    @experiments[@expIndex]
  end

  def nextExperiment()
    # Stop the current experiment.
    getCurrentExperiment().stop()
    # Advance to the next experiment.
    @expIndex += 1
    # Check if we are done experimenting.
    if @expIndex >= @experiments.length
      @server.stop()
      return
    end
    # Start the next experiment.
    getCurrentExperiment().start()
  end

  class Experiment
    attr_accessor :outer, :browserPath, :browserName, :browserPid, :script, :logfile

    def getMainExecutableName()
      case @browserName
      when Browser::FIREFOX then 'firefox'
      when Browser::CHROME then 'Google Chrome'
      when Browser::SAFARI then 'Safari'
      when Browser::OPERA then 'Opera'
      end
    end

    def initialize(outer, browser, script, logfile)
      @outer = outer
      spBrowser = browser.split(':')
      @browserName = spBrowser[0]
      @browserPath = spBrowser[1]
      @browserPid = nil
      @script = File.read(script)
      @logfile = File.new(logfile, "w")
    end

    def start()
      # Print starting line.
      writeMessage("EXPERIMENT BEGIN: " + Time.now.to_s + "\n")
      writeMessage("BROWSER: " + @browserName + ":" + @browserPath + "\n")
      writeMessage("SCRIPT: " + @script + "\n")
      # Launch the browser.
      @browserPid = spawn('open', '-a', @browserPath, 'http://localhost:8000/')
    end

    def stop()
      # Print ending line.
      writeMessage("\nEXPERIMENT END: " + Time.now.to_s + "\n")
      # Close the logfile.
      @logfile.close()
      # Kill the browser.
      system('killall', getMainExecutableName())
    end

    def writeMessage(txt)
      @outer.p3 "MESSAGE: " + txt
      @logfile.write(txt)
      @logfile.flush()
    end

    def writeError(error)
      @outer.p3 "ERROR: " + error
      @logfile.write("DOPPIO EXPERIMENT ERROR: " + error + "\n")
      @logfile.flush()
    end
  end

  ##############################################################################
  # WEBRick Request Handlers
  ##############################################################################
  class DoppioServlet < HTTPServlet::AbstractServlet
    attr_accessor :path, :outer

    # Initialize with reference to outer class.
    def initialize(server, path, outer)
      @path = path
      @outer = outer
    end

    def do_GET(request, response)
      response.status = 200
      response['Content-Type'] = 'text/html'
      response.body = @outer.getCurrentExperiment().script
    end

    def do_POST(request, response)
      body = request.body()
      response.status = 200
      response['Content-Type'] = "text/html"
      response.body = "Success."

      exp = @outer.getCurrentExperiment()

      case @path
      when "/complete"
        @outer.nextExperiment()
      when "/message"
        exp.writeMessage(body)
      when "/error"
        exp.writeError(body)
      end
    end

  end

  ##############################################################################
  # Other Methods
  ##############################################################################
  def initialize(args)
    @expIndex = 0
    @experiments = []
    self.options = args
  end

  def Mode2String(mode)
    case mode
    when Mode::DEV
      return 'development'
    when Mode::BMK
      return 'benchmark'
    else
      return 'release'
    end
  end

  # Handles printing at various verbosities.
  def p1(message)
    pn(1, message)
  end
  def p2(message)
    pn(2, message)
  end
  def p3(message)
    pn(3, message)
  end
  def pn(n, message)
    if n <= options.verbosity
      puts message
    end
  end

  def start()
    doppioRoot = "#{File.dirname __FILE__}/.."
    documentRoot = doppioRoot
    case @options.mode
    when Mode::REL
      documentRoot = doppioRoot + "/build/release"
    when Mode::BMK
      documentRoot = doppioRoot + "/build/benchmark"
    when Mode::DEV
      documentRoot = doppioRoot + "/build/dev"
    end

    p1 "Creating server in " + Mode2String(@options.mode) + " mode."

    mime_types = WEBrick::HTTPUtils::DefaultMimeTypes
    mime_types.store 'svg', 'image/svg+xml'

    @server = HTTPServer.new({:DocumentRoot => documentRoot,
                              :Port         => 8000,
                              :MimeTypes    => mime_types})
    ['INT', 'TERM'].each {|signal|
      trap(signal) {@server.shutdown}
    }

    # Benchmark mount points for communicating with the mock console.
    if @options.mode == Mode::BMK
      @server.mount "/message", DoppioServlet, "/message", self
      @server.mount "/error", DoppioServlet, "/error", self
      @server.mount "/complete", DoppioServlet, "/complete", self
      @server.mount "/commands", DoppioServlet, "/commands", self
    end

    p1 "Starting server."
    @serverpid = fork do
      @server.start
    end
    sleep 1
    if @options::mode == Mode::BMK
      getCurrentExperiment().start()
    end
    Process.wait(@serverpid)
  end
end

doppio = DoppioServer.new(ARGV)
doppio.start()
