Doppio: A JVM in TypeScript
=================================

_Doppio_ is a double shot of espresso.
In this case it's also a JVM written in [TypeScript](http://www.typescriptlang.org/).

To try Doppio now, head to the [live demo page](http://int3.github.io/doppio/).

To learn more, head to the [Doppio wiki](https://github.com/int3/doppio/wiki).

You can also get in touch via our [mailing list][mail] or via the IRC channel
\#plasma-umass on Freenode.

[mail]: https://groups.google.com/forum/?fromgroups#!forum/plasma-umass-gsoc

Getting & Building the Code
---------------------------

    git clone https://github.com/int3/doppio.git
    cd doppio
    tools/setup.sh
    make

If you have Homebrew, `setup.sh` will try to install a bunch of dependencies
automatically. Users of other package managers should check that they have:

* `node >= 0.10`
* `wget`

Usage
-----

To run Doppio on localhost:

    make dev
    tools/server.coffee --dev

To get the optimized release version:

    make release
    tools/server.coffee --release

Then point your browser to [http://localhost:8000/](http://localhost:8000/).

To include your own code in the browser, place your `.class` files under `vendor/classes`, then re-run `make dev` or `make release`.  For example:

    #in shell
    cp -ivR /path/to/my/class/files/ vendor/classes/my-classes/
    
    #in browser
    java -cp /sys/vendor/classes/my-classes my/package/MyClass #use slashes, not dots, as package separators

The code can also be run from the console. For example:

    make dev-cli
    node build/dev-cli/console/disassembler.js classes/demo/Fib
    # doppio-dev -> node build/dev/console/runner.js
    ./doppio-dev classes/demo/Fib
    ./doppio-dev classes/demo/Fib 7        # pass an argument to the JVM
    ./doppio-dev -jar my_application.jar   # extract and run a JAR

To get the optimized version, use `make release-cli`. The build products can be
found in `build/release-cli`, and the runtime can be invoked via `./doppio`.

Automated Rebuilding
--------------------

    bundle exec guard -i -g release # automates `make release-cli`
    bundle exec guard -i -g dev # automates `make dev-cli`

The front-end currently lacks an auto-rebuild system.

Running Tests
-------------

Run all tests:

    make test -j4

Run a specific test, or test with different options:

    node build/dev-cli/console/test_runner.js -h
    node build/dev-cli/console/test_runner.js classes/test/Strings

