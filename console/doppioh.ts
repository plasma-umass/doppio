/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/*
 * Doppioh is DoppioJVM's answer to javah, although we realize the 'h' no longer
 * has a meaning.
 *
 * Given a class or package name, Doppioh will generate JavaScript or TypeScript
 * templates for the native methods of that class or package.
 *
 * Options:
 * -classpath Where to search for classes/packages.
 * -d [dir]   Output directory
 * -js        JavaScript template [default]
 * -ts [dir]  TypeScript template, where 'dir' is a path to DoppioJVM's
 *            TypeScript definition files.
 */
import optparse = require('../src/option_parser');
import path = require('path');
import fs = require('fs');
import util = require('../src/util');
import ClassData = require('../src/ClassData');

/**
 * Initializes the option parser with the options for the `doppioh` command.
 */
function setupOptparse() {
  optparse.describe({
    standard: {
      classpath: {
        alias: 'cp',
        description: 'JVM classpath, "path1:...:pathN"',
        has_value: true
      },
      help: { alias: 'h', description: 'print this help message' },
      directory: {
        alias: 'd',
        description: 'Output directory',
        has_value: true
      },
      javascript: {
        alias: 'js',
        description: 'Generate JavaScript templates [default=true]'
      },
      typescript: {
        alias: 'ts',
        description: 'Generate TypeScript templates, -ts path/to/doppio/interfaces',
        has_value: true
      }
    }
  });
}

function printHelp(): void {
  process.stdout.write("Usage: doppioh [flags] class_or_package_name\n" + optparse.show_help() + "\n");
}

setupOptparse();

// Remove "node" and "path/to/doppioh.js".
var argv = optparse.parse(process.argv.slice(2));

if (argv.standard.help || process.argv.length === 2) {
  printHelp();
  process.exit(1);
}
if (!argv.standard.classpath) argv.standard.classpath = '.';
if (!argv.standard.directory) argv.standard.directory = '.';

function findFile(fileName: string): string {
  var i: number;
  for (i = 0; i < classpath.length; i++) {
    if (fs.existsSync(path.join(classpath[i], fileName))) {
      return path.join(classpath[i], fileName);
    } else if (fs.existsSync(path.join(classpath[i], fileName + '.class'))) {
      return path.join(classpath[i], fileName + '.class');
    }
  }
}

function getFiles(dirName: string): string[] {
  var rv = [], files = fs.readdirSync(dirName), i: number, file: string;
  for (i = 0; i < files.length; i++) {
    file = path.join(dirName, files[i]);
    if (fs.statSync(file).isDirectory()) {
      rv = rv.concat(getFiles(file));
    } else if (file.indexOf('.class') === (file.length - 6)) {
      rv.push(file);
    }
  }
  return rv;
}

function processClassData(stream: NodeJS.WritableStream, template: ITemplate, classData: ClassData.ReferenceClassData) {
  var fixedClassName: string = classData.this_class.replace(/\//g, '_'),
    nativeFound: boolean = false;
  // Shave off L and ;
  fixedClassName = fixedClassName.substring(1, fixedClassName.length - 1);

  var methods = classData.get_methods();
  for (var mname in methods) {
    if (methods.hasOwnProperty(mname)) {
      if (methods[mname].access_flags["native"]) {
        if (!nativeFound) {
          template.classStart(stream, fixedClassName);
          nativeFound = true;
        }
        var method = methods[mname];
        template.method(stream, mname, method.access_flags["static"], method.param_types, method.return_type);
      }
    }
  }

  if (nativeFound) {
    template.classEnd(stream, fixedClassName);
  }
}

/**
 * A Doppioh output template.
 */
interface ITemplate {
  getExtension(): string;
  fileStart(stream: NodeJS.WritableStream): void;
  fileEnd(stream: NodeJS.WritableStream): void;
  classStart(stream: NodeJS.WritableStream, className: string): void;
  classEnd(stream: NodeJS.WritableStream, className: string): void;
  method(stream: NodeJS.WritableStream, methodName: string, isStatic: boolean, argTypes: string[], rv: string): void;
}

/**
 * TypeScript output template.
 */
class TSTemplate implements ITemplate {
  private relativeInterfacePath: string;
  private classesSeen: string[] = [];
  constructor(outputPath: string, private interfacePath: string) {
    this.relativeInterfacePath = path.relative(outputPath, interfacePath);
  }
  public getExtension(): string { return 'ts'; }
  public fileStart(stream: NodeJS.WritableStream): void {
    // Reference all of the doppio interfaces.
    var srcInterfacePath: string = path.join(this.interfacePath, 'src'),
      files = fs.readdirSync(srcInterfacePath),
      i: number, file: string;
    for (i = 0; i < files.length; i++) {
      file = files[i];
      if (file.substring(file.length - 4) === 'd.ts') {
        // Strip off '.d.ts'.
        var modName = file.substring(0, file.length - 5);
        stream.write('import ' + modName + ' = require("' + path.join(this.relativeInterfacePath, 'src', modName).replace(/\\/g, '/') + '");\n');
      }
    }
  }
  public fileEnd(stream: NodeJS.WritableStream): void {
    var i: number;
    // Export everything!
    stream.write("\n// Export line. This is what DoppioJVM sees.\nregisterNatives({");
    for (i = 0; i < this.classesSeen.length; i++) {
      var kls = this.classesSeen[i];
      if (i > 0) stream.write(',');
      stream.write("\n  '" + kls.replace(/_/g, '/') + "': " + kls);
    }
    stream.write("\n});\n");
  }
  public classStart(stream: NodeJS.WritableStream, className: string): void {
    stream.write("\nclass " + className + " {\n");
    this.classesSeen.push(className);
  }
  public classEnd(stream: NodeJS.WritableStream, className: string): void {
    stream.write("\n}\n");
  }
  public method(stream: NodeJS.WritableStream, methodName: string, isStatic: boolean, argTypes: string[], rType: string): void {
    // Construct the argument signature, figured out from the methodName.
    var argSig: string = 'thread: threading.JVMThread', i: number;
    if (!isStatic) {
      argSig += ', javaThis: java_object.JavaObject';
    }
    for (i = 0; i < argTypes.length; i++) {
      argSig += ', arg' + i + ': ' + this.jvmtype2tstype(argTypes[i]);
    }
    stream.write("\n  public static '" + methodName + "'(" + argSig + "): " + this.jvmtype2tstype(rType) + " {\n");
    stream.write("    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');\n");

    var trueRtype = this.jvmtype2tstype(rType);
    if (trueRtype.indexOf('java_object') === 0 || trueRtype === 'gLong') {
      stream.write("    // Satisfy TypeScript return type.\n    return null;\n");
    } else if (trueRtype === 'number') {
      stream.write("    // Satisfy TypeScript return type.\n    return 0;\n");
    }
    stream.write("  }\n");
  }

  private jvmtype2tstype(jvmType: string): string {
    if (util.is_array_type(jvmType)) {
      return 'java_object.JavaArray';
    } else if (util.is_reference_type(jvmType)) {
      switch (jvmType) {
        case 'Ljava/lang/ClassLoader;':
          return 'java_object.JavaClassLoaderObject';
        case 'Ljava/lang/Class;':
          return 'java_object.JavaClassObject';
        default:
          return 'java_object.JavaObject';
      }
    } else {
      // Primitive type.
      switch (jvmType) {
        case 'B':
        case 'C':
        case 'D':
        case 'F':
        case 'I':
        case 'S':
          return 'number';
        case 'J':
          return 'gLong';
        case 'V':
          return 'void';
        case 'Z':
          // XXX: We should really probably use a boolean type at some point.
          return 'number';
        default:
          throw new Error('Invalid JVM primitive type: ' + jvmType);
      }
    }
  }
}

/**
 * JavaScript output template.
 */
class JSTemplate implements ITemplate {
  private firstMethod: boolean = true;
  private firstClass: boolean = true;
  public getExtension(): string { return 'js'; }
  public fileStart(stream: NodeJS.WritableStream): void {
    stream.write("// This entire object is exported. Feel free to define private helper functions above it.\nregisterNatives({");
  }
  public fileEnd(stream: NodeJS.WritableStream): void {
    stream.write("\n});\n");
  }
  public classStart(stream: NodeJS.WritableStream, className: string): void {
    this.firstMethod = true;
    if (this.firstClass) {
      this.firstClass = false;
    } else {
      stream.write(",\n");
    }
    stream.write("\n  '" + className.replace(/_/g, '/') + "': {\n");
  }
  public classEnd(stream: NodeJS.WritableStream, className: string): void {
    stream.write("\n\n  }");
  }
  public method(stream: NodeJS.WritableStream, methodName: string, isStatic: boolean, argTypes: string[], rType: string): void {
    // Construct the argument signature, figured out from the methodName.
    var argSig: string = 'thread', i: number;
    if (!isStatic) {
      argSig += ', javaThis';
    }
    for (i = 0; i < argTypes.length; i++) {
      argSig += ', arg' + i;
    }
    if (this.firstMethod) {
      this.firstMethod = false;
    } else {
      // End the previous method.
      stream.write(',\n');
    }
    stream.write("\n    '" + methodName + "': function(" + argSig + ") {");
    stream.write("\n      thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');");
    stream.write("\n    }");
  }
}

if (!fs.existsSync(argv.standard.directory)) {
  fs.mkdirSync(argv.standard.directory);
}

var classpath: string[] = argv.standard.classpath.split(':'),
  targetName: string = argv.className.replace(/\//g, '_').replace(/\./g, '_'),
  className: string = argv.className.replace(/\./g, '/'),
  template: ITemplate = argv.standard.typescript ? new TSTemplate(argv.standard.directory, argv.standard.typescript) : new JSTemplate(),
  stream: NodeJS.WritableStream = fs.createWriteStream(path.join(argv.standard.directory, targetName + '.' + template.getExtension())),
  targetLocation: string;


targetLocation = findFile(className);
if (typeof targetLocation !== 'string') {
  console.error('Unable to find location: ' + className);
  process.exit(0);
}

template.fileStart(stream);
if (fs.statSync(targetLocation).isDirectory()) {
  getFiles(targetLocation).forEach((cname: string) => {
    processClassData(stream, template, new ClassData.ReferenceClassData(fs.readFileSync(cname)));
  });
} else {
  processClassData(stream, template, new ClassData.ReferenceClassData(fs.readFileSync(targetLocation)));
}
template.fileEnd(stream);
stream.end(new Buffer(''), () => {
  process.exit(0);
});
