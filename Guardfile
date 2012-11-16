# run using `bundle exec guard -i`

guard :shell do
  watch(%r{((src|console)/.*)\.coffee$}) { |m|
    `
    echo "Compiling #{m[0]} to #{m[1]}.js"
    COFFEEC=node_modules/coffee-script/bin/coffee
    UGLIFYJS=node_modules/uglify-js/bin/uglifyjs
    SED=gsed
    $SED -r "s/^( *)(debug|v?trace).*$$/\1\\\`\\\`/" #{m[0]} | $COFFEEC --stdio --print > #{m[1]}.js
    $UGLIFYJS --define RELEASE --define UNSAFE --no-mangle --unsafe --beautify --overwrite #{m[1]}.js
    `
  }
end
