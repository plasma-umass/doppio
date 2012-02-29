Coffee-JVM: A JVM in Coffeescript
=================================
[Mid-term project](http://plasma.cs.umass.edu/emery/grad-systems-project-1) 
for [CS 691ST, Spring 2012](http://plasma.cs.umass.edu/emery/grad-systems).

Use the [wiki](https://github.com/int3/coffee-jvm/wiki) for TODOs, links to resources, etc.

Getting & Building the Code
---------------------------

After `git clone`, do

    git submodule update --init --recursive

Use [Coffeescript v1.2.0](http://coffeescript.org/) (which is the default version you get from npm).
Run `coffee -wc */*.coffee &` to auto-gen scripts as you go.

Usage
-----

Run `python -m SimpleHTTPServer 8000` in the project root, 
then access the browser frontend at [localhost:8000](http://localhost:8000/).

The code can also be run from the console. E.g.

    coffee console/disassembler.coffee <test/Println.class
    coffee console/runner.coffee <test/Println.class

Testing
-------

Run the automated test-runner:

    ./tools/run_tests.rb
