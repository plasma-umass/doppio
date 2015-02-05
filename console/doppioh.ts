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
  (<any> process.stdout).clearLine();
  (<any> process.stdout).cursorTo(0);
  process.stdout.write(line);
  // (<any> process.stdout).flush();
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
        return cache[descriptor] = new ClassData.ReferenceClassData(fs.readFileSync(findFile(util.descriptor2typestr(descriptor))));
      case '[':
        return cache[descriptor] = new ClassData.ArrayClassData(descriptor.slice(1), null);
      default:
        return cache[descriptor] = new ClassData.PrimitiveClassData(descriptor, null);
    }
  } catch (e) {
    console.log("Issue finding class for " + descriptor);
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
    // TODO: Revisit.
    /*try {
      var existingHeaders = fs.readFileSync(this.headerPath).toString();
      existingHeaders.match(/interface JVMClasses\.[^{\s]+ {/g).forEach((m: string) => {
        var iName = m.split(' ')[1].slice(11);
        console.log(`L${iName.replace(/_/g, "/")};`)
        this.generateClassDefinition(findClass(`L${iName.replace(/_/g, "/")};`));
      });
    } catch (e) {
      // Ignore.
    }*/

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
      return `JVMTypes.JVMArray<${this.jvmtype2tstype(desc.slice(1))}>`;
      case 'L':
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
      // Mark this class as queued for headerification.
      this.headerSet[desc] = true;
      this.generateQueue.push(<ClassData.ReferenceClassData> findClass(desc));
    }
  }

  private _processHeader(cls: ClassData.ReferenceClassData): void {
      var desc = cls.getInternalName(),
        interfaces = cls.getInterfaceClassReferences().map((iface: ConstantPool.ClassReference) => findClass(iface.name)),
      superClass = cls.getSuperClassReference();
      printEraseableLine(`[${this.headerCount++}] Processing header for ${util.descriptor2typestr(desc)}...`);

      cls.getInterfaceClassReferences().forEach((iface) => this.generateClassDefinition(iface.name));
      if (superClass !== null) {
        this.generateClassDefinition(superClass.name);
      }

      // TODO: Default methods.

      // Use a function expression so we can use 'this'.
      var generateMethodSignatures = (cls: ClassData.ClassData, isStatic: boolean = false): string => {
        return cls.getMethods().map((m: methods.Method) => {
          if (m.accessFlags.isStatic() === !isStatic) {
            return "";
          }
          var types = util.getTypes(m.raw_descriptor),
            typeSig = `(${types.slice(0, types.length - 1).map((type, i: number) => `arg${i}: ${this.jvmtype2tstype(type)}`).join(", ")}${types.length > 1 ? ', ' : ''}cb?: (e: JVMTypes.java_lang_Throwable${types[types.length - 1] === 'V' ? '' : `, rv: ${this.jvmtype2tstype(types[types.length - 1])}`}) => void): void`;

          types.forEach((type:  string) => {
            this.generateClassDefinition(type);
          });

          // Virtual and non-virtual method properties.
          return `${isStatic ? '' : `    public "${m.name}${m.raw_descriptor}"${typeSig};\n`}    public ${isStatic ? 'static ' : ''}"${util.descriptor2typestr(cls.getInternalName())}/${m.name}${m.raw_descriptor}"${typeSig};\n`;
        }).join("");
      }, generateTypedFields = (cls: ClassData.ClassData, isStatic: boolean = false): string => {
        return cls.getFields().map((f: methods.Field) => {
          if (f.accessFlags.isStatic() === !isStatic) {
            return "";
          }
          this.generateClassDefinition(f.raw_descriptor);
          return `    public ${isStatic ? 'static ' : ''}"${util.descriptor2typestr(cls.getInternalName())}/${f.name}": ${this.jvmtype2tstype(f.raw_descriptor)};\n`;
        }).join("");
      };

      function generateTypedStaticFields(cls: ClassData.ClassData): string {
        return generateTypedFields(cls, true);
      }
      function generateStaticMethodSignatures(cls: ClassData.ClassData): string {
        return generateMethodSignatures(cls, true);
      }

      this.headerStream.write(`  export class ${this.jvmtype2tstype(desc, false)} ${superClass !== null ? `extends ${this.jvmtype2tstype(superClass.name)}` : ''} {
${generateTypedStaticFields(cls)}
${generateStaticMethodSignatures(cls)}
${generateTypedFields(cls)}
${generateMethodSignatures(cls)}
  }\n`);
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
    this.headerStream.write(`  export interface JVMArray<T> extends java_lang_Object {
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
