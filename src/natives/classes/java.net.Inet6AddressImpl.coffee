host_lookup = {}

# 240.0.0.0 .. 250.0.0.0 is currently unused address space
next_host_address = [240,0,0,0]

host_address_inc = ->
  next_host_address[3]++
  next_host_address[2]++ if next_host_address[3] > 255
  next_host_address[1]++ if next_host_address[2] > 255
  next_host_address[0]++ if next_host_address[1] > 255
  next_host_address[3] = 0 if next_host_address[3] > 255
  next_host_address[2] = 0 if next_host_address[2] > 255
  next_host_address[1] = 0 if next_host_address[1] > 255
  if next_host_address[1] > 250
    error 'Out of addresses'
    next_host_address[0] = 240

pack_address = (address) ->
  ret = 0
  for i in [3 .. 0] by -1
    ret |= (address[i] & 0xFF)
    ret <<= 8
  ret

host_allocate_address = (address) ->
  host_address_inc()
  host_lookup[pack_address(next_host_address)] = address

native_methods.java.net.Inet6AddressImpl = [
  o 'lookupAllHostAddr(Ljava/lang/String;)[Ljava/net/InetAddress;', (rs, _this, hostname) ->
    ret = new JavaObject rs, rs.get_bs_class('Ljava/net/Inet4Address;'), {
      'Ljava/net/Inet4Address;address': host_allocate_address()
    }
    new JavaArray rs, rs.get_bs_class('[Ljava/net/InetAddress;'), [ret]
  o 'getLocalHostName()Ljava/lang/String;', (rs, _this) ->
    new JavaString 'localhost'
  
  o 'getHostByAddr([B)Ljava/lang/String;', (rs, _this, addr) ->
    new JavaString 'blah'
  
  o 'isReachable0([BII[BII)Z', (rs, _this, addr, scope, timeout, inf, ttl, if_scope) ->
    false
]
