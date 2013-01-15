# About

Doppio is an implementation of the Java Virtual Machine that can run in just
about any reasonable JavaScript engine. The goal is to be able to run JVM
programs in the browser without any plug-ins, which means that any Java programs
running in it are safely sandboxed by the JavaScript engine. Doppio is written
in [CoffeeScript][coffeescript], which is a nice terse language that maps
directly into JavaScript.

Doppio is also the Italian word for 'double', and is another name for a double
espresso.

Doppio started out as the mid-term project for a [Graduate Systems
Seminar.][sys-sem] It has since taken on a life of its own, and is complete
enough to run the following programs:

* [GNU Diff][diff]
* [LZW compression][lzw]
* The Java 6 compiler
* [Kawa Scheme][kawa-scheme]
* [Rhino][rhino]
* Probably many more! Let us know if you find anything cool that runs in Doppio.

The code has been tested on the latest versions of Chrome, Firefox, Safari,
Opera, IE 9, IE 10, and Node, but should run in just about any browser.
Doppio should also work in IE 8, but may have some small frontend bugs that do
not interfere with JVM logic.

Check out the [demo!](http://int3.github.com/doppio)

-------------

# Notes on Architecture

### Library Support

Doppio was built with the goal of supporting as much of the Java Class Library
as possible. As the official Java Class Library is mostly implemented in Java,
Doppio uses the Java 6 JCL with reimplementations of any needed "native
methods", which were originally implemented in C, in CoffeeScript.

Doppio is designed to run both on the console and the browser. In the console
implementation, system calls are handled by Node.JS. In the browser, we emulate
a simple LocalStorage-backed filesystem with an API very similar to Node's, so
the same code can operate in both environments. If the browser does not support
LocalStorage, then the filesystem exists purely in memory and is cleared when
the user leaves the page.

Since LocalStorage has a storage limit of 5MB, Doppio's web frontend will only
store files created or modified by the user or by programs run by the user.
We do this to avoid storing massive amounts of JCL classes in the limited
storage available to us.

### Primitives

Emulating primitives was slightly tricky, since JavaScript only exposes the
64-bit double as its sole numeric primitive. Technically, you can also coax out
32-bit signed integers, which trivially map into JavaScript doubles.

Floats are slightly tricky; while the common case is handled nicely by a double,
there are some edge cases that need to be specifically addressed (mainly,
+/- infinity and underflow, which Doppio handles).

64-bit longs are tough. They cannot fit into the 52 bits of precision provided
by a double. Fortunately, this problem has already been tackled in the
[Google Closure library][long].

### Objects (Heap Management)

JVM objects are mapped to JS objects with the same field names, bundled inside a
larger object that contains some metadata. Instead of simulating an actual heap,
we pass JS object references around. Thus, garbage collection is automatically
handled by the JavaScript engine's GC. However, since Java methods like
`hashCode` require each `Object` to have a unique ID, we store an
auto-incremented `ref` field in each object's metadata that acts as an imaginary
heap address.

### Threads

We currently have a basic thread implementation in Doppio that should be mostly
spec-conformant. Since JavaScript is essentially single threaded, only one
thread runs at a time. At certain yield points, the running thread will pause
and will allow other threads to execute.

At the moment, these yield points occur only at the following times:

* Calling `interrupt()` or `yield()`.
* Starting a new thread.
* Waiting a thread on a lock (can be explicitly stated in the Java code, or
implicitly when entering a monitor-guarded method)

We hope to improve thread support in the next release to expand the amount of
programs that are compatible with Doppio.

### Asynchronicity

While developing Doppio, we had to balance two concerns: Java code performance,
and yielding the JavaScript thread often enough so the JavaScript engine does
not get angry at us!

In addition, since the browser DOM is largely asynchronous, we had to emulate
some blocking Java operations, such as standard input, in an asynchronous
fashion. And if we didn't yield the JavaScript thread after updating the DOM,
we quickly discovered that the user would not see the change until the next
time Doppio yielded the JavaScript thread.

We solved this by implementing a 'yield' construct: upon encountering a
blocking function, we throw a `YieldException` to pause the VM. This exception
would also contain the asynchronous function that we are waiting on, which
eventually calls the VM and resumes the program. We used this for standard
input operations, among other things.

In the next version of Doppio, we hope to isolate the JVM logic inside of a
WebWorker to prevent Doppio from monopolizing the main JavaScript thread. We
are already making great progress on this front, and look forward to when it is
complete!

### Interpreter Design

We have a class for each type of opcode in the JVM. Each bytecode instruction in
a method is translated into an object and placed into an array of instructions.
Running a method is a matter of jumping to the correct opcode, calling its
`run` method, and repeating until the method completes.

We had experimented with doing a giant `switch` statement, but we could not get
it to perform as well as the one-object-per-instruction design due to the large
number of JVM opcodes. We hope to perform more experiments in the future to
see if we can further increase the performance of the main interpreter loop.

-------------

# Roadmap

There is much more to do! We are currently trying to refine the JVM internals
before trying to bolt on a compilation engine.

Up next on our roadmap is:

* Improving threads support.
* Running the JVM in a WebWorker (if available) to prevent us from hogging the
main JavaScript thread.
* Refactoring core JVM logic for speed.
* Fixing any remaining bugs in JVM logic (e.g. right now, custom classloaders
do not work properly).
* Architecting the core JVM so we can eventually implement JIT compilation on
a per-method basis. There are a number of concerns that we have to deal with
before this will be possible.

Once we deal with those issues, we'll start looking into per-method JIT
compilation and control-flow reconstruction (since we're going from low level
bytecode to high level JavaScript). There is already a large body of work on
Java decompilation that we can leverage for this task, as well as things like
[Emscripten's 'Relooper' algorithm][emscripten]. Contributions are definitely
welcome!

-------------

# Credits

Doppio uses the [jQuery][jq] and [Underscore.js][under] libraries. Editing is
provided by the [Ace editor][ace], and the console is a fork based off [Chris
Done's jquery-console][jqconsole]. Layout is based off Twitter's
[Bootstrap][bootstrap].  The font for 'Doppio' is [Bitter][bitter] from Google
Web Fonts, and the coffee icon is by Maximilian Becker, from [The Noun
Project][tnp] collection.

Doppio itself is the work of [CJ Carey][cj], [Jez Ng][jez], [John Vilk][jvilk],
and [Jonny Leahey][jleahey], and is MIT Licensed.

[sys-sem]: http://plasma.cs.umass.edu/emery/grad-systems
[diff]: https://github.com/int3/doppio/blob/master/test/special/Diff.java
[lzw]: https://github.com/int3/doppio/blob/master/test/special/Lzw.java
[coffeescript]: http://coffeescript.org/
[kawa-scheme]: http://www.gnu.org/software/kawa/
[rhino]: https://developer.mozilla.org/en-US/docs/Rhino
[localstorage]: http://www.w3.org/TR/webstorage/#the-localstorage-attribute
[typed]: http://www.khronos.org/registry/typedarray/specs/latest/
[long]: http://closure-library.googlecode.com/svn/docs/class_goog_math_Long.html
[lookup]: https://github.com/int3/doppio/blob/a59ac5dd04157a24ad1ac57f380ad08a47d40b8c/src/util.coffee#L117
[emscripten]: http://dl.acm.org/citation.cfm?id=2048224
[jq]: http://jquery.com/
[under]: http://documentcloud.github.com/underscore/
[ace]: https://github.com/ajaxorg/ace
[jqconsole]: https://github.com/chrisdone/jquery-console
[bootstrap]: http://twitter.github.com/bootstrap/
[bitter]: http://www.google.com/webfonts/specimen/Bitter
[tnp]: http://thenounproject.com/
[jvilk]: https://github.com/jvilk
[cj]: https://github.com/perimosocordiae
[jez]: http://discontinuously.com/
[jleahey]: https://github.com/jleahey
