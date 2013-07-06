Doppio: A JVM in Coffeescript
=============================

_Doppio_ is a double shot of espresso.
In this case it's also a JVM written in [Coffeescript](http://coffeescript.org/).

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

If you have Homebrew, `setup.sh` will try to install a bunch of dependencies
automatically. Users of other package managers should check that they have:

* `node >= 0.10`
* `wget`
* `gnu-sed` (i.e. must support the `-r` flag; BSD `sed` doesn't)

Usage
-----

To run Doppio on localhost:

    make dev
    ./tools/server.coffee --dev

To get the optimized release version:

    make release
    ./tools/server.coffee --release

Then point your browser to [http://localhost:8000/](http://localhost:8000/).

The code can also be run from the console. For example:

    make dev-cli
    node build/dev/console/disassembler.js classes/demo/Fib
    # doppio-dev -> node build/dev/console/runner.js
    ./doppio-dev classes/demo/Fib
    ./doppio-dev classes/demo/Fib 7        # pass an argument to the JVM
    ./doppio-dev -jar my_application.jar   # extract and run a JAR
    
To get the optimized version, use `make release-cli`. The build products can be
found in `build/release`, and the runtime can be invoked via `./doppio`.

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

    console/test_runner.coffee -h
    console/test_runner.coffee classes/test/Strings

