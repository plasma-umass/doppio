native_methods.java.net.Inet6AddressImpl = [
  o 'lookupAllHostAddr(Ljava/lang/String;)[Ljava/net/InetAddress;', (rs, _this, hostname) ->
    debug 'DNS lookup??? wtf!'
    new JavaArray rs, rs.get_bs_class('[Ljava/net/InetAddress;'), []
  o 'getLocalHostName()Ljava/lang/String;', (rs, _this) ->
    
  
  o 'getHostByAddr([B)Ljava/lang/String;', (rs, _this, addr) ->
    debug 'getHostByAddr'
    new JavaString 'blah'
  
  o 'isReachable0([BII[BII)Z', (rs, _this, addr, scope, timeout, inf, ttl, if_scope) ->
    debug 'isReachable0'
    false
]
