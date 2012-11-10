
gLong = require '../third_party/gLong.js'

"use strict"

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

root.log = (level, msgs...) ->
  if level <= root.log_level
    console[if level == 1 then 'error' else 'log'] msgs...

root.vtrace = (msgs...) -> root.log root.VTRACE, msgs...
root.trace = (msgs...) -> root.log root.TRACE, msgs...
root.debug = (msgs...) -> root.log root.DEBUG, msgs...
root.error = (msgs...) -> root.log root.ERROR, msgs...