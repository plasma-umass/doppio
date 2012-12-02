Doppio: A JVM in Coffeescript
=============================

_Doppio_ is a double shot of espresso.
In this case it's also a JVM written in [Coffeescript](http://coffeescript.org/).

It began life as a [Mid-term project](http://plasma.cs.umass.edu/emery/grad-systems-project-1) 
for [CS 691ST, Spring 2012](http://plasma.cs.umass.edu/emery/grad-systems)
at [UMass Amherst](http://www.cs.umass.edu/).

To try Doppio now, head to the [live demo page](http://int3.github.com/doppio/).


Getting & Building the Code
---------------------------

    git clone https://github.com/int3/doppio.git
    cd doppio
    tools/setup.sh

Usage
-----

To run Doppio on localhost:

    make dev
    tools/webrick.rb --dev

To get the optimized release version:

    make release
    tools/webrick.rb --release

Then point your browser to [http://localhost:8000/](http://localhost:8000/).

The code can also be run from the console. For example:

    coffee -c */*.coffee
    console/disassembler.coffee classes/demo/Fib
    console/runner.coffee classes/demo/Fib
    console/runner.coffee classes/demo/Fib --java=7  # passes an argument to the JVM
    
To get the optimized version, use `make opt` instead of `coffee -c`. The optimized
build products can be found in `build/opt`.

Automated Rebuilding
--------------------

For `make opt`, we have

    bundle exec guard -i
    
For console debug mode, simply use `coffee -wc */*.coffee`.

The front-end currently lacks an auto-rebuild system.

Running Tests
-------------

Run all tests:

    make test -j4

Run a specific test:

    make classes/test/Strings.test

Note that running a specific test does _not_ cause a rebuild of the
Coffeescript code. You will have to manually ensure that the code is
up-to-date.
