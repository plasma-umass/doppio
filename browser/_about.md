# About

Doppio is a project to get Java running in the browser without any plug-ins.
Right now it comprises a fairly complete VM and an implementation of the
`javap` bytecode disassembler.  (Doppio is also the Italian word for 'double',
and is another name for a double espresso.)

Doppio started out as the mid-term project for a [Graduate Systems
Seminar.][sys-sem] It has since taken on a life of its own, and is complete
enough to run implementations of [GNU Diff][diff], [LZW compression][lzw], and
the Java 4 compiler. Here's what's supported thus far:

* All 200 opcodes
* Exact emulation of Java's primitive types, include the 64-bit long
* Generics
* Most of the Reflection API
* File and Standard I/O
* Major JDK libraries such as String, Pattern, and HashMap.

The code has been tested on the latest versions of Chrome, Firefox, and Safari,
but should run on any browser that supports [LocalStorage][localstorage] and
[Typed Arrays][typed].

Check out the [demo!](.)

-------------

# Notes on Architecture

### Library Support

Doppio was built with the goal of supporting as much of the Java Class Library
as possible. Since a complete reimplementation would be prohibitive, we instead
trap the native method calls that most of the JCL relies on, emulating them in
Coffeescript. To make this emulation easier, we implemeted a quasi-DSL that
automatically converted our parameters and return values between Java and
Coffeescript (Javascript) types. Coffeescript's terseness definitely benefited
us here, making the result more readable than it would have been in plain
Javascript.

Doppio is designed to run both on the console and the browser. In the console
implementation, system calls are handled by Node.JS. In the browser, we emulate
a simple LocalStorage-backed filesystem with an API very similar to Node's, so
the same code can operate in both environments.

However, since LocalStorage has a storage limit of 5MB, we cannot store the
entire JCL in it. (It would also make for a slow download.) Instead we pre-load
a small, commonly-used subset of the JCL, and obtain the remainder as necessary
via AJAX requests to the server.

### Primitives

Emulating primitives was slightly tricky, since Javascript only exposes the
64-bit double as its sole numeric primitive. Ints and floats are easy enough to
emulate with a double, but large 64-bit longs can't fit into the 52 bits of
precision provided by a double. Fortunately, this problem has already been
tackled in the [Google Closure library][long].

### Objects (Heap Management)

JVM objects are mapped to JS objects with the same field names, bundled inside a
larger object that contains some metadata. Instead of simulating an actual heap,
we pass JS object references around. Thus, garbage collection is automatically
handled by the Javascript engine's GC. However, since Java methods like
`hashCode` require each `Object` to have a unique ID, we store an
auto-incremented `ref` field in each object's metadata that acts as an imaginary
heap address.

### Asynchronity

While we do not emulate threads, we still wanted to handle blocking operations,
particularly for standard input. Since the browser DOM is largely asynchronous,
blocking operations have to be emulated via async callbacks. We solved this by
implementing a 'yield' construct: upon encountering a blocking function, we
throw a `YieldException` to pause the VM. This exception would also contain the
asynchronous function that we are waiting on, which eventually calls the VM and
resumes the program.

Conversely, the browser does not expect most functions to take very long to
run, and so repainting does not occur until the event loop gets a chance to
spin. To allow the user to see output as it gets printed (instead of only at
program termination), printing to standard out was constructed as an
asynchronous function.

### Code Organization

We wished to collect the disassembler's logic in one place instead of spreading
it among all the opcode classes. In static languages, the Visitor pattern is
usually used to achieve this, but we can't employ it here since Coffeescript
lacks the necessary static typing and method overloading features. Instead, we
collected our opcode handlers in one hash table and then [traversed the
prototype chain ourselves][lookup]. However, since this is significantly slower
than a native traversal, the core VM code remains as a method on the opcode
itself.

-------------

# Roadmap

Improving speed is our next goal. Doppio currently interprets the bytecode
naively, fetching each one from a dict and executing them in turn. We aim to
gradually replace the interpreter by a compiler, which would remove the
overhead of decoding. It would also allow us to implement optimizations such as
the conversion of stack operations to direct assignments, as well as
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

Doppio itself is the work of [CJ Carey][cj], [Jez Ng][jez], and [Jonny
Leahey][jleahey], and is MIT Licensed.

[sys-sem]: http://plasma.cs.umass.edu/emery/grad-systems
[diff]: https://github.com/int3/doppio/blob/master/test/special/Diff.java
[lzw]: https://github.com/int3/doppio/blob/master/test/special/Lzw.java
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
[cj]: https://github.com/perimosocordiae
[jez]: http://discontinuously.com/
[jleahey]: https://github.com/jleahey
