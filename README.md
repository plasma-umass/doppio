Coffee-JVM: A JVM in Coffeescript
=================================
[Mid-term project](http://plasma.cs.umass.edu/emery/grad-systems-project-1) 
for [CS 691ST, Spring 2012](http://plasma.cs.umass.edu/emery/grad-systems).

Use the [wiki](https://github.com/int3/coffee-jvm/wiki) for TODOs, links to resources, etc.

Getting & Building the Code
---------------------------

After `git clone`, do

    git submodule --init --recursive

Use [Coffeescript v1.2.0](http://coffeescript.org/) (which is the default version you get from npm).
Run `coffee -wc */*.coffee &` to auto-gen scripts as you go.

Usage
-----

A browser frontend is available at `browser/coffee-jvm.html`.

The disassembler can also be used from the console. E.g.

    cat test/Println.class | coffee console/disassembler.coffee

Testing
-------

Check if the parser is doing the right thing by comparing the disassembler's
output with that of `javap`:

    javac test/Println.java
    javap -c -verbose test/Println > tmp1
    cat test/Println.class | coffee console/disassembler.coffee > tmp2
    tools/cleandiff.sh tmp1 tmp2

There will be a number of differences shown as we do not output everything that
javap does. However, differences in the constant pool and opcode sections are
probably indicative of bugs.
