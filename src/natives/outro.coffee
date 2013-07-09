flatten_pkg = (pkg) ->
  result = {}
  pkg_name_arr = []
  rec_flatten = (pkg) ->
    for pkg_name, inner_pkg of pkg
      pkg_name_arr.push pkg_name
      if inner_pkg instanceof Array
        full_pkg_name = pkg_name_arr.join '/'
        for method in inner_pkg
          {fn_name, fn} = method
          # expand out the '!'s in the method names
          fn_name = fn_name.replace /!|;/g, do ->
            depth = 0
            (c) ->
              if c == '!' then pkg_name_arr[depth++]
              else if c == ';' then depth = 0; c
              else c
          full_name = "L#{full_pkg_name};::#{fn_name}"
          result[full_name] = fn
      else
        flattened_inner = rec_flatten inner_pkg
      pkg_name_arr.pop pkg_name
    return
  rec_flatten pkg
  result

root.trapped_methods = flatten_pkg trapped_methods
root.native_methods = flatten_pkg native_methods
