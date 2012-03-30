root = this

# modern browsers slow the event loop when tab is not in focus,
# so don't give up control!
root.asyncExecute = (fn) ->
  if (document.hidden or document.mozHidden or
      document.webkitHidden or document.msHidden)
    fn()
  else
    setTimeout(fn, 0)
