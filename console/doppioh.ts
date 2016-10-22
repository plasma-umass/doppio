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
import {OptionParser, ParseType} from '../src/option_parser';
import * as path from 'path';
import * as fs from 'fs';
import {descriptor2typestr, int_classname, is_primitive_type} from '../src/util';
import {IClasspathItem, ClasspathFactory, IndexedClasspathJar, UnindexedClasspathJar} from '../src/classpath';
import {ReferenceClassData, ClassData, ArrayClassData, PrimitiveClassData} from '../src/ClassData';
import {ClassReference} from '../src/ConstantPool';
import {Method, Field} from '../src/methods';
import * as JVMTypes from '../includes/JVMTypes';
import * as JDKInfo from '../vendor/java_home/jdk.json';
import {TriState} from '../src/enums';
import * as async from 'async';

// Makes our stack traces point to the TypeScript source code lines.
require('source-map-support').install({
  handleUncaughtExceptions: true
});

let classpath: IClasspathItem[] = null,
  parser = new OptionParser(
    {
      default: {
        classpath: {
          type: ParseType.NORMAL_VALUE_SYNTAX,
          alias: 'cp',
          optDesc: ' <class search path of directories and zip/jar files>',
          desc: 'A : separated list of directories, JAR archives, and ZIP archives to search for class files.',
        },
        help: { alias: '?', desc: 'print this help message' },
        directory: {
          type: ParseType.NORMAL_VALUE_SYNTAX,
          alias: 'd',
          optDesc: ' <directory>',
          desc: 'Output directory'
        },
        javascript: {
          alias: 'js',
          desc: 'Generate JavaScript templates (Default is true)'
        },
        typescript: {
          alias: 'ts',
          desc: 'Generate TypeScript templates'
        },
        "doppiojvm-path": {
          type: ParseType.NORMAL_VALUE_SYNTAX,
          optDesc: ' <path to doppiojvm module>',
          alias: 'dpath',
          desc: "Path to the doppiojvm module. Defaults to 'doppiojvm', referring to the NPM module."
        },
        "force_headers": {
          type: ParseType.NORMAL_VALUE_SYNTAX,
          optDesc: ':[<classname>:]',
          alias: 'f',
          desc: '[TypeScript only] Forces doppioh to generate TypeScript headers for specified JVM classes',
        },
        "headers_only": {
          alias: 'ho',
          desc: '[TypeScript only] Only generate header file.'
        }
      }
    }
  );

function printEraseableLine(line: string): void {
  // Undocumented functions.
  if ((<any> process.stdout)['clearLine']) {
    (<any> process.stdout).clearLine();
    (<any> process.stdout).cursorTo(0);
    process.stdout.write(line);
  }
}

function printHelp(): void {
  process.stdout.write("Usage: doppioh [flags] class_or_package_names\n" + parser.help('default') + "\n");
}

// Remove "node" and "path/to/doppioh.js".
let parseResults = parser.parse(process.argv.slice(2)),
  args = parseResults['default'];

if (args.flag('help', false) || process.argv.length === 2) {
  printHelp();
  process.exit(1);
}

let outputDirectory = args.stringOption('directory', '.');

/**
 * java/lang/String.class => Ljava/lang/String;
 */
function file2desc(fname: string): string {
  return `L${fname.slice(0, fname.length - 6).replace(/\\/g, '/')};`;
}

let cache: {[desc: string]: ClassData} = {};
/**
 * Returns the classes in the given directory in descriptor format.
 */
function getClasses(item: string): string[] {
  let rv: string[] = [];
  // Find classpath items that contains this item as a directory.
  let cpItems: IClasspathItem[] = [];
  for (let i = 0; i < classpath.length; i++) {
    let searchedItem = item;
    let stat = classpath[i].tryStatSync(searchedItem);
    if (!stat) {
      searchedItem = `${item}.class`;
      stat = classpath[i].tryStatSync(searchedItem);
    }
    if (!stat) {
      continue;
    } else {
      if (!stat.isDirectory()) {
        // Files only counts if it is a class file.
        // Prevents an issue with the `doppio` shortcut counting as the `doppio` executable.
        if (path.extname(searchedItem) === '.class') {
          rv.push(file2desc(searchedItem));
        }
      } else {
        cpItems.push(classpath[i]);
      }
    }
  }
  if (rv.length === 0 && cpItems.length === 0) {
    throw new Error(`Unable to find resource ${item}.`);
  }

  if (cpItems.length > 0) {
    // Recursively process.
    let dirStack: string[] = [item];
    while (dirStack.length > 0) {
      let dir = dirStack.pop();
      for (let i = 0; i < cpItems.length; i++) {
       let dirListing = cpItems[i].tryReaddirSync(dir);
        if (dirListing === null) {
          continue;
        } else {
          for (let i = 0; i < dirListing.length; i++) {
            let item = dirListing[i];
            let itemPath = path.join(dir, item);
            if (path.extname(itemPath) === ".class") {
              rv.push(file2desc(itemPath));
            } else {
              dirStack.push(itemPath);
            }
          }
        }
      }
    }
  }
  return rv;
}

function loadClass(type: string): Buffer {
  for (let i = 0; i < classpath.length; i++) {
    let item = classpath[i];
    switch(item.hasClass(type)) {
      case TriState.INDETERMINATE:
      case TriState.TRUE:
        let buff = item.tryLoadClassSync(type);
        if (buff !== null) {
          return buff;
        }
        break;
    }
  }
  throw new Error(`Unable to find class ${type}`);
}

function findClass(descriptor: string): ClassData {
  if (cache[descriptor] !== undefined) {
    return cache[descriptor];
  }

  var rv: ClassData;
  try {
    switch(descriptor[0]) {
      case 'L':
        rv = new ReferenceClassData(loadClass(descriptor2typestr(descriptor)));
        // Resolve the class.
        var superClassRef = (<ReferenceClassData<JVMTypes.java_lang_Object>> rv).getSuperClassReference(),
          interfaceClassRefs = (<ReferenceClassData<JVMTypes.java_lang_Object>> rv).getInterfaceClassReferences(),
          superClass: ReferenceClassData<JVMTypes.java_lang_Object> = null,
          interfaceClasses: ReferenceClassData<JVMTypes.java_lang_Object>[] = [];
        if (superClassRef !== null) {
          superClass = <ReferenceClassData<JVMTypes.java_lang_Object>> findClass(superClassRef.name);
        }
        if (interfaceClassRefs.length > 0) {
          interfaceClasses = interfaceClassRefs.map((iface: ClassReference) => <ReferenceClassData<JVMTypes.java_lang_Object>> findClass(iface.name));
        }
        (<ReferenceClassData<JVMTypes.java_lang_Object>> rv).setResolved(superClass, interfaceClasses);
        break;
      case '[':
        rv = new ArrayClassData(descriptor.slice(1), null);
        break;
      default:
        rv = new PrimitiveClassData(descriptor, null);
        break;
    }
    cache[descriptor] = rv;
    return rv;
  } catch (e) {
    throw new Error(`Unable to read class file for ${descriptor}: ${e}\n${e.stack}`);
  }
}

function processClassData(stream: NodeJS.WritableStream, template: ITemplate, classData: ReferenceClassData<JVMTypes.java_lang_Object>) {
  var fixedClassName: string = classData.getInternalName().replace(/\//g, '_'),
    nativeFound: boolean = false;
  // Shave off L and ;
  fixedClassName = fixedClassName.substring(1, fixedClassName.length - 1);

  var methods = classData.getMethods();
  methods.forEach((method: Method) => {
    if (method.accessFlags.isNative()) {
      if (!nativeFound) {
        template.classStart(stream, fixedClassName);
        nativeFound = true;
      }
      template.method(stream, classData.getInternalName(), method.signature, method.accessFlags.isStatic(), method.parameterTypes, method.returnType);
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
 * TypeScript declaration file (JVMTypes.d.ts).
 */
class TSDeclarationFile {
  private headerCount: number = 0;
  private headerSet: { [clsName: string]: boolean} = {};
  private headerPath: string;
  private headerStream: NodeJS.WritableStream;
  private generateQueue: ReferenceClassData<JVMTypes.java_lang_Object>[] = [];
  private doppiojvmPath: string;

  constructor(doppiojvmPath: string, outputPath: string) {
    this.headerPath = path.resolve(outputPath, "JVMTypes.d.ts");
    this.doppiojvmPath = path.relative(outputPath, doppiojvmPath);
    // Parse existing types file for existing definitions. We'll remake them.
    try {
      var existingHeaders = fs.readFileSync(this.headerPath).toString(),
        searchIdx = 0, clsName: string;
      // Pass 1: Classes.
      while ((searchIdx = existingHeaders.indexOf("export class ", searchIdx)) > -1) {
        clsName = existingHeaders.slice(searchIdx + 13, existingHeaders.indexOf(" ", searchIdx + 13));
        if (clsName.indexOf("JVMArray") !== 0) {
          this.generateClassDefinition(this.tstype2jvmtype(clsName));
        }
        searchIdx++;
      }
      searchIdx = 0;
      // Pass 2: Interfaces.
      while ((searchIdx = existingHeaders.indexOf("export interface ", searchIdx)) > -1) {
        clsName = existingHeaders.slice(searchIdx + 17, existingHeaders.indexOf(" ", searchIdx + 17));
        this.generateClassDefinition(this.tstype2jvmtype(clsName));
        searchIdx++;
      }
    } catch (e) {
      // Ignore.
    }

    this.headerStream = fs.createWriteStream(this.headerPath);
    this.headersStart();
    // Generate required types.
    this.generateArrayDefinition();
    this.generateMiscDefinitions();
    this.generateClassDefinition('Ljava/lang/Throwable;');
    if (args.stringOption('force_headers', null)) {
      var clses = args.stringOption('force_headers', null).split(':');
      clses.forEach((clsName: string) => {
        this.generateClassDefinition(int_classname(clsName));
      });
    }
  }

  public headersStart(): void {
    this.headerStream.write(`// TypeScript declaration file for JVM types. Automatically generated by doppioh.
// http://github.com/plasma-umass/doppio
import * as DoppioJVM from '${this.doppiojvmPath.replace(/\\/g, '/')}';
import JVMThread = DoppioJVM.VM.Threading.JVMThread;
import Long = DoppioJVM.VM.Long;
import ClassData = DoppioJVM.VM.ClassFile.ClassData;
import ArrayClassData = DoppioJVM.VM.ClassFile.ArrayClassData;
import ReferenceClassData = DoppioJVM.VM.ClassFile.ReferenceClassData;
import Monitor = DoppioJVM.VM.Monitor;
import ClassLoader = DoppioJVM.VM.ClassFile.ClassLoader;
import Interfaces = DoppioJVM.VM.Interfaces;

declare module JVMTypes {\n`);
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

  private _processHeader(cls: ReferenceClassData<JVMTypes.java_lang_Object>): void {
      var desc = cls.getInternalName(),
        interfaces = cls.getInterfaceClassReferences().map((iface: ClassReference) => iface.name),
        superClass = cls.getSuperClassReference(),
        methods = cls.getMethods().concat(cls.getMirandaAndDefaultMethods()),
        fields = cls.getFields(),
        methodsSeen: { [name: string]: boolean } = {},
        injectedFields = cls.getInjectedFields(),
        injectedMethods = cls.getInjectedMethods(),
        injectedStaticMethods = cls.getInjectedStaticMethods();
      printEraseableLine(`[${this.headerCount++}] Processing header for ${descriptor2typestr(desc)}...`);

      if (cls.accessFlags.isInterface()) {
        // Interfaces map to TypeScript interfaces.
        this.headerStream.write(`  export interface ${this.jvmtype2tstype(desc, false)}`);
      } else {
        this.headerStream.write(`  export class ${this.jvmtype2tstype(desc, false)}`);
      }

      // Note: Interface classes have java.lang.Object as a superclass.
      // While java_lang_Object is a class, TypeScript will extract an interface
      // for the class under-the-covers and extract it, correctly providing us
      // with injected JVM methods on interface types (e.g. getClass()).
      if (superClass !== null) {
        this.headerStream.write(` extends ${this.jvmtype2tstype(superClass.name, false)}`);
      }

      if (interfaces.length > 0) {
        if (cls.accessFlags.isInterface()) {
          // Interfaces can extend multiple interfaces, and can extend classes!
          // Add a comma after the guaranteed "java_lang_Object".
          this.headerStream.write(`, `);
        } else {
          // Classes can implement multiple interfaces.
          this.headerStream.write(` implements `);
        }
        this.headerStream.write(`${interfaces.map((ifaceName: string) => this.jvmtype2tstype(ifaceName, false)).join(", ")}`);
      }

      this.headerStream.write(` {\n`);
      Object.keys(injectedFields).forEach((name: string) => this._outputInjectedField(name, injectedFields[name], this.headerStream));
      Object.keys(injectedMethods).forEach((name: string) => this._outputInjectedMethod(name, injectedMethods[name], this.headerStream));
      Object.keys(injectedStaticMethods).forEach((name: string) => this._outputInjectedStaticMethod(name, injectedStaticMethods[name], this.headerStream));
      fields.forEach((f) => this._outputField(f, this.headerStream));
      methods.forEach((m) => this._outputMethod(m, this.headerStream));
      cls.getUninheritedDefaultMethods().forEach((m) => this._outputMethod(m, this.headerStream));
      this.headerStream.write(`  }\n`);
  }

  /**
   * Converts a typestring to its equivalent TypeScript type.
   */
  public jvmtype2tstype(desc: string, prefix: boolean = true): string {
    switch(desc[0]) {
      case '[':
        return (prefix ? 'JVMTypes.' : '') + `JVMArray<${this.jvmtype2tstype(desc.slice(1), prefix)}>`;
      case 'L':
        // Ensure all converted reference types get generated headers.
        this.generateClassDefinition(desc);
        return  (prefix ? 'JVMTypes.' : '') + descriptor2typestr(desc).replace(/_/g, '__').replace(/\//g, '_');
      case 'J':
        return 'Long';
      case 'V':
        return 'void';
      default:
        // Primitives.
        return 'number';
    }
  }

  /**
   * Converts a TypeScript type into its equivalent JVM type.
   */
  private tstype2jvmtype(tsType: string): string {
    if (tsType.indexOf('JVMArray') === 0) {
      return `[${this.tstype2jvmtype(tsType.slice(9, tsType.length - 1))}`;
    } else if (tsType === 'number') {
      throw new Error("Ambiguous.");
    } else if (tsType === 'void') {
      return 'V';
    } else {
      // _ => /, and // => _ since we encode underscores as double underscores.
      return `L${tsType.replace(/_/g, '/').replace(/\/\//g, '_')};`;
    }
  }

  /**
   * Generates a TypeScript class definition for the given class object.
   */
  public generateClassDefinition(desc: string): void {
    if (this.headerSet[desc] !== undefined || is_primitive_type(desc)) {
      // Already generated, or is a primitive.
      return;
    } else if (desc[0] === '[') {
      // Ensure component type is created.
      return this.generateClassDefinition(desc.slice(1));
    } else {
      // Mark this class as queued for headerification. We use a queue instead
      // of a recursive scheme to avoid stack overflows.
      this.headerSet[desc] = true;
      this.generateQueue.push(<ReferenceClassData<JVMTypes.java_lang_Object>> findClass(desc));
    }
  }

  /**
   * Outputs a method signature for the given method on the given stream.
   * NOTE: We require a class argument because default interface methods are
   * defined on classes, not on the interfaces they belong to.
   */
  private _outputMethod(m: Method, stream: NodeJS.WritableStream, nonVirtualOnly: boolean = false) {
    var argTypes = m.parameterTypes,
      rType = m.returnType, args: string = "",
      cbSig = `e?: java_lang_Throwable${rType === 'V' ? "" : `, rv?: ${this.jvmtype2tstype(rType, false)}`}`,
      methodSig: string, methodFlags = `public${m.accessFlags.isStatic() ? ' static' : ''}`;

    if (argTypes.length > 0) {
      // Arguments are a giant tuple type.
      // NOTE: Long / doubles take up two argument slots. The second argument is always NULL.
      args = `args: [${argTypes.map((type: string, i: number) => `${this.jvmtype2tstype(type, false)}${(type === "J" || type === "D") ? ', any' : ''}`).join(", ")}]`;
    } else {
      args = `args: {}[]`;
    }

    methodSig = `(thread: JVMThread, ${args}, cb?: (${cbSig}) => void): void`;

    // A quick note about methods: It's illegal to have two methods with the
    // same signature in the same class, even if one is static and the other
    // isn't.
    if (m.cls.accessFlags.isInterface()) {
      if (m.accessFlags.isStatic()) {
        // XXX: We ignore static interface methods right now, as reconciling them with TypeScript's
        // type system would be messy. Also, they are brand new in Java 8.
      } else {
        // Virtual only, TypeScript interface syntax.
        stream.write(`    "${m.signature}"${methodSig};\n`);
      }
    } else {
      if (!nonVirtualOnly) {
        stream.write(`    ${methodFlags} "${m.signature}"${methodSig};\n`);
      }
      stream.write(`    ${methodFlags} "${m.fullSignature}"${methodSig};\n`);
    }
  }

  /**
   * Outputs the field's type for the given field on the given stream.
   */
  private _outputField(f: Field, stream: NodeJS.WritableStream) {
    var fieldType = f.rawDescriptor, cls = f.cls;
    if (cls.accessFlags.isInterface()) {
      // XXX: Ignore static interface fields for now, as reconciling them with TypeScript's
      // type system would be messy.
      return;
    }

    if (f.accessFlags.isStatic()) {
      stream.write(`    public static "${descriptor2typestr(cls.getInternalName())}/${f.name}": ${this.jvmtype2tstype(fieldType, false)};\n`);
    } else {
      stream.write(`    public "${descriptor2typestr(cls.getInternalName())}/${f.name}": ${this.jvmtype2tstype(fieldType, false)};\n`);
    }
  }

  /**
   * Outputs information on a field injected by the JVM.
   */
  private _outputInjectedField(name: string, type: string, stream: NodeJS.WritableStream) {
    stream.write(`    public ${name}: ${type};\n`);
  }

  /**
   * Output information on a method injected by the JVM.
   */
  private _outputInjectedMethod(name: string, type: string, stream: NodeJS.WritableStream) {
    stream.write(`    public ${name}${type};\n`);
  }

  /**
   * Output information on a static method injected by the JVM.
   */
  private _outputInjectedStaticMethod(name: string, type: string, stream: NodeJS.WritableStream) {
    stream.write(`    public static ${name}${type};\n`);
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
    /**
     * NOTE: Our arrays are either JS arrays, or TypedArrays for primitive
     * types.
     */
    public array: T[];
    public getClass(): ArrayClassData<T>;
    /**
     * Create a new JVM array of this type that starts at start, and ends at
     * end. End defaults to the end of the array.
     */
    public slice(start: number, end?: number): JVMArray<T>;
  }\n`);
  }

  private generateMiscDefinitions(): void {
    this.headerStream.write(`  // Basic, valid JVM types.
  export type BasicType = number | java_lang_Object | Long;
  export type JVMFunction = (thread: JVMThread, args: BasicType[], cb: (e?: JVMTypes.java_lang_Object, rv?: BasicType) => void) => void;\n`);
  }
}

/**
 * TypeScript output template.
 */
class TSTemplate implements ITemplate {
  private classesSeen: string[] = [];
  private doppiojvmPath: string;
  public static declFile: TSDeclarationFile = null;
  constructor(doppiojvmPath: string, outputPath: string) {
    this.doppiojvmPath = path.relative(outputPath, doppiojvmPath);
    if (TSTemplate.declFile === null) {
      TSTemplate.declFile = new TSDeclarationFile(doppiojvmPath, outputPath);
    }
  }

  public getExtension(): string { return 'ts'; }
  public fileStart(stream: NodeJS.WritableStream): void {
    // Reference all of the doppio interfaces.
    stream.write(`import JVMTypes = require("./JVMTypes");
import DoppioJVM = require('${this.doppiojvmPath.replace(/\\/g, '/')}');
import JVMThread = DoppioJVM.VM.Threading.JVMThread;
import Long = DoppioJVM.VM.Long;
declare var registerNatives: (natives: any) => void;\n`);
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
    TSTemplate.declFile.generateClassDefinition(`L${className.replace(/_/g, "/")};`);
  }
  public classEnd(stream: NodeJS.WritableStream, className: string): void {
    stream.write("\n}\n");
  }
  public method(stream: NodeJS.WritableStream, classDesc: string, methodName: string, isStatic: boolean, argTypes: string[], rType: string): void {
    var trueRtype = TSTemplate.declFile.jvmtype2tstype(rType), rval = "";
    if (trueRtype === 'number') {
      rval = "0";
    } else if (trueRtype !== 'void') {
      rval = "null";
    }

    argTypes.concat([rType]).forEach((type: string) => {
      TSTemplate.declFile.generateClassDefinition(type);
    });

    stream.write(`
  public static '${methodName}'(thread: JVMThread${isStatic ? '' : `, javaThis: ${TSTemplate.declFile.jvmtype2tstype(classDesc)}`}${argTypes.length === 0 ? '' : ', ' + argTypes.map((type: string, i: number) => `arg${i}: ${TSTemplate.declFile.jvmtype2tstype(type)}`).join(", ")}): ${TSTemplate.declFile.jvmtype2tstype(rType)} {
    thread.throwNewException('Ljava/lang/UnsatisfiedLinkError;', 'Native method not implemented.');${rval !== '' ? `\n    return ${rval};` : ''}
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


const JAVA_HOME = path.resolve(__dirname, "../vendor/java_home");
let classpathPaths = JDKInfo.classpath.map((item) => path.resolve(JAVA_HOME, item)).concat(args.stringOption('classpath', '.').split(':'));
let classNames = args.unparsedArgs();
if (classNames.length === 0) {
  throw new Error(`Must specify a class name.`);
}

if (!fs.existsSync(outputDirectory)) {
  fs.mkdirSync(outputDirectory);
}

// Initialize classpath.
ClasspathFactory(JAVA_HOME, classpathPaths, (items: IClasspathItem[]) => {
  // Normally, JARs are loaded asynchronously. Force them to be loaded, which allows us
  // to load classes synchronously.
  async.each(items, (item: IClasspathItem, cb: (e?: Error) => void) => {
    if (item instanceof UnindexedClasspathJar || item instanceof IndexedClasspathJar) {
      item.loadJar(cb);
    } else {
      cb();
    }
  }, (e?: Error) => {
    if (e) {
      throw e;
    }
    classpath = items;
    try {
      classNames.forEach((className) => {
        let targetName: string = className.replace(/\//g, '_').replace(/\./g, '_'),
          targetPath: string = className.replace(/\./g, '/');
        let template = args.flag('typescript', false) ? new TSTemplate(args.stringOption('doppiojvm-path', 'doppiojvm'), outputDirectory) : new JSTemplate();
        let stream = fs.createWriteStream(path.join(outputDirectory, targetName + '.' + template.getExtension()));
        template.fileStart(stream);
        let classes = getClasses(targetPath);
        for (let i = 0; i < classes.length; i++) {
          let desc = classes[i];
          processClassData(stream, template, <ReferenceClassData<JVMTypes.java_lang_Object>> findClass(desc));
        }
        template.fileEnd(stream);
        stream.end(new Buffer(''), () => {});
        if (args.flag('typescript', false) && args.flag('headers_only', false)) {
          fs.unlinkSync(path.join(outputDirectory, targetName + '.' + template.getExtension()));
        }
      });
      if (args.flag('typescript', false)) {
        TSTemplate.declFile.headersEnd();
      }
    } catch (e) {
      console.error(`Encountered error: ${e}`);
    }
  });
});
