Coffee-JVM: A JVM in Coffeescript
=================================
[Mid-term project](http://plasma.cs.umass.edu/emery/grad-systems-project-1) 
for [CS 691ST, Spring 2012](http://plasma.cs.umass.edu/emery/grad-systems).

Use the [wiki](https://github.com/int3/coffee-jvm/wiki) for TODOs, links to resources, etc.

Getting & Building the Code
---------------------------

After `git clone`, do

    git submodule update --init --recursive

Most programs need the Java Class Library. On OS X Lion it can be found at

    /System/Library/Frameworks/JavaVM.framework/Classes/classes.jar

Unzip it into `third_party/classes`.

Use [Coffeescript v1.2.0](http://coffeescript.org/) (which is the default version you get from npm).
Run `coffee -wc */*.coffee &` to auto-gen scripts as you go.

Usage
-----

Run `python -m SimpleHTTPServer 8000` in the project root, 
then access the browser frontend at [localhost:8000](http://localhost:8000/).

The code can also be run from the console. E.g.

    coffee console/disassembler.coffee <test/Println.class
    coffee console/runner.coffee <test/Println.class

It requires the `optimist` node module.

Testing
-------

Run the automated test-runner to check disassembly output:

    ./tools/run_tests.rb

To run the VM itself on all test files, do `make run`. No automatic
checks are done on the correctness of the output.
