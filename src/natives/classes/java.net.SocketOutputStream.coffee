
  

native_methods.java.net.SocketOutputStream = [
  o 'init()V', (rs) ->
    
  o 'socketWrite0(Ljava/io/FileDescriptor;[BII)V', (rs, _this, fd, b, offset, len) ->
    impl = _this.get_field rs, 'Ljava/net/SocketOutputStream;impl'
    if impl.$is_shutdown is true
      rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'Socket is shutdown.'
    if impl.$ws.get_raw_state() != WebSocket.OPEN
      rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'Connection isn\'t open'
    # TODO: This can be optimized by accessing the 'Q' directly
    impl.$ws.send b.array.splice(offset, offset + len)
    # Let the browser write it out
    rs.async_op (resume_cb) -> setImmediate(-> resume_cb())
]
