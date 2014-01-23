doppio: A JVM in TypeScript
=================================

_doppio_ is a double shot of espresso.
In this case it's also a JVM written in [TypeScript](http://www.typescriptlang.org/).

To try doppio now, head to the [live demo page](http://int3.github.io/doppio/).

To learn more, head to the [doppio wiki](https://github.com/int3/doppio/wiki).

You can also get in touch via our [mailing list][mail] or via the IRC channel
\#plasma-umass on Freenode.

[mail]: https://groups.google.com/forum/?fromgroups#!forum/plasma-umass-gsoc

Getting & Building the Code
---------------------------

Before attempting to build doppio, you must have the following installed:
* Node v0.10 or higher
* NPM packages `grunt-cli` and `bower` installed globally
  * `npm install -g grunt-cli bower`
* Java 6 JDK

If you are on Windows, you will need the following installed:
* Git (must be on your PATH)
* Python (must be on your PATH)
* A version of Visual Studio

Run the following commands to build doppio. Note that your first time building may take some time, as the build script will download the entire Java Class Library.

    git clone https://github.com/int3/doppio.git
    cd doppio
    npm install
    bower install
    grunt release

Usage
-----

To run doppio on localhost:

    grunt dev
    tools/server.coffee --dev

To get the optimized release version:

    grunt release
    tools/server.coffee --release

Then point your browser to [http://localhost:8000/](http://localhost:8000/).

To include your own code in the browser without manually uploading each file,
place your `.class` files in a directory under `classes/`,
then re-run `grunt dev` or `grunt release` to re-generate
the `listings.json` file.

For example:

    #in shell
    cp -ivR /path/to/my/class/files/ classes/my-classes/
    
    #in browser
    java -cp /sys/classes/my-classes my/package/MyClass  # use slashes, not dots, as package separators

We currently don't support loading class files from JARs in the browser,
but we intend to in the future. For now, unzip the JAR file and use the
above method to access the class files directly.

doppio can also be run from the console. For example:

    grunt dev-cli
    node build/dev-cli/console/disassembler.js classes/demo/Fib
    # doppio-dev -> node build/dev/console/runner.js
    ./doppio-dev classes/demo/Fib
    ./doppio-dev classes/demo/Fib 7        # pass an argument to the JVM
    ./doppio-dev -jar my_application.jar   # extract and run a JAR

To get the optimized version, use `grunt release-cli`. The build products can be
found in `build/release-cli`, and the runtime can be invoked via `./doppio`.

Automated Rebuilding
--------------------

To automatically rebuild doppio while you modify files, run the following command:

    grunt watch

Running Tests
-------------

Run all tests:

    grunt test

Run a specific test, or test with different options:

    node build/dev-cli/console/test_runner.js -h
    node build/dev-cli/console/test_runner.js classes/test/Strings

