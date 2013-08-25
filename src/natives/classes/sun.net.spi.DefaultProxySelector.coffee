native_methods.sun.net.spi.DefaultProxySelector = [
  o 'init()Z', (rs) -> true
  o 'getSystemProxy(Ljava/lang/String;Ljava/lang/String;)Ljava/net/Proxy;', (rs) ->
    rs.java_throw rs.get_bs_class('Ljava/io/IOException;'), 'proxy'
]
