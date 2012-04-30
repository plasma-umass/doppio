DoppioVM: A JVM in Coffeescript
=================================

_Doppio_ is a double shot of espresso.
In this case it's also a JVM written in [Coffeescript](http://coffeescript.org/).

It began life as a [Mid-term project](http://plasma.cs.umass.edu/emery/grad-systems-project-1) 
for [CS 691ST, Spring 2012](http://plasma.cs.umass.edu/emery/grad-systems)
at [UMass Amherst](http://www.cs.umass.edu/).

To try Doppio now, head to the [live demo page](http://int3.github.com/doppio/).


Getting & Building the Code
---------------------------

After `git clone`, do

    git submodule update --init --recursive

Most programs need the Java Class Library. On OS X Lion:

    cd third_party/classes
    unzip /System/Library/Frameworks/JavaVM.framework/Classes/classes.jar

Use [Coffeescript v1.2.0](http://coffeescript.org/):

    npm install -g coffee-script@1.2.0

Run `coffee -wc */*.coffee &` to auto-generate javascript sources if you make any changes to the code.

If you want to run the console-based frontend, you'll need the `optimist` node.js library:

    npm install optimist
    
To build the release copy of the code, you'll need [rdiscount][rdisc] as well.

[rdisc]: https://github.com/rtomayko/rdiscount

Usage
-----

To run Doppio on localhost, run `. startup.sh`, or start the browser frontend manually:

    cpp -P -traditional-cpp browser/index.html index.html
    python -m SimpleHTTPServer 8000 &

To get the optimized release version:

    make release
    cd build
    python -m SimpleHTTPServer 8000 &

Then point your browser to http://localhost:8000/.

The code can also be run from the console. For example:

    ./console/disassembler.coffee test/Println.class
    ./console/runner.coffee test/Println

Testing
-------

Run the automated test-runner to check runtime and disassembler output:

    make test

The tests can take a while to complete, so consider running them in parallel (`make -j4`).
