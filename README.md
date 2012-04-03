DoppioVM: A JVM in Coffeescript
=================================

_Doppio_ is a double shot of espresso. In this case it's also a JVM written in
Coffeescript.

[Mid-term project](http://plasma.cs.umass.edu/emery/grad-systems-project-1) 
for [CS 691ST, Spring 2012](http://plasma.cs.umass.edu/emery/grad-systems).

Use the [wiki](https://github.com/int3/coffee-jvm/wiki) for TODOs, links to resources, etc.

Getting & Building the Code
---------------------------

After `git clone`, do

    git submodule update --init --recursive

Most programs need the Java Class Library. On OS X Lion:

    cd third_party/classes
    unzip /System/Library/Frameworks/JavaVM.framework/Classes/classes.jar

Use [Coffeescript v1.2.0](http://coffeescript.org/) (which is the default version you get from npm).
Run `coffee -wc */*.coffee &` to auto-generate javascript sources if you make any changes to the code.

If you want to run the console-based frontend, you'll need the `optimist` node.js library:

    npm install optimist
    
Usage
-----

Run `python -m SimpleHTTPServer 8000` in the project root, 
then access the browser frontend at [localhost:8000](http://localhost:8000/).

The code can also be run from the console. For example:

    ./console/disassembler.coffee test/Println.class
    ./console/runner.coffee test/Println

Testing
-------

Run the automated test-runner to check runtime and disassembler output:

    make test

