# Getting Started with DoppioJVM

So you want to hack on DoppioJVM: maybe to integrate it into your project more closely, or to add support for JVM features that are currently busted, or whatever your heart desires. Start here to save yourself a lot of head-scratching.

**Contents**:
 * [Plugging DoppioJVM into a Frontend](https://github.com/plasma-umass/doppio/tree/master/docs#plugging-doppiojvm-into-a-frontend)
 * [Adding Native Methods Using doppioh](https://github.com/plasma-umass/doppio/tree/master/docs#adding-native-methods-using-doppioh)

## Plugging DoppioJVM into a Frontend

As a full-featured JVM, DoppioJVM requires a number of files available at runtime to run properly. This guide will show you how to configure your environment to run DoppioJVM on your webpage.

### Step 0: Build `doppio.js`

Follow the instructions in [`README.md`](../README.md) to clone and build a `release` version of DoppioJVM. You will need the following files from the `build/release` directory when you deploy DoppioJVM:

* `doppio.js`: The actual fully-built doppio library.
* `vendor/java_home`: DoppioJVM's Java Home, which contains important classes and data files for the JVM to function.

### Step 1: Include and set up BrowserFS

DoppioJVM loads JAR files, class files, and other data from an emulated filesystem provided by [BrowserFS](https://github.com/jvilk/BrowserFS). Include it on your webpage before `doppio.js`.

BrowserFS can be configured to pull files from a variety of locations, but the simplest
file system downloads files from an HTTP server. We will use that in this guide.

Create a folder on your webserver containing the following directory structure:

* `doppio.js`
* `vendor/java_home`

Run `npm i -g browserfs` to install BrowserFS globally. Then, run `make_xhrfs_index` to
create a directory listing for the file system called `listings.json`:

```
$ make_xhrfs_index listings.json
```

Next, add the following JavaScript to your webpage to set up BrowserFS with:

* Temporary storage at `/tmp`
* Doppio's system files at `/sys`
* Writable storage at `/home`

```{html}
<script type="text/javascript" src="browserfs.min.js"></script>
<script type="text/javascript">
  // Wrap in a closure; don't pollute the global namespace.
  (function() {
    var mfs = new BrowserFS.FileSystem.MountableFileSystem(),
        fs = BrowserFS.BFSRequire('fs');
    BrowserFS.initialize(mfs);
    // Temporary storage.
    mfs.mount('/tmp', new BrowserFS.FileSystem.InMemory());
    // 10MB of writable storage
    // Use BrowserFS's IndexedDB file system for more storage.
    mfs.mount('/home', new BrowserFS.FileSystem.LocalStorage());
    // The first argument is the filename of the listings file
    // The second argument is the relative URL to the folder containing the listings file
    // and the data it indexes.
    // In this example, the listings file and DoppioJVM's data is at
    // <thiswebpage>/doppio/listings.json
    mfs.mount('/sys', new BrowserFS.FileSystem.XmlHttpRequest('listings.json', 'doppio'));
  })();
</script>
```

BrowserFS also supports a wide variety of browser-local storage technologies, including HTML5 and IndexedDB; cloud storage like Dropbox; zip files; and more! DoppioJVM is able to read files, classes, and native methods from any of these storage mediums through BrowserFS.

### Step 2: Invoking the JVM

DoppioJVM is a full-featured JVM. As such, you invoke DoppioJVM
on a class file with a `public static void main(String[] args)` method.
When that method completes, the JVM exits.

First, make sure you include `doppio.js` on your webpage:

```{html}
<script type="text/javascript" src="doppio.js"></script>
```

When you want to invoke the JVM, you can do so through a *command-line style* interface, or through a more traditional JavaScript interface. We'll describe the JavaScript interface first.

```{js}
// Start the JVM.
new Doppio.VM.JVM({
  // '/sys' is the path to a directory in the BrowserFS file system with:
  // * vendor/java_home/*
  doppioHomePath: '/sys',
  // Add the paths to your class and JAR files in the BrowserFS file system
  classpath: ['.', '/sys/myStuff.jar', '/sys/classes']
}, function(err, jvmObject) {
  // Called once initialization completes.
  // Run a particular class!
  // foo.bar.Baz *must* contain a public static void main method.
  jvm.runClass('foo.bar.Baz', ['argument1', 'argument2'], function(exitCode) {
    if (exitCode === 0) {
      // Execution terminated successfully
    } else {
      // Execution failed. :(
    }
  });

  // If you'd rather run a JAR file, you can do that, too! Put the JAR file as the only item in the
  // classpath, and then:
  jvmObject.runJar(['argument1', 'argument2'], function(exitCode) {
    // etc.
  });
  // The JAR must have a manifest that specifies a main class,
  // and that class must have a public static void main method.
});
```

Once the JVM exits, **do not re-use the JVM object**. Instead, spawn a new JVM
instance.

The *command-line style* interface emulates how you might invoke Java on the command line. For example, the command line `java -classpath classes classes.mypackage.MyClass 43` would look like the following:

```{js}
Doppio.VM.CLI(
  // Arguments to the 'java' command.
  ['-classpath', 'classes', 'classes.mypackage.MyClass', '43'],
{
  doppioHomePath: '/sys'
}, function(exitCode) {
  if (exitCode === 0) {
    // Class finished executing successfully.
  } else {
    // Execution failed. :(
  }
}, function(jvmObject) {
  // [Optional callback] Called once the JVM is instantiated.
});
```

Running `Doppio.VM.CLI(['-h'])` will print help information to standard out.
You can access most of DoppioJVM's configuration options using this interface.

The full set of configuration options to DoppioJVM are as follows:

```{js}
{
  /** IMPORTANT OPTIONS **/

  // [REQUIRED] The location of DoppioJVM's home in BrowserFS, containing:
  // * vendor/java_home/*
  doppioHomePath: string,
  // A location where the JVM can store temporary files. Defaults to /tmp.
  // Must be valid for programs that write to temporary files!
  tmpDir: string,
  // Non-JCL paths on the class path, e.g. [/path/to/my/classes]
  // These can be JAR files.
  classpath: string[],
  // Paths where native JVM methods are located in the BrowserFS file system,
  // e.g. [/sys/natives, /path/to/my/natives]
  // Defaults to [].
  nativeClasspath: string[],

  /** UNCOMMON OPTIONS **/

  // Responsiveness of JVM (expressed in milliseconds before a thread yields co-operatively)
  responsiveness?: number | () => number,
  // Enable assertions across all classes (if `true`) or
  // selected packages/classes
  // (see http://docs.oracle.com/javase/7/docs/technotes/guides/language/assert.html for syntax)
  enableAssertions?: boolean | string[],
  // Disable assertions on specific classes / packages
  // (see http://docs.oracle.com/javase/7/docs/technotes/guides/language/assert.html for syntax)
  disableAssertions?: string[],
  // True if assertions are enabled in system classes, false otherwise.
  // (equivalent to -esa command line option)
  enableSystemAssertions?: boolean,
  // A map containing any JVM properties you want to set.
  properties: {[name: string]: string}

  /** TYPICALLY REDUNDANT OPTIONS **/

  // Paths to the Java Class Library (JCL), e.g. [/sys/vendor/java_home/classes]
  // DoppioJVM figures this out from the doppioHomePath automatically
  bootstrapClasspath: string[],
  // Path to JAVA_HOME, e.g. /sys/vendor/java_home
  // DoppioJVM figures this out from the doppioHomePath automatically
  javaHomePath: string
}
```

## Standard out/error/input

Your webpage can easily hook into the JVM's standard out, standard error, and standard input streams:

```{js}
// Grab BrowserFS's 'process' module, which emulates NodeJS's process.
var process = BrowserFS.BFSRequire('process');
// Initialize TTYs; required if needed to be initialized immediately due to
// circular dependency issue.
// See: https://github.com/jvilk/bfs-process#stdinstdoutstderr
process.initializeTTYs();
process.stdout.on('data', function(data) {
  // data is a Node Buffer, which BrowserFS implements in the browser.
  // http://nodejs.org/api/buffer.html
  alert("Received the following output: " + data.toString());
});
process.stderr.on('data', function(data) {
  // data is a Node Buffer, which BrowserFS implements in the browser.
  // http://nodejs.org/api/buffer.html
  alert("Received the following error: " + data.toString());
});
// Write text to standard in.
process.stdin.write('Some text');
```

The JVM will print error messages to standard error (e.g. fatal exceptions), so you might want to hook into that stream for debugging purposes. Note that the data you receive on these streams is not neatly broken up, so if you redirect `stderr` to `console.error`, you could have many single character messages! You will want to introduce buffering to the nearest line before forwarding it to `console.error`:

```{js}
var process = BrowserFS.BFSRequire('process');
process.initializeTTYs();
var stdoutBuffer = '';
process.stdout.on('data', function(data) {
  stdoutBuffer += data.toString();
  var newlineIdx;
  while ((newlineIdx = stdoutBuffer.indexOf("\n")) > -1) {
    console.log(stdoutBuffer.slice(0, newlineIdx));
    stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
  }
});
var stderrBuffer = '';
process.stderr.on('data', function(data) {
  stderrBuffer += data.toString();
  var newlineIdx;
  while ((newlineIdx = stderrBuffer.indexOf("\n")) > -1) {
    console.error(stderrBuffer.slice(0, newlineIdx));
    stderrBuffer = stderrBuffer.slice(newlineIdx + 1);
  }
});
```

## Adding Native Methods Using `doppioh`

Native methods allow DoppioJVM to run JavaScript code from Java classes.
They're critical to the execution of the JVM, but they can also be used to provide web functionality to your Java programs.
For example, you might write a native method to pop up an alert message, or manipulate DOM elements, or anything else you can do with JavaScript.

### Step 1: Write a class with native methods

First, identify the native method that you want to write:
is it in the Java Class Library somewhere, or perhaps in some Java code you wrote?
For this example, we'll assume we wrote the file `classes/util/Test.java` like so:

```{java}
package classes.util;
class Test {
  static native int addTwo(int x);
  public static void main(String[] args) {
    System.out.println(addTwo(5));
  }
}
```

### Step 2: Generate native method stubs

DoppioJVM ships with a utility called `doppioh`, which we liken to the official [`javah`](http://docs.oracle.com/javase/7/docs/technotes/tools/windows/javah.html). Simply point it to a compiled class file `classes/util/Test.class` to generate a native method stub like so:

```
./doppioh -classpath . -d natives classes/util/Test
```

The above command will create the file `natives/classes_util_Test.js` with a stub for the native method `addTwo`. If you want to write your native methods in TypeScript, you can do that too:

```
./doppioh -classpath . -ts -d natives classes/util/Test
```

That command will create `natives/classes_util_Test.ts`, and a `JVMTypes.d.ts` containing type information for all of the JVM types it needs. It will depend on the `doppiojvm` NPM module, which the TypeScript compiler will automatically grab type information from if you have it installed as a dependency.

If you want to specify a custom path to the `doppiojvm` module, simply pass in `-doppiojvm-path path/to/doppiojvm.ts`.

You can also generate native method stubs for an *entire package*, e.g. `java.lang`:
```
./doppioh -classpath vendor/java_home/classes -d natives java.lang
```

... which will define the file `natives/java_lang.js`.

**ProTip**: Make sure you perform a `grunt release-cli` so you have a `doppioh` shortcut in your doppio directory. Alternatively, if you are using the NPM module, `npm install -g doppiojvm` will install `doppioh` on your PATH. However, if you are using DoppioJVM from the git repository, you should use the version of `doppioh` bundled with it.

### Step 3: Write native methods

Next, you'll need to write your native method implementation. Here's the stub generated by `doppioh`:

```{js}
registerNatives({
  'classes/util/Test': {
    'addTwo(I)I': function(thread, arg0) {
      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');
    }
  }
});
```

Let's implement that! Our method will add `2` to the specified integer, which is fairly straightforward:

```{js}
registerNatives({
  'classes/util/Test': {
    'addTwo(I)I': function(thread, arg0) {
      // The |0 ensures that we return a 32-bit integer quantity. :)
      return (arg0 + 2)|0;
    }
  }
});
```

### Step 4: Configure DoppioJVM with your natives

Now that you have a new native defined, you'll need to make sure that DoppioJVM can find it at runtime.

#### Node Frontend

With the Node frontend, specify the directories with the `-Xnative-classpath` option, delimited by colons (`:`), much like the regular classpath.

#### Browser Frontend: In-browser filesystem

For the browser frontend, you'll need to add the native method(s) to a directory in the in-browser filesystem,
and then change `nativeClasspath` to point to that directory.

The easiest way to add natives to the in-browser filesystem is to:

* Install BrowserFS globally if you haven't already: `npm i -g browserfs`
* In your built copy of DoppioJVM, create a directory called `natives`.
* Place your native method modules into that folder.
* Regenerate `listings.json` from the root built folder so that it includes your new natives: `make_xhrfs_index  listings.json`
* Change the `nativeClasspath` option to `['/sys/natives']`

Whenever you add a native or rename a native file, you will need to re-generate `listings.json`.

#### Browser Frontend: Ordinary JavaScript Script

If you want to avoid adding your native methods to the in-browser filesystem, you can define a native method module in
an ordinary JavaScript script included on the webpage and register it with DoppioJVM:

```{js}
DoppioJVM.registerNativeModule(function() {
  return {
    'classes/util/Test': {
      'addTwo(I)I': function(thread, arg0) {
        // The |0 ensures that we return a 32-bit integer quantity. :)
        return (arg0 + 2)|0;
      }
    }
  };
});
```

DoppioJVM will call this function every time a JVM instance is created to retrieve a fresh copy of the native methods.

### Asynchronous Native Methods

It's easy to write a DoppioJVM native method that invokes asynchronous browser functionality:

1. Put the DoppioJVM thread invoking your native method into the `ASYNC_WAITING` state.
2. Perform the desired operation.
3. When your operation completes, invoke the thread's `asyncReturn` function with the function's return value (if any), which will resume the thread with the specified return value.

Here's an example that 'sleeps' the thread for 50 milliseconds:

```{js}
// Native methods can reference DoppioJVM modules from the DoppioJVM global variable.
var ThreadStatus = DoppioJVM.VM.Enums.ThreadStatus;
registerNatives({
  'classes/util/Test': {
    'sleep50()V': function(thread) {
      // This informs the thread to ignore the return value from this JavaScript function.
      thread.setStatus(ThreadStatus.ASYNC_WAITING);
      // Sleep for 50 milliseconds.
      setTimeout(function() {
        // Wake up the thread by returning from this method.
        thread.asyncReturn();
      }, 50);
    }
  }
});
```

While this DoppioJVM thread is waiting for your sleep operation to complete, other DoppioJVM threads may run.

### Troubleshooting

If the above instructions aren't enough to get your native running, try looking at other native method implementations in `src/natives/*.ts`.
These contain examples of how to do all sorts of tricky things, like getting/setting fields on objects,
converting between JVM and JavaScript strings, working with `long` integers, and more.
