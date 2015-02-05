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

var primCache: {[desc: string]: ClassData.PrimitiveClassData} = {};
function findClass(descriptor: string): ClassData.ClassData {
  switch(descriptor[0]) {
    case 'L':
      return new ClassData.ReferenceClassData(fs.readFileSync(findFile(util.descriptor2typestr(descriptor))));
    case '[':
      return new ClassData.ArrayClassData(descriptor.slice(1), null);
    default:
      if (!primCache[descriptor]) {
        primCache[descriptor] = new ClassData.PrimitiveClassData(descriptor, null);
      }
      return primCache[descriptor];
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
  private relativeInterfacePath: string;
  private headerMap: { [clsName: string]: string} = {};
  private staticHeaderMap: { [clsName: string]: string} = {};
  private classesSeen: string[] = [];
  private headerPath: string = path.resolve(argv.standard.directory, "JVMTypes.d.ts");
  constructor(outputPath: string, private interfacePath: string) {
    this.relativeInterfacePath = path.relative(outputPath, interfacePath);

    // Generate required types.
    this.generateArrayDefinition();
    this.generateClassDefinition(findClass('Ljava/lang/Throwable;'));
    if (argv.standard.force_headers) {
      var clses = argv.standard.force_headers.split(':');
      clses.forEach((clsName: string) => {
        this.generateClassDefinition(findClass(util.int_classname(clsName)));
      });
    }

    // Parse existing types file for existing definitions. We'll remake them.
    try {
      var existingHeaders = fs.readFileSync(this.headerPath).toString();
      existingHeaders.match(/interface JVMClasses\.[^{\s]+ {/g).forEach((m: string) => {
        var iName = m.split(' ')[1];
        console.log(`L${iName.replace(/_/g, "/")};`)
        this.generateClassDefinition(findClass(`L${iName.replace(/_/g, "/")};`));
      });
    } catch (e) {
      // Ignore.
    }
  }
  public getExtension(): string { return 'ts'; }
  public fileStart(stream: NodeJS.WritableStream): void {
    // Reference all of the doppio interfaces.
    var srcInterfacePath: string = path.join(this.interfacePath, 'src'),
      files = fs.readdirSync(srcInterfacePath),
      i: number, file: string;
    stream.write(`/// <reference path="JVMTypes.d.ts" />\n`);
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
  public emitHeaders(): void {
    fs.writeFileSync(this.headerPath, `// TypeScript declaration file for JVM types. Automatically generated by doppioh.
// http://github.com/plasma-umass/doppio

/**
 * Namespace for JVM class definitions. Does not include static fields and methods.
 */
declare module JVMClasses {
${Object.keys(this.headerMap).map((clsName: string) => this.headerMap[clsName]).join("")}
}

/**
 * Namespace for static JVM fields and methods.
 */
declare module JVMStatics{
${Object.keys(this.staticHeaderMap).map((clsName: string) => this.staticHeaderMap[clsName]).join("")}
}
`);
  }
  public classStart(stream: NodeJS.WritableStream, className: string): void {
    stream.write("\nclass " + className + " {\n");
    this.classesSeen.push(className);
  }
  public classEnd(stream: NodeJS.WritableStream, className: string): void {
    stream.write("\n}\n");
  }
  public method(stream: NodeJS.WritableStream, classDesc: string, methodName: string, isStatic: boolean, argTypes: string[], rType: string): void {
    var trueRtype = this.jvmtype2tstype(rType), rval = "";
    if (trueRtype === 'number') {
      rval = "number";
    } else if (trueRtype !== 'void') {
      rval = "null";
    }

    argTypes.concat(rType).forEach((type: string) => {
      this.generateClassDefinition(findClass(type));
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
      return `JVMClasses.JVMArray<${this.jvmtype2tstype(desc.slice(1))}>`;
      case 'L':
      return  (prefix ? 'JVMClasses.' : '') + util.descriptor2typestr(desc).replace(/\//g, '_');
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
  private generateClassDefinition(cls: ClassData.ClassData): void {
    var desc = cls.getInternalName();
    if (this.headerMap[desc] || util.is_primitive_type(desc)) {
      // Already generated, or is a primitive.
      return;
    } else if (desc[0] === '[') {
      // Ensure component type is created.
      return this.generateClassDefinition(findClass(cls.getInternalName().slice(1)));
    } else if (cls instanceof ClassData.ReferenceClassData) {
      // TODO: Get super class / interfaces. Extends / implements them.
      // TODO2: Still need to load interfaces. :/
      var interfaces = cls.getInterfaceClassReferences().map((iface: ConstantPool.ClassReference) => findClass(iface.name)),
      superClass = cls.getSuperClassReference();
      interfaces.forEach((iface) => this.generateClassDefinition(iface));
      if (superClass !== null) {
        this.generateClassDefinition(findClass(superClass.name));
      }

      // Use a function expression so we can use 'this'.
      var generateMethodSignatures = (cls: ClassData.ClassData, isStatic: boolean = false): string => {
        return cls.getMethods().map((m: methods.Method) => {
          if (m.accessFlags.isStatic() === !isStatic) {
            return "";
          }
          var types = util.getTypes(m.raw_descriptor),
            typeSig = `(${types.slice(0, types.length - 1).map((type, i: number) => `arg${i}: ${this.jvmtype2tstype(type)}`).join(", ")}${types.length > 1 ? ', ' : ''}cb?: (e: JVMClasses.java_lang_Throwable${types[types.length - 1] === 'V' ? '' : `, rv: ${this.jvmtype2tstype(types[types.length - 1])}`}) => void): void`;

          // Virtual and non-virtual method properties.
          return `${m.accessFlags.isStatic() ? '' : `    "${m.name}${m.raw_descriptor}"${typeSig};\n`}    "${util.descriptor2typestr(cls.getInternalName())}/${m.name}${m.raw_descriptor}"${typeSig};\n`;
        }).join("");
      }, generateTypedFields = (cls: ClassData.ClassData, isStatic: boolean = false): string => {
        return cls.getFields().map((f: methods.Field) => {
          if (f.accessFlags.isStatic() === !isStatic) {
            return "";
          }
          return `    "${util.descriptor2typestr(cls.getInternalName())}/${f.name}": ${this.jvmtype2tstype(f.raw_descriptor)};\n`;
        }).join("");
      };

      function generateTypedStaticFields(cls: ClassData.ClassData): string {
        return generateTypedFields(cls, true);
      }
      function generateStaticMethodSignatures(cls: ClassData.ClassData): string {
        return generateMethodSignatures(cls, true);
      }

      // Un-generated reference type.
      this.headerMap[desc] = `  interface ${this.jvmtype2tstype(desc, false)} ${superClass !== null ? `extends ${this.jvmtype2tstype(superClass.name)}` : ''} {
    constructor: JVMStatics.${this.jvmtype2tstype(desc, false)};
${generateTypedFields(cls)}
${generateMethodSignatures(cls)}
  }\n`;
      this.staticHeaderMap[desc] = `  interface ${this.jvmtype2tstype(desc, false)} {
${generateTypedStaticFields(cls)}
${generateStaticMethodSignatures(cls)}
  }\n`;
    }
  }

  /**
  * Generates the generic JVM array type definition.
  */
  private generateArrayDefinition(): void {
    this.headerMap['['] = `  interface JVMArray<T> extends java_lang_Object {
    array: T[];
  }\n`;
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
  (<TSTemplate> template).emitHeaders();
}
stream.end(new Buffer(''), () => {
  process.exit(0);
});
