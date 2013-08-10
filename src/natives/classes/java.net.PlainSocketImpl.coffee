# Currying ftw!
async_connect_check = (rs, ws, stop_at) -> (resume_cb, except_cb) ->
  # Took too long to connect. Close and throw exception.
  if stop_at >= (new Date).getTime()
    debug 'Ran out of time'
    ws.close()
    except_cb -> rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'Connection timed out.'
  
  switch ws.websocket.readyState
    # Still waiting...
    when ws.CONNECTING
      debug 'Still connecting...'
      rs.async_op (async_connect_check rs, ws, stop_at)
    # Woo hoo! Done
    when ws.OPEN
      debug 'Opened!'
      resume_cb()
    # Failure :(
    when ws.CLOSING, ws.CLOSED
      debug 'Connection failed :('
      except_cb -> rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'Connection failed.'
    # This shouldn't ever happen (hopefully)
    else
      debug 'wtf'
      except_cb -> rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'WebSocket in unknown state.'
  
  return # Never gets here

native_methods.java.net.PlainSocketImpl = [
  o 'socketCreate(Z)V', (rs, _this, isServer) ->
    # Check to make sure we're in a browser and the websocket libraries are present
    rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets are disabled' unless node?
    
    # The JDK allocated this object for us. It's opaque,
    # so we can do whatever we want with it.
    fd = _this.get_field rs, 'Ljava/net/SocketImpl;fd'
    
    # Make the FileDescriptor valid with a dummy fd
    fd.set_field rs, 'Ljava/io/FileDescriptor;fd', 8374

  o 'socketConnect(Ljava/net/InetAddress;II)V', (rs, _this, address, port, timeout) ->
    array = address.getAddress
    # Assume scheme is ws for now
    host = 'ws://'
    # Populate host string based off of IP address
    for i in [0 .. array.length]
      host += "#{array.get_field_from_offset i}."
    # trim last '.'
    host = host.substring 0, host.length() - 1
    # Add port
    host += ":#{port}"
    
    _this.$ws = new WebSocket(host, 'base64')
    
    # WebSocket logic is done in the browser's event loop, so we
    # have to give control back as often as possible during connection.
    rs.async_op (async_connect_check rs,  _this.$ws, (new Date).getTime() + timeout)

  o 'socketBind(Ljava/net/InetAddress;I)V', (rs, _this, address, port) ->
    rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to bind'

  o 'socketListen(I)V', (rs, _this, port) ->
    rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to listen'

  o 'socketAccept(Ljava/net/SocketImpl;)V', (rs, _this, s) ->
    debug 'socketAccept'
    
  o 'socketAvailable()I', (rs, _this) ->
    debug 'socketAvailable'

  o 'socketClose0(Z)V', (rs, _this, useDeferredClose) ->
    debug 'socketClose0'

  o 'socketShutdown(I)V', (rs, _this) ->
    debug 'socketShutdown'

  o 'initProto()V', (rs) ->
    debug 'initProto'

  o 'socketSetOption(IZLjava/lang/Object;)V', (rs, _this, cmd, _on, value) ->
    debug 'socketSetOption'
    
  o 'socketGetOption(ILjava/lang/Object;)I', (rs, _this, opt, iaContainerObj) ->
    debug 'socketGetOption'
    
  o 'socketGetOption1(ILjava/lang/Object;Ljava/io/FileDescriptor;)I', (rs, _this, opt, iaContainerObj, fd) ->
    debug 'socketGetOption1'
    
  o 'socketSendUrgentData(I)V', (rs, _this, data) ->
    # Urgent data is meant to jump ahead of the
    # outbound stream. We keep no notion of this,
    # so queue up the byte like normal
    debug 'socketSendUrgentData'
]
