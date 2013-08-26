socket_read_async = (impl, b, offset, len, resume_cb) ->
  available = impl.$ws.rQlen()
  trimmed_len = if available < len then available else len
  read = impl.$ws.rQshiftBytes trimmed_len
  for i in [0...trimmed_len] by 1
    b.array[offset++] = read[i]
  resume_cb trimmed_len
  
native_methods.java.net.SocketInputStream = [
  o 'init()V', (rs) ->
  o 'socketRead0(Ljava/io/FileDescriptor;[BIII)I', (rs, _this, fd, b, offset, len, timeout) ->
    impl = _this.get_field rs, 'Ljava/net/SocketInputStream;impl'
    if impl.$is_shutdown is true
      rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'Socket is shutdown.'
    rs.async_op (resume_cb) ->
      window.setTimeout (socket_read_async impl, b, offset, len, resume_cb), timeout
]
