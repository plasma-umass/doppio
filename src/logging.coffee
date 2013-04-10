"use strict"

gLong = require '../vendor/gLong.js'

# things assigned to root will be available outside this module
root = exports ? window.logging ?= {}

# used for debugging the stack and local variables
root.debug_vars = (arr) -> arr.map (e)->
  return '!' if e is null
  return 'undef' if e is undefined
  return "*#{e.ref}" if e.ref?
  return "#{e}L" if e instanceof gLong
  e

# log levels
root.VTRACE = 10
root.TRACE = 9
root.DEBUG = 5
root.ERROR = 1
root.log_level ?= root.ERROR

# IE Compatibility
unless console? or window?.console
  window.console = {
    log: -> # Stub
    error: (msgs...) ->
      throw msgs.join(' ') + '\n' # Better than silently failing.
    profile: -> # Stub
    profileEnd: -> # Stub
  }

root.log = (level, msgs...) ->
  if level <= root.log_level
    # This used to be a CoffeeScript '...' invocation, which translated into
    # console.apply(console, msgs).
    # This does not work in IE, as some functions defined off of windows
    # do not support .apply. Thus, we work around this by using join to
    # construct a giant string, which works fine.
    # http://stackoverflow.com/questions/6873896/javascript-call-and-apply-in-internet-explorer-8-and-7-for-window-print/6875494#6875494
    console[if level == 1 then 'error' else 'log'](msgs.join(' '))

root.vtrace = (msgs...) -> root.log root.VTRACE, msgs...
root.trace = (msgs...) -> root.log root.TRACE, msgs...
root.debug = (msgs...) -> root.log root.DEBUG, msgs...
root.error = (msgs...) -> root.log root.ERROR, msgs...
