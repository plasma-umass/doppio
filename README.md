doppio: A JVM in TypeScript
=================================

[![Build Status](https://travis-ci.org/plasma-umass/doppio.svg?branch=new-objects)](https://travis-ci.org/plasma-umass/doppio)
[![david-dm-status-badge](https://david-dm.org/plasma-umass/doppio/new-objects.svg)](https://david-dm.org/plasma-umass/doppio/new-objects#info=dependencies&view=table)
[![david-dm-status-badge](https://david-dm.org/plasma-umass/doppio/new-objects/dev-status.svg)](https://david-dm.org/plasma-umass/doppio/new-objects#info=devDependencies&view=table)

_doppio_ is a double shot of espresso.
In this case it's also a JVM written in [TypeScript](http://www.typescriptlang.org/).

To try doppio now, head to the [live demo page](http://plasma-umass.github.io/doppio-demo/).

To learn more, head to the [doppio wiki](https://github.com/plasma-umass/doppio/wiki), or read our [academic paper](http://dl.acm.org/citation.cfm?id=2594293) [(alt. link w/ no paywall)](https://plasma-umass.github.io/doppio-demo/paper.pdf) published at [PLDI 2014](http://conferences.inf.ed.ac.uk/pldi2014/)!

You can also get in touch via our [mailing list][mail] or via the IRC channel
\#plasma-umass on Freenode.

[mail]: https://groups.google.com/forum/?fromgroups#!forum/plasma-umass-gsoc

Integrating Into Your Site
--------------------------

Check out our
[Developer Guide](https://github.com/plasma-umass/doppio/wiki/Doppio-Developer-Guide)
for information on how you can integrate doppio into your website!

Getting & Building the Code
---------------------------

Before attempting to build doppio, you must have the following installed:
* Node v0.10 or higher
* NPM packages `grunt-cli` and `bower` installed globally
  * `npm install -g grunt-cli bower`
* Java 8 JDK

If you are on Windows, you will need the following installed:
* Git (must be on your PATH)
* Python (must be on your PATH)
* A version of Visual Studio

Run the following commands to build doppio. Note that your first time building may take some time, as the build script will download the entire Java Class Library.

    git clone https://github.com/plasma-umass/doppio.git
    cd doppio
    npm install
    bower install
    grunt release      # For browser integration.
    grunt release-cli  # For command-line use.

Testing
-------

Run the full test suite using node.js:

    grunt test

Run the full test suite in a web browser:

    grunt test-browser

Run a specific test by invoking the test runner manually:

    node build/dev-cli/console/test_runner.js classes/test/Strings

Command-line Usage
------------------

Run doppio with node.js (after `grunt release-cli`):

    ./doppio classes.demo.Fib 7
    ./doppio -jar my_application.jar
    ./doppio -cp my/class/path SomeClass

Automated Rebuilding
--------------------

To automatically rebuild doppio while you modify files, run the following command:

    grunt release watch

This will perform a complete build of doppio, and then will watch files to trigger partial rebuilds.
