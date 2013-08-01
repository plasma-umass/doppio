#! /usr/bin/env coffee

express  = require 'express'
optimist = require 'optimist'
path     = require 'path'

{argv} = optimist
  .boolean(['dev', 'release'])
  .default('v', 1)
  .alias('v', 'verbosity')

{exit} = process

fatal = (s) ->
  console.error s
  exit 1

unless 0 <= argv.v <= 3
  fatal "Invalid verbosity: #{argv.v} (should be between 0 and 3)"

class DoppioServer
  constructor: ->
    @port = argv.port or 8000

    @Mode =
      DEV: 0
      REL: 2

    @set_options()

  set_options: (args) ->
    @options =
      verbosity: argv.verbosity
      mode: @Mode.REL
      logdir: './logs'

    if argv.dev then @options.mode = @Mode.DEV
    if argv.release then @options.mode = @Mode.REL

    @p3 "Input options: \n#{(key + ': ' + val for key, val of @options).join '\n'}"

  modestring: (mode) ->
    switch mode
      when @Mode.DEV then 'development'
      when @Mode.REL then 'release'
      else 'Invalid mode'

  p1: (m) -> @pn 1, m
  p2: (m) -> @pn 2, m
  p3: (m) -> @pn 3, m
  pn: (n, m) -> console.log m if n <= @options.verbosity

  start: ->
    dir =
      switch @options.mode
        when @Mode.REL then 'release'
        when @Mode.DEV then 'dev'
        else console.error 'Invalid mode'

    root = path.resolve __dirname, '../build', dir

    @p1 "Creating server in #{@modestring(@options.mode)} mode."

    app = express()

    @p1 "Starting server"

    app.use(express.static(root))
    app.listen(@port)

    @p1 "Serving #{root} at http://localhost:#{@port}"



doppio = new DoppioServer()
doppio.start()
