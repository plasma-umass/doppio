host_lookup = {}
host_reverse_lookup = {}

# 240.0.0.0 .. 250.0.0.0 is currently unused address space
next_host_address = 0xF0000000

next_address = ->
  next_host_address++
  if next_host_address > 0xFA000000
    error 'Out of addresses'
    next_host_address = 0xF0000000
  next_host_address

pack_address = (address) ->
  ret = 0
  for i in [3 .. 0] by -1
    ret |= (address[i] & 0xFF)
    ret <<= 8
  ret

host_allocate_address = (address) ->
  ret = next_address()
  host_lookup[ret] = address
  host_reverse_lookup[address] = ret
  ret

native_methods.java.net.Inet4AddressImpl = [
  o 'lookupAllHostAddr(Ljava/lang/String;)[Ljava/net/InetAddress;', (rs, _this, hostname) ->
    cdata = rs.get_class('Ljava/net/Inet4Address;')
    
    success = (rv, success_cb, except_cb) ->
      success_cb(new JavaArray(rs, rs.get_bs_class('[Ljava/net/InetAddress;'), [ rv ]))
    
    failure = (e_cb, success_cb, except_cb) -> except_cb(e_cb)
    
    cons = cdata.method_lookup(rs, '<init>(Ljava/lang/String;I)V')
    rs.call_bytecode cdata, cons, [ hostname, host_allocate_address(hostname.jvm2js_str()) ], success, failure
  
  o 'getLocalHostName()Ljava/lang/String;', (rs, _this) ->
    rs.init_string 'localhost'
  
  o 'getHostByAddr([B)Ljava/lang/String;', (rs, _this, addr) ->
    ret = host_reverse_lookup[pack_address(addr.array)]
    if ret is undefined
      return null
    rs.init_string ret
  
  o 'isReachable0([BII[BII)Z', (rs, _this, addr, scope, timeout, inf, ttl, if_scope) ->
    false
]
