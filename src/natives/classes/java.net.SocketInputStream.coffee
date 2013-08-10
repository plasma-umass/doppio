native_methods.java.net.SocketInputStream = [
  o 'init()V', (rs) ->
    debug 'Init socket input stream'
    
  o 'socketRead0(Ljava/io/FileDescriptor;[BIII)I', (rs, _this, fd, b, offset, len, timeout) ->
    error 'Socket read'
    0
]
