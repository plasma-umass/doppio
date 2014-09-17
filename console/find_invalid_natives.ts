/// <reference path="../vendor/DefinitelyTyped/node/node.d.ts" />
/**
 * Checks which Doppio Native Methods are actually used in the version of the
 * Java Class Library that Doppio is using.
 *
 * Proposes similar candidates for these missing native methods, since
 * occasionally methods are renamed.
 * @todo Expose CLI for selecting the classpath. No args = default.
 */
import fs = require('fs');
import path = require('path');
import class_data = require('../src/ClassData');
import methods = require('../src/methods');
import util = require('../src/util');
import JVM = require('../src/jvm');
import os = require('os');
var ReferenceClassData = class_data.ReferenceClassData,
    classpath: string[] = [path.resolve(__dirname, '..', 'vendor', 'classes'),
                           path.resolve(__dirname, '..')],
    jvmObject: JVM;

/**
 * Implementation of Levenshtein distance.
 * @url http://en.wikibooks.org/wiki/Algorithm_Implementation/Strings/Levenshtein_distance#JavaScript
 */
function getEditDistance(a: string, b: string): number {
  var matrix: number[][] = [], i: number, j: number;
  if (a.length == 0) return b.length;
  if (b.length == 0) return a.length;

  // increment along the first column of each row
  for(i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  // increment each column in the first row
  for(j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for(i = 1; i <= b.length; i++) {
    for(j = 1; j <= a.length; j++) {
      if(b.charAt(i-1) == a.charAt(j-1)) {
        matrix[i][j] = matrix[i-1][j-1];
      } else {
        matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, // substitution
                                Math.min(matrix[i][j-1] + 1, // insertion
                                         matrix[i-1][j] + 1)); // deletion
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Loads the given classname, parses the class file, and returns the method
 * signatures of all of the native methods in the class.
 * className should be in pkg/Name format, not pkg.Name.
 */
function getNativeSigs(className: string): string[] {
  var rv: string[] = [], i: number, p: string;
  for (i = 0; i < classpath.length; i++) {
    var klass: class_data.ReferenceClassData,
        klass_path: string = path.resolve(classpath[i], className + ".class"),
        methods: { [name: string]: methods.Method },
        method_name: string;
    if (fs.existsSync(klass_path)) {
      klass = new ReferenceClassData(fs.readFileSync(klass_path));
      methods = klass.get_methods();
      for (method_name in methods) {
        if (methods[method_name].access_flags["native"]) {
          rv.push(method_name);
        }
      }
    }
  }
  return rv;
}

/**
 * What it says on the tin. Returns an array of class names (in foo/bar/Baz
 * format) that have native methods implemented in Doppio.
 */
function getClassesWithImplementedNatives(): {[pkgName: string]: string[]} {
  var nativeImpls: { [clsName: string]: { [methSig: string]: Function } } = jvmObject.getNatives(),
      methods: {[pkgName: string]: string[]} = {};

  Object.keys(nativeImpls).forEach((clsName: string) => {
    methods[clsName] = Object.keys(nativeImpls[clsName]);
  });

  return methods;
}

/**
 * Given two arrays, returns any items in the first array that are not in the
 * second array.
 */
function missingFromArray(items: string[], arr: string[]): string[] {
  var rv: string[] = [], i: number;
  for (i = 0; i < items.length; i++) {
    if (arr.indexOf(items[i]) === -1) {
      rv.push(items[i]);
    }
  }
  return rv;
}

/**
 * Given a set of strings and a set of candidates, returns a map that maps
 * each string to the candidate with the shortest edit distance.
 */
function getSimilar(strs: string[], candidates: string[]): {[sig: string]: string} {
  var minEditDistance: number, bestCandidate: string, i: number, j: number,
      str: string, tmp: number, rv: {[sig: string]: string} = {};
  for (i = 0; i < strs.length; i++) {
    minEditDistance = 999999999999999;
    str = strs[i];
    for (j = 0; j < candidates.length; j++) {
      tmp = getEditDistance(str, candidates[j]);
      if (tmp < minEditDistance) {
        minEditDistance = tmp;
        bestCandidate = candidates[j];
      }
    }

    if (bestCandidate != null) {
      rv[str] = bestCandidate;
    } else {
      rv[str] = "";
    }
  }
  return rv;
}

function formatKlass(title: string, data: {[left: string]: string}): string {
  var left: string, right: string, output: string[] = [], i: number;
  // Determine the width of each column by finding the longest data item.
  output.push(title);
  for (left in data) {
    output.push("\n\tMissing: " + left);
    output.push("\n\tMatch? : " + data[left] + "\n");
  }

  return output.join('');
}

/**
 * Prints the result.
 */
function printResult(result: {[klassName: string]: {[sig: string]: string}}): void {
  var klassName: string, printed: boolean = false;
  for (klassName in result) {
    printed = true;
    if (result.hasOwnProperty(klassName)) {
      console.log(formatKlass(klassName, result[klassName]) + "\n");
    }
  }

  if (!printed) {
    console.log("All native method implementations match native methods in your class files.");
  }
}

/**
 * Main function.
 */
function main() {
  var implNatives: { [pkgName: string]: string[] } = getClassesWithImplementedNatives(),
      klassNatives: string[], klassImplNatives: string[], klassName: string,
      missingNatives: string[],
      similarMap: {[klassName: string]: {[sig: string]: string}} = {};
  for (klassName in implNatives) {
    if (implNatives.hasOwnProperty(klassName)) {
      klassNatives = getNativeSigs(klassName);
      klassImplNatives = implNatives[klassName];

      // See if any implemented natives are not in natives.
      missingNatives = missingFromArray(klassImplNatives, klassNatives);
      if (missingNatives.length > 0) {
        // Find candidates for the missing items.
        similarMap[klassName] = getSimilar(missingNatives, klassNatives);
      }
    }
  }
  printResult(similarMap);
}

new JVM({
  bootstrapClasspath: [path.resolve(__dirname, '../vendor/classes')],
  javaHomePath: path.resolve(__dirname, '../vendor/java_home'),
  extractionPath: path.resolve(os.tmpDir(), 'doppio_jars'),
  classpath: [],
  nativeClasspath: [path.resolve(__dirname, '../src/natives')]
}, function(err, _jvmObject: JVM) {
  jvmObject = _jvmObject;
  main();
});
