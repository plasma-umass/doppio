"use strict"

root = exports ? this

# modern browsers slow the event loop when tab is not in focus,
# so don't give up control! but guard against stack overflows, too.
nonAsyncCount = 0
root.asyncExecute = (fn) ->
  if (document? and (document.hidden or document.mozHidden or
      document.webkitHidden or document.msHidden) and
      nonAsyncCount++ < 10000)
    fn()
  else
    nonAsyncCount = 0
    setImmediate fn
