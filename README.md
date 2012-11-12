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

After `git clone`, it's easiest to simply run

    make development
    make test -j4
    ./tools/webrick.rb -d

which will take care of the setup steps, run the test suite, and
start a local instance of Doppio.
If you'd like to take care of the setup yourself, follow these steps:

    git submodule update --init --recursive

Java programs need the Java Class Library. This generally lives in
an archive named `rt.jar`, which comes with the JRE. Note that you
do not need a JDK to run Doppio, but our automated tests do require
a Java compiler and disassembler (`javac` and `javap`, respectively).
To provide the JCL for Doppio, simply unzip the class library in
`third_party/classes`.

On OS X Lion, `rt.jar` and others are bundled into `classes.jar`:

    cd third_party/classes
    unzip /System/Library/Frameworks/JavaVM.framework/Classes/classes.jar

We've opted to patch the `java.util.zip` package with [Jazzlib](http://jazzlib.sourceforge.net/),
a pure-Java third-party implementation.
Download [the classes][jazzlib] and copy them over the files in
`third_party/classes/java/util/zip/`.

Use [Coffeescript v1.3.3][coffee]:

    npm install -g coffee-script@1.3.3

Run `coffee -wc */*.coffee &` to auto-generate javascript sources if you make any changes to the code.

If you want to run the console-based frontend, you'll need the `optimist` node.js library:

    npm install optimist
   
To build the release copy of the code, you'll need [rdiscount][rdisc] as well.

Finally, to ensure that everything is set up properly, run:

    make test

[coffee]: http://coffeescript.org/
[rdisc]: https://github.com/rtomayko/rdiscount
[jazzlib]: http://sourceforge.net/projects/jazzlib/files/jazzlib/0.07/jazzlib-binary-0.07-juz.zip/download

Usage
-----

To run Doppio on localhost:

    make development
    tools/webrick.rb --dev

To get the optimized release version:

    make release
    tools/webrick.rb --release

Then point your browser to http://localhost:8000/.

The code can also be run from the console. For example:

    ./console/disassembler.coffee test/Fib.class
    ./console/runner.coffee test/Fib
    ./console/runner.coffee test/Fib --java=7  # passes an argument to the JVM

Testing
-------

Run the automated test-runner to check runtime and disassembler output:

    make test

The tests can take a while to complete, so consider running them in parallel (`make -j4`).
