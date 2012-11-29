# run using `bundle exec guard -i`

guard :shell do
  watch(%r{((src|console)/.*)\.coffee$}) { |m|
    target = "build/opt/#{m[1]}.js"
    `
    echo "Compiling #{m[0]} to #{target}"
    COFFEEC=node_modules/coffee-script/bin/coffee
    UGLIFYJS=node_modules/uglify-js/bin/uglifyjs
    SED=gsed
    $SED -r "s/^( *)(debug|v?trace).*$/\\1\\\`\\\`/" #{m[0]} | $COFFEEC --stdio --print > #{target}
    $UGLIFYJS --define RELEASE --define UNSAFE --no-mangle --unsafe --beautify --overwrite #{target}
    `
  }
end
