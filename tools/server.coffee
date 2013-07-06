#! /usr/bin/env coffee

express = require 'express'
{argv}  = require 'optimist'
path    = require 'path'

class DoppioServer
  constructor: ->
    @port = 8000

    @Mode =
      DEV: 0
      REL: 2

    @Browser =
      CHROME:  'chrome'
      FIREFOX: 'firefox'
      SAFARI:  'safari'
      OPERA:   'opera'

    @set_options()

  set_options: (args) ->
    @options =
      verbosity: 1
      mode: @Mode.REL
      logdir: './logs'

    if argv.release then @options.mode = @Mode.REL
    if argv.dev then @options.mode = @Mode.DEV

  modestring: (mode) ->
    switch mode
      when @Mode.DEV then 'development'
      when @Mode.REL then 'release'
      else 'invalid mode'

  p1: (m) -> @pn 1, m
  p2: (m) -> @pn 2, m
  p3: (m) -> @pn 3, m
  pn: (n, m) -> console.log m if n <= @options.verbosity

  start: ->
    dir =
      switch @options.mode
        when @Mode.REL then 'release'
        when @Mode.DEV then 'dev'
        else

    root = path.resolve __dirname, '../build', dir

    @p1 "Creating server in #{@modestring(@options.mode)} mode."

    app = express()

    @p1 "Starting server"

    app.use(express.static(root))
    app.listen(@port)

    @p1 "Serving #{root} at http://localhost:#{@port}"



doppio = new DoppioServer()
doppio.start()
