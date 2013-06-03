native_methods.java.lang.Runtime = [
  o 'availableProcessors()I', () -> 1

  o 'gc()V', (rs) ->
    # No universal way of forcing browser to GC, so we yield in hopes
    # that the browser will use it as an opportunity to GC.
    rs.async_op (cb) -> cb()

  # Returns the maximum amount of memory that the Java virtual machine will
  # attempt to use, in bytes, as a Long. If there is no inherent limit then the
  # value Long.MAX_VALUE will be returned.
  #
  # Currently returns Long.MAX_VALUE because unlike other JVMs Doppio has no
  # hard limit on the heap size.
  o 'maxMemory()J', (rs) ->
    debug "Warning: maxMemory has no meaningful value in Doppio -- there is no hard memory limit."
    gLong.MAX_VALUE
]
