Coffee-JVM: A JVM in Coffeescript
=================================
[Mid-term project](http://plasma.cs.umass.edu/emery/grad-systems-project-1) 
for [CS 691ST, Spring 2012](http://plasma.cs.umass.edu/emery/grad-systems).

Use the [wiki](https://github.com/int3/coffee-jvm/wiki) for TODOs, links to resources, etc.

Getting & Building the Code
---------------------------

After `git clone`, do

    git submodule init
    git submodule update --recursive

Use [Coffeescript v1.2.0](http://coffeescript.org/) (which is the default version you get from npm).
Run `coffee -wc */*.coffee &` to auto-gen scripts as you go.

Usage
-----

A browser frontend is available at `browser/coffee-jvm.html`.

The disassembler can also be used from the console. E.g.

    coffee console/disassembler.coffee <test/Println.class

Testing
-------

Run the automated test-runner:

    ./tools/run_tests.rb
