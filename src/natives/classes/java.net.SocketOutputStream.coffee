native_methods.java.net.SocketOutputStream = [
  o 'init()V', (rs) ->
    debug 'Init socket input stream'
    
  o 'socketWrite0(Ljava/io/FileDescriptor;[BII)V', (rs, _this, fd, b, offset, len) ->
    debug 'Socket write'
]
