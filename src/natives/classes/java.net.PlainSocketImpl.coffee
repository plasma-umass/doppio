# See RFC 6455 section 7.4
websocket_status_to_message = (status) ->
  switch status
    when 1000 then return 'Normal closure'
    when 1001 then return 'Endpoint is going away'
    when 1002 then return 'WebSocket protocol error'
    when 1003 then return 'Server received invalid data'
  'Unknown status code or error'

native_methods.java.net.PlainSocketImpl = [
  o 'socketCreate(Z)V', (rs, _this, isServer) ->
    # Check to make sure we're in a browser and the websocket libraries are present
    rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets are disabled' unless node?
    
    fd = _this.get_field rs, 'Ljava/net/SocketImpl;fd'
    
    # Make the FileDescriptor valid with a dummy fd
    fd.set_field rs, 'Ljava/io/FileDescriptor;fd', 8374
    
    # Finally, create our websocket instance
    _this.$ws = new Websock()
    _this.$is_shutdown = false

  o 'socketConnect(Ljava/net/InetAddress;II)V', (rs, _this, address, port, timeout) ->
    # The IPv4 case
    holder = address.get_field rs, 'Ljava/net/InetAddress;holder'
    addy = holder.get_field rs, 'Ljava/net/InetAddress$InetAddressHolder;address'

    # Assume scheme is ws for now
    host = 'ws://'
    if host_lookup[addy] is undefined
      # Populate host string based off of IP address
      for i in [3 .. 0] by -1
        shift = i * 8
        host += "#{(addy & (0xFF << shift)) >>> shift}."
      # trim last '.'
      host = host.substring 0, host.length - 1
    else
      host += host_lookup[addy]
    # Add port
    host += ":#{port}"
    
    debug "Connecting to #{host} with timeout = #{timeout} ms"
    
    rs.async_op (resume_cb, except_cb) ->
      id = 0
      
      clear_state = ->
        window.clearTimeout id
        _this.$ws.on('open', ->)
        _this.$ws.on('close', ->)
        _this.$ws.on('error', ->)
      
      error_cb = (msg) -> (e) ->
        clear_state()
        except_cb -> rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), msg + ": " + e
          
      close_cb = (msg) -> (e) ->
        clear_state()
        except_cb -> rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), msg + ": " + websocket_status_to_message(e.status)
      
      # Success case
      _this.$ws.on('open', ->
        debug 'Open!'
        clear_state()
        resume_cb())
      
      # Error cases
      _this.$ws.on('close', close_cb('Connection failed! (Closed)'))
      
      # Timeout case. In the case of no timeout, we set a default one of 10s.
      timeout = 10000 if timeout == 0
      id = setTimeout(error_cb('Connection timeout!'), timeout)
      
      debug "Host: #{host}"
      
      # Launch!
      try
        _this.$ws.open host
      catch err
        error_cb('Connection failed! (exception)')(err.message)
      
      
  o 'socketBind(Ljava/net/InetAddress;I)V', (rs, _this, address, port) ->
    rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to bind'

  o 'socketListen(I)V', (rs, _this, port) ->
    rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to listen'

  o 'socketAccept(Ljava/net/SocketImpl;)V', (rs, _this, s) ->
    rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'WebSockets doesn\'t know how to accept'
  
  o 'socketAvailable()I', (rs, _this) ->
    rs.async_op (resume_cb) ->
      setImmediate(-> resume_cb(_this.$ws.rQlen()))
  
  # TODO: Something isn't working here
  o 'socketClose0(Z)V', (rs, _this, useDeferredClose) ->
    _this.$ws.close()
  
  o 'socketShutdown(I)V', (rs, _this, type) -> _this.$is_shutdown = true
  o 'initProto()V', (rs) ->
  o 'socketSetOption(IZLjava/lang/Object;)V', (rs, _this, cmd, _on, value) ->
  o 'socketGetOption(ILjava/lang/Object;)I', (rs, _this, opt, iaContainerObj) ->
  o 'socketGetOption1(ILjava/lang/Object;Ljava/io/FileDescriptor;)I', (rs, _this, opt, iaContainerObj, fd) ->
    
  o 'socketSendUrgentData(I)V', (rs, _this, data) ->
    # Urgent data is meant to jump ahead of the
    # outbound stream. We keep no notion of this,
    # so queue up the byte like normal
    impl.$ws.send data
]
