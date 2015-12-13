"use strict";
import util = require('./util');
import ByteStream = require('./ByteStream');
import ConstantPool = require('./ConstantPool');
import enums = require('./enums');
import assert = require('./assert');
import global = require('./global');

declare var RELEASE: boolean;
if (typeof RELEASE === 'undefined') global.RELEASE = false;

export interface IAttributeClass {
  parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool, attrLen: number, name: string): IAttribute;
}

export interface IAttribute {
  getName(): string;
}

export interface IInnerClassInfo {
  innerInfoIndex: number;
  outerInfoIndex: number;
  innerNameIndex: number;
  innerAccessFlags: number;
}

export class ExceptionHandler implements IAttribute {
  public startPC: number;
  public endPC: number;
  public handlerPC: number;
  public catchType: string;
  constructor(startPC: number, endPC: number, handlerPC: number, catchType: string) {
    this.startPC = startPC;
    this.endPC = endPC;
    this.handlerPC = handlerPC;
    this.catchType = catchType;
  }
  public getName() {
    return 'ExceptionHandler';
  }
  public static parse(bytesArray: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    var startPC = bytesArray.getUint16(),
      endPC = bytesArray.getUint16(),
      handlerPC = bytesArray.getUint16(),
      cti = bytesArray.getUint16(),
      catchType = cti === 0 ? "<any>" : (<ConstantPool.ClassReference> constantPool.get(cti)).name;
    return new this(startPC, endPC, handlerPC, catchType);
  }
}

export class Code implements IAttribute {
  private maxStack: number;
  private maxLocals: number;
  public exceptionHandlers: ExceptionHandler[];
  private attrs: IAttribute[];
  private code: Buffer;

  constructor(maxStack: number, maxLocals: number, exceptionHandlers: ExceptionHandler[], attrs: IAttribute[], code: Buffer) {
    this.maxStack = maxStack;
    this.maxLocals = maxLocals;
    this.exceptionHandlers = exceptionHandlers;
    this.attrs = attrs;
    this.code = code;
  }

  public getName() {
    return 'Code';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    var maxStack = byteStream.getUint16(),
      maxLocals = byteStream.getUint16(),
      codeLen = byteStream.getUint32();
    if (codeLen === 0) {
      if (RELEASE) {
        throw "Error parsing code: Code length is zero";
      }
    }
    var code = byteStream.slice(codeLen).getBuffer(),
      exceptLen = byteStream.getUint16(),
      exceptionHandlers: ExceptionHandler[] = [];
    for (var i = 0; i < exceptLen; i++) {
      exceptionHandlers.push(<ExceptionHandler> ExceptionHandler.parse(byteStream, constantPool));
    }
    // yes, there are even attrs on attrs. BWOM... BWOM...
    var attrs = makeAttributes(byteStream, constantPool);
    return new this(maxStack, maxLocals, exceptionHandlers, attrs, code);
  }

  public getCode(): NodeBuffer {
    return this.code;
  }

  public getAttribute(name: string): IAttribute {
    for (var i = 0; i < this.attrs.length; i++) {
      var attr = this.attrs[i];
      if (attr.getName() === name) {
        return attr;
      }
    }
    return null;
  }
}

export interface ILineNumberTableEntry {
  startPC: number;
  lineNumber: number;
}

export class LineNumberTable implements IAttribute {
  private entries: ILineNumberTableEntry[];

  constructor(entries: ILineNumberTableEntry[]) {
    this.entries = entries;
  }

  public getName() {
    return 'LineNumberTable';
  }

  /**
   * Returns the relevant source code line number for the specified program
   * counter.
   */
  public getLineNumber(pc: number): number {
    var j: number, lineNumber = -1;
    // get the last line number before the stack frame's pc
    for (j = 0; j < this.entries.length; j++) {
      var entry = this.entries[j];
      if (entry.startPC <= pc) {
        lineNumber = entry.lineNumber;
      } else {
        // Further entries are past the PC.
        break;
      }
    }
    return lineNumber;
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    var entries: ILineNumberTableEntry[] = [];
    var lntLen = byteStream.getUint16();
    for (var i = 0; i < lntLen; i++) {
      var spc = byteStream.getUint16();
      var ln = byteStream.getUint16();
      entries.push({
        'startPC': spc,
        'lineNumber': ln
      });
    }
    return new this(entries);
  }
}

export class SourceFile implements IAttribute {
  public filename: string;

  constructor(filename: string) {
    this.filename = filename;
  }

  public getName() {
    return 'SourceFile';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    return new this((<ConstantPool.ConstUTF8> constantPool.get(byteStream.getUint16())).value);
  }
}

export interface IStackMapTableEntry {
  type: enums.StackMapTableEntryType;
  offsetDelta: number;
  numLocals?: number;
  locals?: string[];
  numStackItems?: number;
  stack?: string[];
  k?: number;
}

export class StackMapTable implements IAttribute {
  private entries: IStackMapTableEntry[];

  constructor(entries: IStackMapTableEntry[]) {
    this.entries = entries;
  }

  public getName() {
    return 'StackMapTable';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    var numEntries = byteStream.getUint16(),
      entries: IStackMapTableEntry[] = [];
    for (var i = 0; i < numEntries; i++) {
      entries.push(this.parseEntry(byteStream, constantPool));
    }
    return new this(entries);
  }

  private static parseEntry(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IStackMapTableEntry {
    var frameType = byteStream.getUint8(), locals: string[],
      offsetDelta: number, i: number;
    if (frameType < 64) {
      return {
        type: enums.StackMapTableEntryType.SAME_FRAME,
        offsetDelta: frameType
      };
    } else if (frameType < 128) {
      return {
        type: enums.StackMapTableEntryType.SAME_LOCALS_1_STACK_ITEM_FRAME,
        offsetDelta: frameType - 64,
        stack: [this.parseVerificationTypeInfo(byteStream, constantPool)]
      };
    } else if (frameType < 247) {
      // reserved for future use
    } else if (frameType === 247) {
      return {
        type: enums.StackMapTableEntryType.SAME_LOCALS_1_STACK_ITEM_FRAME_EXTENDED,
        offsetDelta: byteStream.getUint16(),
        stack: [this.parseVerificationTypeInfo(byteStream, constantPool)]
      };
    } else if (frameType < 251) {
      return {
        type: enums.StackMapTableEntryType.CHOP_FRAME,
        offsetDelta: byteStream.getUint16(),
        k: 251 - frameType
      };
    } else if (frameType === 251) {
      return {
        type: enums.StackMapTableEntryType.SAME_FRAME_EXTENDED,
        offsetDelta: byteStream.getUint16()
      };
    } else if (frameType < 255) {
      offsetDelta = byteStream.getUint16();
      locals = [];
      for (i = 0; i < frameType - 251; i++) {
        locals.push(this.parseVerificationTypeInfo(byteStream, constantPool));
      }
      return {
        type: enums.StackMapTableEntryType.APPEND_FRAME,
        offsetDelta: offsetDelta,
        locals: locals
      };
    } else if (frameType === 255) {
      offsetDelta = byteStream.getUint16();
      var numLocals = byteStream.getUint16();
      locals = [];
      for (i = 0; i < numLocals; i++) {
        locals.push(this.parseVerificationTypeInfo(byteStream, constantPool));
      }
      var numStackItems = byteStream.getUint16();
      var stack: string[] = [];
      for (i = 0; i < numStackItems; i++) {
        stack.push(this.parseVerificationTypeInfo(byteStream, constantPool));
      }
      return {
        type: enums.StackMapTableEntryType.FULL_FRAME,
        offsetDelta: offsetDelta,
        numLocals: numLocals,
        locals: locals,
        numStackItems: numStackItems,
        stack: stack
      };
    }
  }

  private static parseVerificationTypeInfo(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): string {
    var tag = byteStream.getUint8();
    if (tag === 7) {
      var cls = (<ConstantPool.ClassReference> constantPool.get(byteStream.getUint16())).name;
      return 'class ' + (/\w/.test(cls[0]) ? util.descriptor2typestr(cls) : "\"" + cls + "\"");
    } else if (tag === 8) {
      return 'uninitialized ' + byteStream.getUint16();
    } else {
      var tagToType = ['bogus', 'int', 'float', 'double', 'long', 'null', 'this', 'object', 'uninitialized'];
      return tagToType[tag];
    }
  }
}

export interface ILocalVariableTableEntry {
  startPC: number;
  length: number;
  name: string;
  descriptor: string;
  ref: number;
}

export class LocalVariableTable implements IAttribute {
  private entries: ILocalVariableTableEntry[];

  constructor(entries: ILocalVariableTableEntry[]) {
    this.entries = entries;
  }

  public getName() {
    return 'LocalVariableTable';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    var numEntries = byteStream.getUint16(),
      entries: ILocalVariableTableEntry[] = [];
    for (var i = 0; i < numEntries; i++) {
      entries.push(this.parseEntries(byteStream, constantPool));
    }
    return new this(entries);
  }

  private static parseEntries(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): ILocalVariableTableEntry {
    return {
      startPC: bytes_array.getUint16(),
      length: bytes_array.getUint16(),
      name: (<ConstantPool.ConstUTF8> constant_pool.get(bytes_array.getUint16())).value,
      descriptor: (<ConstantPool.ConstUTF8> constant_pool.get(bytes_array.getUint16())).value,
      ref: bytes_array.getUint16()
    };
  }
}

export interface ILocalVariableTypeTableEntry {
  startPC: number;
  length: number;
  name: string;
  signature: string;
  index: number;
}

export class LocalVariableTypeTable implements IAttribute {
  public entries: ILocalVariableTypeTableEntry[];
  constructor(entries: ILocalVariableTypeTableEntry[]) {
    this.entries = entries;
  }
  public getName(): string {
    return 'LocalVariableTypeTable';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    var numEntries = byteStream.getUint16(), i: number,
      entries: ILocalVariableTypeTableEntry[] = [];
    for (i = 0; i < numEntries; i++) {
      entries.push(this.parseTableEntry(byteStream, constantPool));
    }
    return new this(entries);
  }

  private static parseTableEntry(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): ILocalVariableTypeTableEntry {
    return {
      startPC: byteStream.getUint16(),
      length: byteStream.getUint16(),
      name: (<ConstantPool.ConstUTF8> constantPool.get(byteStream.getUint16())).value,
      signature: (<ConstantPool.ConstUTF8> constantPool.get(byteStream.getUint16())).value,
      index: byteStream.getUint16()
    };
  }
}

export class Exceptions implements IAttribute {
  public exceptions: string[];

  constructor(exceptions: string[]) {
    this.exceptions = exceptions;
  }

  public getName() {
    return 'Exceptions';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    var numExceptions = byteStream.getUint16();
    var excRefs: number[] = [];
    for (var i = 0; i < numExceptions; i++) {
      excRefs.push(byteStream.getUint16());
    }
    return new this(excRefs.map((ref: number) => (<ConstantPool.ClassReference> constantPool.get(ref)).name));
  }
}

export class InnerClasses implements IAttribute {
  public classes: IInnerClassInfo[];

  constructor(classes: IInnerClassInfo[]) {
    this.classes = classes;
  }

  public getName() {
    return 'InnerClasses';
  }

  public static parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): IAttribute {
    var numClasses = bytes_array.getUint16(),
      classes: IInnerClassInfo[] = [];
    for (var i = 0; i < numClasses; i++) {
      classes.push(this.parseClass(bytes_array, constant_pool));
    }
    return new this(classes);
  }

  public static parseClass(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IInnerClassInfo {
    return {
      innerInfoIndex: byteStream.getUint16(),
      outerInfoIndex: byteStream.getUint16(),
      innerNameIndex: byteStream.getUint16(),
      innerAccessFlags: byteStream.getUint16()
    };
  }
}

export class ConstantValue implements IAttribute {
  public value: ConstantPool.IConstantPoolItem;

  constructor(value: ConstantPool.IConstantPoolItem) {
    this.value = value;
  }

  public getName() {
    return 'ConstantValue';
  }

  public static parse(bytes_array: ByteStream, constant_pool: ConstantPool.ConstantPool): IAttribute {
    var ref = bytes_array.getUint16();
    return new this(constant_pool.get(ref));
  }
}

export class Synthetic implements IAttribute {
  public getName() {
    return 'Synthetic';
  }
  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    return new this();
  }
}

export class Deprecated implements IAttribute {
  public getName() {
    return 'Deprecated';
  }
  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    return new this();
  }
}

export class Signature implements IAttribute {
  public sig: string;

  constructor(sig: string) {
    this.sig = sig;
  }

  public getName() {
    return 'Signature';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    return new this((<ConstantPool.ConstUTF8> constantPool.get(byteStream.getUint16())).value);
  }
}

export class RuntimeVisibleAnnotations implements IAttribute {
  public rawBytes: Buffer;
  public isHidden: boolean;
  public isCallerSensitive: boolean;
  public isCompiled: boolean;

  constructor(rawBytes: Buffer, isHidden: boolean, isCallerSensitive: boolean, isCompiled: boolean) {
    this.rawBytes = rawBytes;
    this.isHidden = isHidden;
    this.isCallerSensitive = isCallerSensitive;
    this.isCompiled = isCompiled;
  }

  public getName() {
    return 'RuntimeVisibleAnnotations';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool, attrLen: number): IAttribute {
    // No need to parse; OpenJDK parses these from within Java code from
    // the raw bytes.
    // ...but we need to look for the 'Hidden' annotation, which specifies if
    // the method should be omitted from stack frames.
    // And the 'compiled' annotation, which specifies if the method was
    // compiled.
    // And the 'CallerSensitive' annotation, which specifies that the function's
    // behavior differs depending on the caller.

    /**
     * Skip the current RuntimeVisibleAnnotation.
     */
    function skipAnnotation() {
      byteStream.skip(2); // type index
      var numValuePairs = byteStream.getUint16(),
        i: number;
      for (i = 0; i < numValuePairs; i++) {
        byteStream.skip(2); // element name index
        skipElementValue();
      }
    }

    /**
     * Skip this particular element value.
     */
    function skipElementValue() {
      var tag = String.fromCharCode(byteStream.getUint8());
      switch(tag) {
        case 'e':
          // Fall-through.
          byteStream.skip(2);
        case 'Z':
        case 'B':
        case 'C':
        case 'S':
        case 'I':
        case 'F':
        case 'J':
        case 'D':
        case 's':
        case 'c':
          byteStream.skip(2);
          break;
        case '@':
          skipAnnotation();
          break;
        case '[':
          var numValues = byteStream.getUint16(), i: number;
          for (i = 0; i < numValues; i++) {
            skipElementValue();
          }
          break;

      }
    }

    var rawBytes = byteStream.read(attrLen),
      isHidden = false, isCompiled = false, isCallerSensitive = false;
    byteStream.seek(byteStream.pos() - rawBytes.length);
    var numAttributes = byteStream.getUint16(), i: number;
    for (i = 0; i < numAttributes; i++) {
      var typeName = (<ConstantPool.ConstUTF8> constantPool.get(byteStream.getUint16()));
      // Rewind.
      byteStream.seek(byteStream.pos() - 2);
      skipAnnotation();
      switch (typeName.value) {
        case 'Ljava/lang/invoke/LambdaForm$Hidden;':
          isHidden = true;
          break;
        case 'Lsig/sun/reflect/CallerSensitive;':
          isCallerSensitive = true;
          break;
        case 'Lsig/java/lang/invoke/LambdaForm$Compiled':
          isCompiled = true;
          break;
      }
    }

    return new this(rawBytes, isHidden, isCallerSensitive, isCompiled);
  }
}

export class AnnotationDefault implements IAttribute {
  public rawBytes: Buffer;
  constructor(rawBytes: Buffer) {
    this.rawBytes = rawBytes;
  }

  public getName() {
    return 'AnnotationDefault';
  }
  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool, attrLen?: number): IAttribute {
    return new this(byteStream.read(attrLen));
  }
}

export class EnclosingMethod implements IAttribute {
  public encClass: ConstantPool.ClassReference;
  /**
   * Note: Is NULL if the current class is not immediately enclosed by a method
   * or a constructor.
   */
  public encMethod: ConstantPool.NameAndTypeInfo;
  constructor(encClass: ConstantPool.ClassReference, encMethod: ConstantPool.NameAndTypeInfo) {
    this.encClass = encClass;
    this.encMethod = encMethod;
  }

  public getName() {
    return 'EnclosingMethod';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    var encClass = (<ConstantPool.ClassReference> constantPool.get(byteStream.getUint16())),
      methodRef = byteStream.getUint16(), encMethod: ConstantPool.NameAndTypeInfo = null;
    if (methodRef > 0) {
      encMethod = <ConstantPool.NameAndTypeInfo> constantPool.get(methodRef);
      assert(encMethod.getType() === enums.ConstantPoolItemType.NAME_AND_TYPE, "Enclosing method must be a name and type info.");
    }
    return new this(encClass, encMethod);
  }
}

export class BootstrapMethods implements IAttribute {
  public bootstrapMethods: Array<[ConstantPool.MethodHandle, ConstantPool.IConstantPoolItem[]]>;
  constructor(bootstrapMethods: Array<[ConstantPool.MethodHandle, ConstantPool.IConstantPoolItem[]]>) {
    this.bootstrapMethods = bootstrapMethods;
  }

  public getName() {
    return 'BootstrapMethods';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute {
    var numBootstrapMethods = byteStream.getUint16(),
      bootstrapMethods: Array<[ConstantPool.MethodHandle, ConstantPool.IConstantPoolItem[]]> = [];
    for (var i = 0; i < numBootstrapMethods; i++) {
      var methodHandle = <ConstantPool.MethodHandle> constantPool.get(byteStream.getUint16());
      var numArgs = byteStream.getUint16();
      var args: ConstantPool.IConstantPoolItem[] = [];
      for (var j = 0; j < numArgs; j++) {
        args.push(constantPool.get(byteStream.getUint16()));
      }
      bootstrapMethods.push([methodHandle, args]);
    }
    return new this(bootstrapMethods);
  }
}

export class RuntimeVisibleParameterAnnotations implements IAttribute {
  public rawBytes: Buffer;
  constructor(rawBytes: Buffer) {
    this.rawBytes = rawBytes;
  }

  public getName() {
    return 'RuntimeVisibleParameterAnnotations';
  }

  public static parse(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool, attrLen: number): IAttribute {
    return new this(byteStream.read(attrLen));
  }
}

export function makeAttributes(byteStream: ByteStream, constantPool: ConstantPool.ConstantPool): IAttribute[]{
  var attrTypes: { [name: string]: IAttributeClass } = {
    'Code': Code,
    'LineNumberTable': LineNumberTable,
    'SourceFile': SourceFile,
    'StackMapTable': StackMapTable,
    'LocalVariableTable': LocalVariableTable,
    'LocalVariableTypeTable': LocalVariableTypeTable,
    'ConstantValue': ConstantValue,
    'Exceptions': Exceptions,
    'InnerClasses': InnerClasses,
    'Synthetic': Synthetic,
    'Deprecated': Deprecated,
    'Signature': Signature,
    'RuntimeVisibleAnnotations': RuntimeVisibleAnnotations,
    'AnnotationDefault': AnnotationDefault,
    'EnclosingMethod': EnclosingMethod,
    'BootstrapMethods': BootstrapMethods,
    'RuntimeVisibleParameterAnnotations': RuntimeVisibleParameterAnnotations
  };
  var numAttrs = byteStream.getUint16();
  var attrs : IAttribute[] = [];
  for (var i = 0; i < numAttrs; i++) {
    var name = (<ConstantPool.ConstUTF8> constantPool.get(byteStream.getUint16())).value;
    var attrLen = byteStream.getUint32();
    if (attrTypes[name] != null) {
      var oldLen = byteStream.size();
      var attr = attrTypes[name].parse(byteStream, constantPool, attrLen, name);
      var newLen = byteStream.size();
      assert((oldLen - newLen) <= attrLen, `A parsed attribute read beyond its data! ${name}`);
      if (oldLen - newLen !== attrLen) {
        byteStream.skip(attrLen - oldLen + newLen);
      }
      attrs.push(attr);
    } else {
      // we must silently ignore other attrs
      byteStream.skip(attrLen);
    }
  }
  return attrs;
}
