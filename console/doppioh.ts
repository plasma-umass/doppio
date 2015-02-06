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
import ConstantPool = require('../src/ConstantPool');
import methods = require('../src/methods');

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
      },
      force_headers: {
        alias: 'f',
        description: '[TypeScript only] Forces doppioh to generate TypeScript headers for specified JVM classes, e.g. -f java.lang.String:java.lang.Object',
        has_value: true
      }
    }
  });
}

function printEraseableLine(line: string): void {
  // Undocumented functions.
  if (process.stdout['clearLine']) {
    (<any> process.stdout).clearLine();
    (<any> process.stdout).cursorTo(0);
    process.stdout.write(line);
  }
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

var cache: {[desc: string]: ClassData.ClassData} = {};
function findClass(descriptor: string): ClassData.ClassData {
  if (cache[descriptor] !== undefined) {
    return cache[descriptor];
  }

  try {
    switch(descriptor[0]) {
      case 'L':
        return cache[descriptor] = new ClassData.ReferenceClassData(fs.readFileSync(findFile(util.descriptor2typestr(descriptor) + ".class")));
      case '[':
        return cache[descriptor] = new ClassData.ArrayClassData(descriptor.slice(1), null);
      default:
        return cache[descriptor] = new ClassData.PrimitiveClassData(descriptor, null);
    }
  } catch (e) {
    throw new Error(`Unable to read class file for ${descriptor}: ${e}\n${e.stack}`);
  }
}

function getFiles(dirName: string): string[] {
  var rv: string[] = [], files = fs.readdirSync(dirName), i: number, file: string;
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
  var fixedClassName: string = classData.getInternalName().replace(/\//g, '_'),
    nativeFound: boolean = false;
  // Shave off L and ;
  fixedClassName = fixedClassName.substring(1, fixedClassName.length - 1);

  var methods = classData.getMethods();
  methods.forEach((method: methods.Method) => {
    if (method.accessFlags.isNative()) {
      if (!nativeFound) {
        template.classStart(stream, fixedClassName);
        nativeFound = true;
      }
      template.method(stream, classData.getInternalName(), method.name + method.raw_descriptor, method.accessFlags.isStatic(), method.param_types, method.return_type);
    }
  });

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
  method(stream: NodeJS.WritableStream, classDesc: string, methodName: string, isStatic: boolean, argTypes: string[], rv: string): void;
}

/**
 * TypeScript output template.
 */
class TSTemplate implements ITemplate {
  private headerCount: number = 0;
  private relativeInterfacePath: string;
  private headerSet: { [clsName: string]: boolean} = {};
  private classesSeen: string[] = [];
  private headerPath: string = path.resolve(argv.standard.directory, "JVMTypes.d.ts");
  private headerStream: NodeJS.WritableStream;
  private generateQueue: ClassData.ReferenceClassData[] = [];
  constructor(outputPath: string, private interfacePath: string) {
    this.relativeInterfacePath = path.relative(outputPath, interfacePath);

    // Parse existing types file for existing definitions. We'll remake them.
    try {
      var existingHeaders = fs.readFileSync(this.headerPath).toString(),
        searchIdx = 0, clsName: string;
      // Pass 1: Classes.
      while ((searchIdx = existingHeaders.indexOf("export class ", searchIdx)) > -1) {
        clsName = existingHeaders.slice(searchIdx + 13, existingHeaders.indexOf(" ", searchIdx + 13));
        if (clsName.indexOf("JVMArray") !== 0) {
          this.generateClassDefinition(`L${clsName.replace(/_/g, '/')};`);
        }
        searchIdx++;
      }
      searchIdx = 0;
      // Pass 2: Interfaces.
      while ((searchIdx = existingHeaders.indexOf("export interface ", searchIdx)) > -1) {
        clsName = existingHeaders.slice(searchIdx + 17, existingHeaders.indexOf(" ", searchIdx + 17));
        this.generateClassDefinition(`L${clsName.replace(/_/g, '/')};`);
        searchIdx++;
      }
    } catch (e) {
      // Ignore.
    }

    this.headerStream = fs.createWriteStream(this.headerPath);
    this.headersStart();
    // Generate required types.
    this.generateArrayDefinition();
    this.generateClassDefinition('Ljava/lang/Throwable;');
    if (argv.standard.force_headers) {
      var clses = argv.standard.force_headers.split(':');
      clses.forEach((clsName: string) => {
        this.generateClassDefinition(util.int_classname(clsName));
      });
    }
  }
  public headersStart(): void {
    this.headerStream.write(`// TypeScript declaration file for JVM types. Automatically generated by doppioh.
// http://github.com/plasma-umass/doppio
import gLong = require("${path.join(this.relativeInterfacePath, 'src', 'gLong')}");
import threading = require("${path.join(this.relativeInterfacePath, 'src', 'threading')}");
import methods = require("${path.join(this.relativeInterfacePath, 'src', 'methods')}");
import java_object = require("${path.join(this.relativeInterfacePath, 'src', 'java_object')}");

declare module JVMTypes {\n`);
  }

  public getExtension(): string { return 'ts'; }
  public fileStart(stream: NodeJS.WritableStream): void {
    // Reference all of the doppio interfaces.
    var srcInterfacePath: string = path.join(this.interfacePath, 'src'),
      files = fs.readdirSync(srcInterfacePath),
      i: number, file: string;
    stream.write(`import JVMTypes = require("./JVMTypes");\n`);
    for (i = 0; i < files.length; i++) {
      file = files[i];
      if (file.substring(file.length - 4) === 'd.ts') {
        // Strip off '.d.ts'.
        var modName = file.substring(0, file.length - 5);
        stream.write('import ' + modName + ' = require("' + path.join(this.relativeInterfacePath, 'src', modName).replace(/\\/g, '/') + '");\n');
      }
    }
    stream.write(`\ndeclare var registerNatives: (natives: any) => void;\n`);
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
  /**
   * Emits TypeScript type declarations. Separated from fileEnd, since one can
   * use doppioh to emit headers only.
   */
  public headersEnd(): void {
    this._processGenerateQueue();
    // Print newline to clear eraseable line.
    printEraseableLine(`Processed ${this.headerCount} classes.\n`);
    this.headerStream.end(`}
export = JVMTypes;\n`, () => {});
  }
  public classStart(stream: NodeJS.WritableStream, className: string): void {
    stream.write("\nclass " + className + " {\n");
    this.classesSeen.push(className);
    this.generateClassDefinition(`L${className.replace(/_/g, "/")};`);
  }
  public classEnd(stream: NodeJS.WritableStream, className: string): void {
    stream.write("\n}\n");
  }
  public method(stream: NodeJS.WritableStream, classDesc: string, methodName: string, isStatic: boolean, argTypes: string[], rType: string): void {
    var trueRtype = this.jvmtype2tstype(rType), rval = "";
    if (trueRtype === 'number') {
      rval = "0";
    } else if (trueRtype !== 'void') {
      rval = "null";
    }

    argTypes.concat([rType]).forEach((type: string) => {
      this.generateClassDefinition(type);
    });

    stream.write(`
  public static '${methodName}'(thread: threading.JVMThread${isStatic ? '' : `, javaThis: ${this.jvmtype2tstype(classDesc)}`}${argTypes.length === 0 ? '' : ', ' + argTypes.map((type: string, i: number) => `arg${i}: ${this.jvmtype2tstype(type)}`).join(", ")}): ${this.jvmtype2tstype(rType)} {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');${rval !== '' ? `\n    return ${rval};` : ''}
  }\n`);
  }

  /**
   * Converts a typestring to its equivalent TypeScript type.
   */
  private jvmtype2tstype(desc: string, prefix: boolean = true): string {
    switch(desc[0]) {
      case '[':
      return (prefix ? 'JVMTypes.' : '') + `JVMArray<${this.jvmtype2tstype(desc.slice(1), prefix)}>`;
      case 'L':
      // Ensure all converted reference types get generated headers.
      this.generateClassDefinition(desc);
      return  (prefix ? 'JVMTypes.' : '') + util.descriptor2typestr(desc).replace(/\//g, '_');
      case 'J':
      return 'gLong';
      case 'V':
      return 'void';
      default:
      // Primitives.
      return 'number';
    }
  }

  /**
   * Generates a TypeScript class definition for the given class object.
   */
  private generateClassDefinition(desc: string): void {
    if (this.headerSet[desc] !== undefined || util.is_primitive_type(desc)) {
      // Already generated, or is a primitive.
      return;
    } else if (desc[0] === '[') {
      // Ensure component type is created.
      return this.generateClassDefinition(desc.slice(1));
    } else {
      // Mark this class as queued for headerification. We use a queue instead
      // of a recursive scheme to avoid stack overflows.
      this.headerSet[desc] = true;
      this.generateQueue.push(<ClassData.ReferenceClassData> findClass(desc));
    }
  }

  private _processHeader(cls: ClassData.ReferenceClassData): void {
      var desc = cls.getInternalName(),
        interfaces = cls.getInterfaceClassReferences().map((iface: ConstantPool.ClassReference) => findClass(iface.name)),
        superClass = cls.getSuperClassReference(),
        methods = cls.getMethods(),
        fields = cls.getFields(),
        methodsSeen: { [name: string]: boolean } = {},
        injectedFields = cls.getInjectedFields();
      printEraseableLine(`[${this.headerCount++}] Processing header for ${util.descriptor2typestr(desc)}...`);

      if (cls.accessFlags.isInterface()) {
        // Interfaces map to TypeScript interfaces.
        this.headerStream.write(`  export interface ${this.jvmtype2tstype(desc, false)}`);
      } else {
        this.headerStream.write(`  export class ${this.jvmtype2tstype(desc, false)}`);
      }

      if (!cls.accessFlags.isInterface() && superClass !== null) {
        this.headerStream.write(` extends ${this.jvmtype2tstype(superClass.name, false)}`);
      }

      if (interfaces.length > 0) {
        if (cls.accessFlags.isInterface()) {
          // Interfaces can extend multiple interfaces.
          this.headerStream.write(` extends `);
        } else {
          // Classes can implement multiple interfaces.
          this.headerStream.write(` implements `);
          // Quick scan for default methods.
          // NOTE: If we are processing an abstract class, then we also use this
          // to search for Miranda methods.
          // http://grepcode.com/file/repository.grepcode.com/java/root/jdk/openjdk/6-b14/sun/tools/java/ClassDefinition.java#1609
          var defaultMethods: { [sig: string]: methods.Method } = {};
          interfaces.forEach((iface: ClassData.ReferenceClassData) => {
            // Search iface and its superinterfaces.
            function processIface(iface: ClassData.ReferenceClassData) {
              iface.getInterfaceClassReferences().forEach((ifaceRef) => {
                processIface(<ClassData.ReferenceClassData> findClass(ifaceRef.name));
              });
              iface.getMethods().forEach((m: methods.Method) => {
                if (cls.accessFlags.isAbstract()) {
                  // Hack: If the class implementing the interface is abstract,
                  // we need to check for missing interface methods in the
                  // class. If they are missing, the JVM will add a stub method
                  // that throws an exception, thus it must be included in the
                  // type to satisfy the TypeScript interface. These are
                  // Miranda methods.
                  defaultMethods[m.name + m.raw_descriptor] = m;
                } else if (!m.accessFlags.isAbstract()) {
                  if (m.getCodeAttribute() != null) {
                    defaultMethods[m.name + m.raw_descriptor] = m;
                  }
                }
              });
            }
            processIface(iface);
          });
          // Remove any default methods with concrete instantiations in this
          // class or the super classes.
          function checkClass(cls: ClassData.ReferenceClassData) {
            cls.getMethods().forEach((m: methods.Method) => {
              var fullName = m.name + m.raw_descriptor;
              if (defaultMethods[fullName]) {
                delete defaultMethods[fullName];
              }
            });
            if (cls.getSuperClassReference() !== null) {
              checkClass(<ClassData.ReferenceClassData> findClass(cls.getSuperClassReference().name));
            }
          }
          checkClass(cls);
          // Append remaining default methods to the list of methods to output.
          methods = methods.concat(Object.keys(defaultMethods).map((key: string) => defaultMethods[key]));
        }
        this.headerStream.write(`${interfaces.map((iface: ClassData.ClassData) => this.jvmtype2tstype(iface.getInternalName(), false)).join(", ")}`);
      }

      this.headerStream.write(` {\n`);
      Object.keys(injectedFields).forEach((name: string) => this._outputInjectedField(name, injectedFields[name], this.headerStream));
      fields.forEach((f) => this._outputField(f, this.headerStream));
      methods.forEach((m) => this._outputMethod(cls, m, this.headerStream));
      this.headerStream.write(`  }\n`);
  }

  /**
   * Outputs a method signature for the given method on the given stream.
   * NOTE: We require a class argument because default interface methods are
   * defined on classes, not on the interfaces they belong to.
   */
  private _outputMethod(cls: ClassData.ReferenceClassData, m: methods.Method, stream: NodeJS.WritableStream) {
    var types = util.getTypes(m.raw_descriptor),
      argTypes = types.slice(0, types.length - 1),
      rType = types[types.length - 1], args: string = "",
      cbSig = `e?: java_lang_Throwable${rType === 'V' ? "" : `, rv?: ${this.jvmtype2tstype(rType, false)}`}`,
      methodSig: string;

    if (argTypes.length > 0) {
      // Arguments are a giant tuple type.
      args = "args: [" + argTypes.map((type: string, i: number) => `${this.jvmtype2tstype(type, false)}`).join(", ") + "], ";
    }

    methodSig = `(thread: threading.JVMThread, ${args}cb: (${cbSig}) => void): ${this.jvmtype2tstype(rType, false)}`;

    if (cls.accessFlags.isInterface()) {
      if (m.accessFlags.isStatic()) {
        // XXX: We ignore static interface methods right now, as reconciling them with TypeScript's
        // type system would be messy. Also, they are brand new in Java 8.
      } else {
        // Virtual only, TypeScript interface syntax.
        stream.write(`    "${m.name}${m.raw_descriptor}"${methodSig};\n`);
      }
    } else {
      if (m.accessFlags.isStatic()) {
        // Nonvirtual only.
        stream.write(`    public static "${util.descriptor2typestr(cls.getInternalName())}/${m.name}${m.raw_descriptor}"${methodSig};\n`);
      } else {
        // Virtual and nonvirtual.
        stream.write(`    public "${util.descriptor2typestr(cls.getInternalName())}/${m.name}${m.raw_descriptor}"${methodSig};
    public "${m.name}${m.raw_descriptor}"${methodSig};\n`);
      }
    }
  }

  /**
   * Outputs the field's type for the given field on the given stream.
   */
  private _outputField(f: methods.Field, stream: NodeJS.WritableStream) {
    var fieldType = f.raw_descriptor, cls = f.cls;
    if (cls.accessFlags.isInterface()) {
      // XXX: Ignore static interface fields for now, as reconciling them with TypeScript's
      // type system would be messy.
      return;
    }

    if (f.accessFlags.isStatic()) {
      stream.write(`    public static "${util.descriptor2typestr(cls.getInternalName())}/${f.name}": ${this.jvmtype2tstype(fieldType, false)};\n`);
    } else {
      stream.write(`    public "${util.descriptor2typestr(cls.getInternalName())}/${f.name}": ${this.jvmtype2tstype(fieldType, false)};\n`);
    }
  }

  /**
   * Outputs information on a field injected by the JVM.
   */
  private _outputInjectedField(name: string, type: string, stream: NodeJS.WritableStream) {
    stream.write(`    public ${name}: ${type};\n`);
  }

  private _processGenerateQueue(): void {
    while (this.generateQueue.length > 0) {
      this._processHeader(this.generateQueue.pop());
    }
  }

  /**
   * Generates the generic JVM array type definition.
   */
  private generateArrayDefinition(): void {
    this.headerStream.write(`  export class JVMArray<T> extends java_lang_Object {
    array: T[];
  }\n`);
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
  public method(stream: NodeJS.WritableStream, classDesc: string, methodName: string, isStatic: boolean, argTypes: string[], rType: string): void {
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
if (argv.standard.typescript) {
  (<TSTemplate> template).headersEnd();
}
stream.end(new Buffer(''), () => {});
