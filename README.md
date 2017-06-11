doppio: A JVM in TypeScript v0.5.0
==================================

[![Join the chat at https://gitter.im/plasma-umass/doppio](https://badges.gitter.im/plasma-umass/doppio.svg)](https://gitter.im/plasma-umass/doppio?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![Build Status](https://travis-ci.org/plasma-umass/doppio.svg?branch=master)](https://travis-ci.org/plasma-umass/doppio)
[![Build status](https://ci.appveyor.com/api/projects/status/tcwicbagl9xi3m6v?svg=true)](https://ci.appveyor.com/project/jvilk/doppio)
[![npm version](https://badge.fury.io/js/doppiojvm.svg)](https://badge.fury.io/js/doppiojvm)
[![david-dm-status-badge](https://david-dm.org/plasma-umass/doppio/master.svg)](https://david-dm.org/plasma-umass/doppio/master#info=dependencies&view=table)
[![david-dm-status-badge](https://david-dm.org/plasma-umass/doppio/master/dev-status.svg)](https://david-dm.org/plasma-umass/doppio/master#info=devDependencies&view=table)

_doppio_ is a double shot of espresso.
In this case, it's also a POSIX-compatible runtime system plus a JVM written in [TypeScript](http://www.typescriptlang.org/) and an active research project of the [PLASMA group at the University of Massachusetts](http://plasma.cs.umass.edu/).

To try doppio now, head to the [live demo page](http://plasma-umass.github.io/doppio-demo/).

To learn more, read some [documentation](docs), or read our [academic paper](http://dl.acm.org/citation.cfm?id=2594293) [(alt. link w/ no paywall)](https://plasma-umass.github.io/doppio-demo/paper.pdf) published at [PLDI 2014](http://conferences.inf.ed.ac.uk/pldi2014/)!

You can also get in touch via our [mailing list][mail] or via the IRC channel
\#plasma-umass on Freenode.

[mail]: https://groups.google.com/forum/?fromgroups#!forum/plasma-umass-gsoc

Getting & Building the Code
---------------------------

Before attempting to build doppio, you must have the following installed:

* Node v6.0 or higher
  * There is a bug that prevents you from compiling DoppioJVM with Node v4 and below.
* NPM package `grunt-cli` installed globally
  * `npm install -g grunt-cli`
* Java 8 JDK
* (Recommended) Yarn

If you are on Windows, you will need the following installed:

* Git (must be on your PATH)
* Python (must be on your PATH)
* A version of Visual Studio

Run the following commands to build doppio. Note that your first time building may take some time, as the build script will download the entire Java Class Library.

    git clone https://github.com/plasma-umass/doppio.git
    cd doppio
    yarn install       # npm install should work if you do not have yarn
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

Integrating Into Your Site
--------------------------

Check out our [Developer Guide](docs) for information on how you can integrate doppio into your website!

You can also build and interact with a simple example application with:

    grunt examples

The code is in [`docs/examples`](docs/examples).
